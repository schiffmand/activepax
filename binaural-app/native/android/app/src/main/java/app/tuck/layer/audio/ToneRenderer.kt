// Tuck native engine — Android
// REFERENCE IMPLEMENTATION, NOT YET COMPILED (see model/Model.kt header).
//
// Pure-Kotlin DSP, the twin of native/ios/Tuck/ToneRenderer.swift and of the Web Audio graph in
// core/src/audio/engine.ts:
//
//   sin(left ear)  ─┐
//                   ├─ × TONE_HEADROOM ─┐
//   sin(right ear) ─┘                   ├─ × level × volumeGain × fade ─> interleaved L/R float
//   noise (L/R decorrelated) × gain ────┘
//
// No Android imports: it can be unit-tested on the JVM (render into a FloatArray and assert).
// The control thread posts commands into a lock-free queue; the audio writer thread drains it at the
// top of every buffer. Every parameter is a Ramp that retargets from its *current* value, so a new
// glide interrupting one in flight is continuous (no clicks, no zipper noise).

package app.tuck.layer.audio

import app.tuck.layer.model.NoiseColor
import app.tuck.layer.model.RampCurve
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Same constants as core/src/audio/engine.ts. Noise % is linear amplitude re the beat: 100% = as loud as the beat
 * (NOISE_FULL_GAIN on the RMS-matched streams), 25% = -12 dB. Worst case 0.5 + 0.9 × 2.11 before the user volume;
 * any volume up to MAX_CLEAN_VOLUME (about 0.61, Full is 0.42) stays under -1 dBFS, so no limiter is needed.
 */
const val TONE_HEADROOM = 0.5
const val NOISE_FULL_GAIN = 2.11

class Ramp(initial: Double) {
    var value = initial
        private set
    private var target = initial
    private var remaining = 0
    private var increment = 0.0
    private var ratio = 1.0
    private var exponential = false

    fun retarget(newTarget: Double, samples: Int, curve: RampCurve) {
        if (!newTarget.isFinite()) return
        if (curve == RampCurve.STEP || samples <= 0) {
            value = newTarget; target = newTarget; remaining = 0
            return
        }
        target = newTarget
        remaining = samples
        if (curve == RampCurve.EXPONENTIAL && value > 0 && newTarget > 0) {
            exponential = true
            ratio = (newTarget / value).pow(1.0 / samples)
        } else {
            exponential = false
            increment = (newTarget - value) / samples
        }
    }

    fun next(): Double {
        if (remaining > 0) {
            if (exponential) value *= ratio else value += increment
            if (--remaining == 0) value = target
        }
        return value
    }
}

/** mulberry32, bit-identical to core `mulberry32`. */
class Mulberry32(seed: Int) {
    private var a = seed
    fun next(): Double {
        a += 0x6D2B79F5
        var t = a
        t = (t xor (t ushr 15)) * (t or 1)
        t = t xor (t + ((t xor (t ushr 7)) * (t or 61)))
        return ((t xor (t ushr 14)).toLong() and 0xFFFFFFFFL).toDouble() / 4294967296.0
    }
}

/** Streaming noise voice (same algorithms as core/src/audio/noise.ts; no loop seam because it never loops). */
class NoiseVoice(private val color: NoiseColor, seed: Int) {
    private val rng = Mulberry32(seed)
    private var b0 = 0.0; private var b1 = 0.0; private var b2 = 0.0; private var b3 = 0.0
    private var b4 = 0.0; private var b5 = 0.0; private var b6 = 0.0
    private var last = 0.0
    private var dcX = 0.0; private var dcY = 0.0

    fun next(): Double {
        val w = rng.next() * 2 - 1
        val x = when (color) {
            NoiseColor.WHITE, NoiseColor.OFF -> w * 0.182 // loudness-matched (RMS 0.105)
            NoiseColor.PINK -> {
                b0 = 0.99886 * b0 + w * 0.0555179
                b1 = 0.99332 * b1 + w * 0.0750759
                b2 = 0.969 * b2 + w * 0.153852
                b3 = 0.8665 * b3 + w * 0.3104856
                b4 = 0.55 * b4 + w * 0.5329522
                b5 = -0.7616 * b5 - w * 0.016898
                val p = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.0934
                b6 = w * 0.115926
                p
            }
            NoiseColor.BROWN -> {
                last = (last + 0.02 * w) / 1.02
                last * 3.19
            }
        }
        val y = x - dcX + 0.9995 * dcY // DC blocker
        dcX = x; dcY = y
        return max(-0.9, min(0.9, y)) // the headroom budget assumes |noise| <= 0.9
    }
}

enum class RenderParam { LEFT_HZ, RIGHT_HZ, LEVEL, VOLUME_GAIN, FADE }

