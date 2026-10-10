// Tuck native engine — Android
// REFERENCE IMPLEMENTATION, NOT YET COMPILED (see model/Model.kt header).
//
// Streams ToneRenderer output into an AudioTrack from a dedicated writer thread. Same transport and
// parameter API as the web core's BinauralEngine (core/src/audio/engine.ts).
//
// THE LAYER RULE ON ANDROID: this class never calls AudioManager.requestAudioFocus().
// - Spotify / podcasts / YouTube keep playing when we start (they hold focus; we never ask for it).
// - When they (re)gain focus later, nothing happens to us: the system only fades/notifies focus holders.
// - We don't create a MediaSession either, so the user's music app keeps the hardware / headset
//   play-pause keys and the media controls in the notification shade.
// The cost: no focus callbacks, so calls and headphone removal are detected separately
// (HeadphoneMonitor: ACTION_AUDIO_BECOMING_NOISY, AudioManager mode changes).
//
// Lessons carried over from the core's reviews: derived state is always recomputed; "noise off" keeps
// the remembered noise volume; stop() releases the AudioTrack (no silent rendering burning battery);
// every gain change, even an "instant" one, is a >= 30 ms ramp.

package app.tuck.layer.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.os.Process
import app.tuck.layer.model.Band
import app.tuck.layer.model.NoiseColor
import app.tuck.layer.model.NoiseSetting
import app.tuck.layer.model.RampCurve
import app.tuck.layer.model.clamp
import app.tuck.layer.model.earFrequencies
import app.tuck.layer.model.sanitizeTone
import app.tuck.layer.model.noiseVolumeToGain
import app.tuck.layer.model.volumeToGain
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.math.max

enum class EngineStatus { IDLE, PLAYING, PAUSED, STOPPING, INTERRUPTED }

data class EngineState(
    val status: EngineStatus = EngineStatus.IDLE,
    val beatHz: Double = 10.0,
    val carrierHz: Double = 200.0,
    /** Program envelope 0..1 (owned by ProgramRunner). */
    val level: Double = 1.0,
    /** User volume 0..1, perceptual (owned by the Depth control). */
    val volume: Double = 0.3,
    val noise: NoiseSetting = NoiseSetting(NoiseColor.OFF, 0.3),
    val swapChannels: Boolean = false,
) {
    val leftHz: Double get() = earFrequencies(carrierHz, beatHz).first
    val rightHz: Double get() = earFrequencies(carrierHz, beatHz).second
    val band: Band get() = Band.of(beatHz)
}

data class EngineStartParams(
    val beatHz: Double? = null,
    val carrierHz: Double? = null,
    val volume: Double? = null,
    val level: Double? = null,
    val noise: NoiseSetting? = null,
)

