// Tealight native engine — Android
// REFERENCE IMPLEMENTATION, NOT YET COMPILED (see model/Model.kt header).
//
// Plays a Program (or a Preset via presetToProgram) on the BinauralEngine; the native twin of the
// core's ProgramPlayer (core/src/scheduler.ts), reduced to the essentials:
// - at each step boundary, one engine.rampTo(step.to, remaining, curve); the glide itself is
//   rendered per-sample by ToneRenderer, so coroutine timing jitter only shifts *when* a step starts;
// - elapsed time is monotonic (SystemClock.elapsedRealtime), never wall-clock;
// - pause freezes the program clock; a program/timer end fades out with the program's end fade.
// The service is a foreground service, so its main-thread coroutines keep running with the screen off.

package app.tealight.layer.service

import android.os.SystemClock
import app.tealight.layer.audio.BinauralEngine
import app.tealight.layer.audio.EngineStartParams
import app.tealight.layer.model.AutomationStep
import app.tealight.layer.model.CompiledProgram
import app.tealight.layer.model.NoiseColor
import app.tealight.layer.model.NoiseSetting
import app.tealight.layer.model.Program
import app.tealight.layer.model.compileProgram
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.max

class ProgramRunner(private val engine: BinauralEngine, private val scope: CoroutineScope) {
    enum class Status { IDLE, PLAYING, PAUSED, ENDING }

    var status = Status.IDLE
        private set
    var compiled: CompiledProgram? = null
        private set
    var onStep: ((AutomationStep) -> Unit)? = null
    var onEnded: ((completed: Boolean) -> Unit)? = null

    private var job: Job? = null
    private var nextStep = 0
    private var accumulatedMs = 0L
    private var runningSince: Long? = null
    private var timerSec: Double? = null

    val elapsedSec: Double
        get() = (accumulatedMs + (runningSince?.let { SystemClock.elapsedRealtime() - it } ?: 0L)) / 1000.0

    /** Seconds until the session ends on its own, or null if it holds indefinitely (for the notification). */
    val remainingSec: Double?
        get() = endAt()?.let { max(0.0, it + (compiled?.endFadeSec ?: 0.0) - elapsedSec) }

    fun play(program: Program, volume: Double? = null, timerSec: Double? = null) {
        job?.cancel()
        val c = compileProgram(program)
        compiled = c
        this.timerSec = timerSec?.takeIf { it.isFinite() && it > 0 }
        accumulatedMs = 0
        nextStep = 0
        // No noise bed: noise off, but keep the remembered volume (NaN = unchanged; core round-2 fix).
        val noise = c.startNoise ?: NoiseSetting(NoiseColor.OFF, Double.NaN)
        engine.start(EngineStartParams(c.start.beatHz, c.start.carrierHz, volume ?: program.volume, c.start.level, noise))
        runningSince = SystemClock.elapsedRealtime()
        status = Status.PLAYING
        loop()
    }

    fun pause() {
        if (status != Status.PLAYING) return
        freeze()
        job?.cancel()
        status = Status.PAUSED
        engine.pause()
    }

    fun resume() {
        val c = compiled ?: return
        if (status != Status.PAUSED) return
        engine.resume()
        runningSince = SystemClock.elapsedRealtime()
        status = Status.PLAYING
        val t = elapsedSec
        c.steps.lastOrNull { it.atSec <= t && t < it.atSec + it.durationSec }?.let { s ->
            engine.rampTo(s.to.beatHz, s.to.carrierHz, s.to.level, s.atSec + s.durationSec - t, s.curve)
        }
        loop()
    }

    fun stop(completed: Boolean = false, onDone: () -> Unit = {}) {
        if (status == Status.IDLE) return onDone()
        job?.cancel()
        freeze()
        status = Status.ENDING
        engine.stop(compiled?.endFadeSec) {
            status = Status.IDLE
            onEnded?.invoke(completed)
            onDone()
        }
    }

    private fun freeze() {
        runningSince?.let { accumulatedMs += SystemClock.elapsedRealtime() - it }
        runningSince = null
    }

    /** Program end (end == STOP) or sleep timer minus the end fade, whichever is first. */
    private fun endAt(): Double? {
        val c = compiled ?: return null
        return listOfNotNull(c.totalSec, timerSec?.let { max(0.0, it - c.endFadeSec) }).minOrNull()
    }

    private fun loop() {
        job = scope.launch {
            while (status == Status.PLAYING) {
                val c = compiled ?: return@launch
                val t = elapsedSec
                while (nextStep < c.steps.size && c.steps[nextStep].atSec <= t + 0.005) {
                    val s = c.steps[nextStep]
                    engine.rampTo(s.to.beatHz, s.to.carrierHz, s.to.level, max(0.0, s.atSec + s.durationSec - t), s.curve)
                    s.noise?.let { engine.setNoise(it.type, it.volume) }
                    onStep?.invoke(s)
                    nextStep++
                }
                val end = endAt()
                if (end != null && t >= end) {
                    stop(completed = true)
                    return@launch
                }
                val nextStart = c.steps.getOrNull(nextStep)?.atSec
                val due = listOfNotNull(nextStart, end).minOrNull() ?: return@launch // holds indefinitely
                delay(max(10L, ((due - t) * 1000).toLong()))
            }
        }
    }
}