sealed interface RenderCommand {
    data class Ramp(val param: RenderParam, val target: Double, val samples: Int, val curve: RampCurve) : RenderCommand
    /** colorIndex: 0 white, 1 pink, 2 brown. gain is linear (noiseVolumeToGain, or noiseOnlyGain when the beat is off). */
    data class NoiseGain(val colorIndex: Int, val gain: Double, val samples: Int) : RenderCommand
    data class SwapChannels(val on: Boolean) : RenderCommand
    data object ResetPhase : RenderCommand
}

class ToneRenderer(val sampleRate: Int, leftHz: Double, rightHz: Double, level: Double, volumeGain: Double) {
    private val queue = ConcurrentLinkedQueue<RenderCommand>()

    private var phaseL = 0.0
    private var phaseR = 0.0
    private val left = Ramp(leftHz)
    private val right = Ramp(rightHz)
    private val level = Ramp(level)
    private val volumeGain = Ramp(volumeGain)
    private val fade = Ramp(0.0)
    private val noiseGains = arrayOf(Ramp(0.0), Ramp(0.0), Ramp(0.0))
    private val noiseL = arrayOf(NoiseVoice(NoiseColor.WHITE, 11), NoiseVoice(NoiseColor.PINK, 11), NoiseVoice(NoiseColor.BROWN, 11))
    private val noiseR = arrayOf(NoiseVoice(NoiseColor.WHITE, 23), NoiseVoice(NoiseColor.PINK, 23), NoiseVoice(NoiseColor.BROWN, 23))
    @Volatile private var swap = false

    /** Current fade value (read by the writer thread to know when a fade-out has reached silence). */
    val fadeValue: Double get() = fade.value

    fun samples(seconds: Double): Int = if (seconds.isFinite() && seconds > 0) (seconds * sampleRate).roundToInt() else 0

    /** Control thread. */
    fun send(cmd: RenderCommand) {
        queue.add(cmd)
    }

    private fun drain() {
        while (true) {
            when (val c = queue.poll() ?: return) {
                is RenderCommand.Ramp -> {
                    val gainCurve = if (c.curve == RampCurve.STEP) RampCurve.STEP else RampCurve.LINEAR
                    when (c.param) {
                        RenderParam.LEFT_HZ -> left.retarget(c.target, c.samples, c.curve)
                        RenderParam.RIGHT_HZ -> right.retarget(c.target, c.samples, c.curve)
                        RenderParam.LEVEL -> level.retarget(c.target, c.samples, gainCurve)
                        RenderParam.VOLUME_GAIN -> volumeGain.retarget(c.target, c.samples, gainCurve)
                        RenderParam.FADE -> fade.retarget(c.target, c.samples, gainCurve)
                    }
                }
                is RenderCommand.NoiseGain -> if (c.colorIndex in 0..2) noiseGains[c.colorIndex].retarget(c.gain, c.samples, RampCurve.LINEAR)
                is RenderCommand.SwapChannels -> swap = c.on
                RenderCommand.ResetPhase -> { phaseL = 0.0; phaseR = 0.0 }
            }
        }
    }

    /** Writer thread: fill `frames` interleaved stereo frames into `out` (size >= frames * 2). */
    fun render(out: FloatArray, frames: Int) {
        drain()
        val twoPi = 2 * PI
        val k = twoPi / sampleRate
        val swapNow = swap
        var j = 0
        for (i in 0 until frames) {
            phaseL += left.next() * k
            phaseR += right.next() * k
            if (phaseL >= twoPi) phaseL -= twoPi
            if (phaseR >= twoPi) phaseR -= twoPi
            var l = sin(phaseL) * TONE_HEADROOM
            var r = sin(phaseR) * TONE_HEADROOM
            for (c in 0..2) {
                val g = noiseGains[c].next()
                if (g > 0) {
                    l += noiseL[c].next() * g
                    r += noiseR[c].next() * g
                }
            }
            val master = level.next() * volumeGain.next() * perceptualFade(fade.next())
            val outL = (l * master).toFloat()
            val outR = (r * master).toFloat()
            out[j++] = if (swapNow) outR else outL
            out[j++] = if (swapNow) outL else outR
        }
    }
}

/**
 * Start/stop fades run in decibels, like core's rampFade: the fade ramp moves linearly from 0 to 1, and
 * this maps it to gain linearly in dB from −40 dB to 0 dB, with a short linear step from true silence to
 * −40 dB. An 8 to 60 s fade then sounds even, instead of jumping up early or hanging and then dropping.
 */
internal fun perceptualFade(p: Double): Double = when {
    p <= 0.0 -> 0.0
    p >= 1.0 -> 1.0
    p < 0.02 -> (p / 0.02) * 0.01
    else -> Math.pow(0.01, (1.0 - p) / 0.98)
}