class BinauralEngine(
    /** Main-thread scope (the service's lifecycle scope). */
    private val scope: CoroutineScope,
    private val options: Options = Options(),
) {
    data class Options(
        val fadeInSec: Double = 2.5,
        val fadeOutSec: Double = 2.0,
        val pauseFadeSec: Double = 0.4,
        val glideSec: Double = 0.4,
        val gainStepSec: Double = 0.03,
        /** Frames per write. 1024 @ 48 kHz ≈ 21 ms. Larger = fewer wakeups = less battery. */
        val framesPerWrite: Int = 1024,
    )

    private val _state = MutableStateFlow(EngineState())
    val state: StateFlow<EngineState> = _state.asStateFlow()

    private var track: AudioTrack? = null
    private var renderer: ToneRenderer? = null
    private var writer: Thread? = null
    @Volatile private var writing = false
    private val pauseLock = Object()
    @Volatile private var writerPaused = false

    private var opSeq = 0
    private var pendingJob: Job? = null

    // ── graph ──

    private fun buildTrack(): AudioTrack {
        val sr = AudioTrack.getNativeOutputSampleRate(AudioManager.STREAM_MUSIC)
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
            .apply {
                // Binaural beats need each ear to get its own tone. Spatial audio / head tracking would
                // move and blend them, so opt this stream out of the spatializer (API 32+).
                if (Build.VERSION.SDK_INT >= 32) setSpatializationBehavior(AudioAttributes.SPATIALIZATION_BEHAVIOR_NEVER)
            }
            .build()
        val format = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
            .setSampleRate(sr)
            .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
            .build()
        val minBytes = AudioTrack.getMinBufferSize(sr, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_FLOAT)
        val wantBytes = options.framesPerWrite * 2 * 4 * 4 // four writes of headroom against scheduling jitter
        return AudioTrack.Builder()
            .setAudioAttributes(attrs)
            .setAudioFormat(format)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .setBufferSizeInBytes(max(minBytes, wantBytes))
            .setPerformanceMode(AudioTrack.PERFORMANCE_MODE_POWER_SAVING)
            .build()
    }

    private fun buildGraph() {
        if (track != null) return
        val t = buildTrack()
        val s = _state.value
        val (l, r) = earFrequencies(s.carrierHz, s.beatHz)
        val rend = ToneRenderer(t.sampleRate, l, r, s.level, volumeToGain(s.volume))
        rend.send(RenderCommand.SwapChannels(s.swapChannels))
        track = t
        renderer = rend
        applyNoise(s.noise, 0.0)
        writing = true
        writerPaused = false
        writer = Thread({ writeLoop(t, rend) }, "tuck-audio").apply { start() }
        t.play()
    }

    private fun writeLoop(t: AudioTrack, rend: ToneRenderer) {
        Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
        val frames = options.framesPerWrite
        val buf = FloatArray(frames * 2)
        while (writing) {
            synchronized(pauseLock) {
                while (writerPaused && writing) pauseLock.wait()
            }
            if (!writing) break
            rend.render(buf, frames)
            val n = t.write(buf, 0, buf.size, AudioTrack.WRITE_BLOCKING)
            if (n < 0) break // ERROR_DEAD_OBJECT etc.: the service rebuilds on the next start()
        }
    }

    private fun teardownGraph() {
        writing = false
        synchronized(pauseLock) { pauseLock.notifyAll() }
        track?.let {
            runCatching { it.pause(); it.flush(); it.stop() } // stop() unblocks a pending blocking write
        }
        writer?.join(500)
        track?.release()
        track = null
        writer = null
        renderer = null
    }

    private fun setWriterPaused(paused: Boolean) {
        val t = track ?: return
        if (paused) {
            writerPaused = true
            runCatching { t.pause() }
        } else {
            runCatching { t.play() }
            synchronized(pauseLock) {
                writerPaused = false
                pauseLock.notifyAll()
            }
        }
    }

    private fun gainSec(s: Double) = max(s, options.gainStepSec)

    private fun send(p: RenderParam, target: Double, sec: Double, curve: RampCurve) {
        val r = renderer ?: return
        r.send(RenderCommand.Ramp(p, target, r.samples(sec), curve))
    }

    private fun applyTone(sec: Double, curve: RampCurve) {
        val s = _state.value
        val (l, r) = earFrequencies(s.carrierHz, s.beatHz)
        send(RenderParam.LEFT_HZ, l, sec, curve)
        send(RenderParam.RIGHT_HZ, r, sec, curve)
    }

    private fun applyNoise(noise: NoiseSetting, fadeSec: Double) {
        val r = renderer ?: return
        val n = r.samples(gainSec(fadeSec))
        val target = if (noise.type == NoiseColor.OFF) 0.0 else noiseVolumeToGain(noise.volume)
        // Crossfade: the chosen colour ramps to its target, the others to 0.
        listOf(NoiseColor.WHITE, NoiseColor.PINK, NoiseColor.BROWN).forEachIndexed { i, c ->
            r.send(RenderCommand.NoiseGain(i, if (c == noise.type) target else 0.0, n))
        }
    }

    private fun setStatus(s: EngineStatus) = _state.update { it.copy(status = s) }

    /** "noise off" never zeroes the remembered volume (so turning noise back on is audible). */
    private fun nextNoiseVolume(type: NoiseColor, volume: Double?): Double {
        val v = volume?.takeIf { it.isFinite() } ?: _state.value.noise.volume
        return if (type == NoiseColor.OFF && v <= 0) _state.value.noise.volume else clamp(v, 0.0, 1.0)
    }

    // ── transport (main thread) ──

    /** Start or restart with a fade-in. Throws IllegalStateException if the AudioTrack can't be created. */
    fun start(p: EngineStartParams = EngineStartParams()) {
        opSeq++
        pendingJob?.cancel()
        val cur = _state.value
        val (beat, carrier) = sanitizeTone(p.beatHz ?: cur.beatHz, p.carrierHz ?: cur.carrierHz)
        val noise = p.noise?.let { NoiseSetting(it.type, nextNoiseVolume(it.type, it.volume)) } ?: cur.noise
        _state.value = cur.copy(
            beatHz = beat,
            carrierHz = carrier,
            volume = clamp(p.volume ?: cur.volume, 0.0, 1.0),
            level = clamp(p.level ?: cur.level, 0.0, 1.0),
            noise = noise,
        )
        val hadGraph = track != null
        if (hadGraph) {
            // Playing, paused or stopping: glide to the new values on the same track.
            applyTone(options.glideSec, RampCurve.EXPONENTIAL)
            send(RenderParam.VOLUME_GAIN, volumeToGain(_state.value.volume), gainSec(options.glideSec), RampCurve.LINEAR)
            send(RenderParam.LEVEL, _state.value.level, gainSec(options.glideSec), RampCurve.LINEAR)
            applyNoise(noise, options.glideSec)
            setWriterPaused(false)
        } else {
            buildGraph()
            applyNoise(noise, options.fadeInSec)
        }
        send(RenderParam.FADE, 1.0, options.fadeInSec, RampCurve.LINEAR)
        setStatus(EngineStatus.PLAYING)
    }

    /** Fade out, then release the AudioTrack. `onDone` runs on the main thread when silent. */
    fun stop(fadeSec: Double? = null, onDone: () -> Unit = {}) {
        val op = ++opSeq
        pendingJob?.cancel()
        if (track == null) {
            setStatus(EngineStatus.IDLE)
            onDone()
            return
        }
        val audible = _state.value.status == EngineStatus.PLAYING
        if (!audible) {
            teardownGraph()
            setStatus(EngineStatus.IDLE)
            onDone()
            return
        }
        val fade = max(0.0, fadeSec ?: options.fadeOutSec)
        send(RenderParam.FADE, 0.0, fade, RampCurve.LINEAR)
        setStatus(EngineStatus.STOPPING)
        pendingJob = scope.launch {
            delay(((fade + 0.1) * 1000).toLong())
            if (op != opSeq) return@launch // start() superseded the stop
            teardownGraph()
            setStatus(EngineStatus.IDLE)
            onDone()
        }
    }

    fun pause() {
        val s = _state.value.status
        if (s != EngineStatus.PLAYING && s != EngineStatus.INTERRUPTED) return
        val op = ++opSeq
        pendingJob?.cancel()
        send(RenderParam.FADE, 0.0, if (s == EngineStatus.PLAYING) options.pauseFadeSec else 0.0, RampCurve.LINEAR)
        setStatus(EngineStatus.PAUSED)
        pendingJob = scope.launch {
            delay(((options.pauseFadeSec + 0.1) * 1000).toLong())
            if (op == opSeq && _state.value.status == EngineStatus.PAUSED) setWriterPaused(true) // stop writing: saves battery
        }
    }

    fun resume() {
        val s = _state.value.status
        if ((s != EngineStatus.PAUSED && s != EngineStatus.INTERRUPTED) || track == null) return
        opSeq++
        pendingJob?.cancel()
        setWriterPaused(false)
        send(RenderParam.FADE, 1.0, options.fadeInSec, RampCurve.LINEAR)
        setStatus(EngineStatus.PLAYING)
    }

    /** A call started (AudioManager mode IN_CALL / IN_COMMUNICATION): fade out fast, never auto-resume. */
    fun interruptForCall() {
        if (_state.value.status != EngineStatus.PLAYING) return
        pause()
    }

    // ── parameters ──

    fun rampTo(beatHz: Double? = null, carrierHz: Double? = null, level: Double? = null, durationSec: Double? = null, curve: RampCurve = RampCurve.EXPONENTIAL) {
        val dur = max(0.0, durationSec ?: options.glideSec)
        val cur = _state.value
        val (beat, carrier) = sanitizeTone(beatHz ?: cur.beatHz, carrierHz ?: cur.carrierHz)
        val lvl = level?.takeIf { it.isFinite() }?.let { clamp(it, 0.0, 1.0) }
        _state.value = cur.copy(beatHz = beat, carrierHz = carrier, level = lvl ?: cur.level)
        if (beatHz != null || carrierHz != null) applyTone(dur, curve)
        if (lvl != null) send(RenderParam.LEVEL, lvl, if (curve == RampCurve.STEP || dur <= 0) options.gainStepSec else dur, RampCurve.LINEAR)
    }

    fun setVolume(volume: Double, glideSec: Double = options.glideSec) {
        if (!volume.isFinite()) return
        val v = clamp(volume, 0.0, 1.0)
        _state.update { it.copy(volume = v) }
        send(RenderParam.VOLUME_GAIN, volumeToGain(v), gainSec(glideSec), RampCurve.LINEAR)
    }

    fun setNoise(type: NoiseColor? = null, volume: Double? = null, fadeSec: Double = 1.5) {
        val t = type ?: _state.value.noise.type
        val next = NoiseSetting(t, nextNoiseVolume(t, volume))
        _state.update { it.copy(noise = next) }
        if (_state.value.status != EngineStatus.IDLE) applyNoise(next, fadeSec)
    }

    /** From the stereo check's 'swapped' verdict. */
    fun setSwapChannels(on: Boolean) {
        _state.update { it.copy(swapChannels = on) }
        renderer?.send(RenderCommand.SwapChannels(on))
    }

    fun release() {
        pendingJob?.cancel()
        teardownGraph()
        setStatus(EngineStatus.IDLE)
    }
}
