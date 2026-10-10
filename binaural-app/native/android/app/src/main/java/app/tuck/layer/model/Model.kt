// Tuck native engine — Android
// REFERENCE IMPLEMENTATION, NOT YET COMPILED. Written against Kotlin 2.0, AGP 8, minSdk 26,
// targetSdk 35, with kotlinx.serialization, but never built or run on a device. Treat it as a
// precise spec in code form, not as shipped code.
//
// Mirrors core/src/types.ts, presets.ts and programs.ts 1:1. JSON field names and enum values are
// identical to the TypeScript model, so presets/programs/history move between web and native as-is.
// If the TypeScript model changes, change this file in the same commit.

package app.tuck.layer.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.math.max
import kotlin.math.min

// ── Bands, noise, limits (core/src/types.ts) ──

/** Conventional EEG band label. Descriptive only: never a claim of effect. */
@Serializable
enum class Band {
    @SerialName("delta") DELTA,
    @SerialName("theta") THETA,
    @SerialName("alpha") ALPHA,
    @SerialName("beta") BETA,
    @SerialName("gamma") GAMMA;

    companion object {
        fun of(beatHz: Double): Band = when {
            beatHz < 4 -> DELTA
            beatHz < 8 -> THETA
            beatHz < 13 -> ALPHA
            beatHz < 30 -> BETA
            else -> GAMMA
        }
    }
}

/** TypeScript `NoiseType | 'off'`. */
@Serializable
enum class NoiseColor {
    @SerialName("off") OFF,
    @SerialName("white") WHITE,
    @SerialName("pink") PINK,
    @SerialName("brown") BROWN,
}

@Serializable
data class NoiseSetting(val type: NoiseColor, val volume: Double) {
    companion object {
        val OFF = NoiseSetting(NoiseColor.OFF, 0.25)
    }
}

@Serializable
enum class RampCurve {
    @SerialName("linear") LINEAR,
    @SerialName("exponential") EXPONENTIAL,
    @SerialName("step") STEP,
}

@Serializable
data class ToneTarget(val beatHz: Double, val carrierHz: Double, val level: Double)

object Limits {
    const val BEAT_MIN = 0.5
    const val BEAT_MAX = 45.0
    const val CARRIER_MIN = 40.0
    const val CARRIER_MAX = 1000.0
}

/** Same semantics as core `clamp`: NaN maps to the lower bound. */
fun clamp(v: Double, lo: Double, hi: Double): Double = if (v.isNaN()) lo else min(hi, max(lo, v))

/** Left ear = carrier - beat/2, right ear = carrier + beat/2. */
fun earFrequencies(carrierHz: Double, beatHz: Double): Pair<Double, Double> =
    (carrierHz - beatHz / 2) to (carrierHz + beatHz / 2)

/** Core `sanitizeTone`: clamp to limits and keep beat < carrier. */
fun sanitizeTone(beatHz: Double, carrierHz: Double): Pair<Double, Double> {
    val carrier = clamp(carrierHz, Limits.CARRIER_MIN, Limits.CARRIER_MAX)
    val beat = clamp(beatHz, Limits.BEAT_MIN, min(Limits.BEAT_MAX, carrier - 1))
    return beat to carrier
}

/** Perceptual volume -> linear gain (square law), as in core `volumeToGain`. */
fun volumeToGain(v: Double): Double {
    val c = clamp(v, 0.0, 1.0)
    return c * c
}

/** Noise % -> gain, as in core `noiseVolumeToGain`: one linear law, 100% = the beat's loudness, 25% = -12 dB re beat. */
fun noiseVolumeToGain(v: Double): Double = clamp(v, 0.0, 1.0) * 2.11

/** Noise only, loudness-matched to the layer it replaces (beat + noise), as in core `noiseOnlyGain`. */
fun noiseOnlyGain(v: Double): Double {
    val c = clamp(v, 0.0, 1.0)
    return kotlin.math.sqrt(1 + c * c) * 2.11
}

// ── Presets (core/src/presets.ts) ──

@Serializable
data class Preset(
    val id: String,
    val name: String,
    val tagline: String,
    val beatHz: Double,
    val carrierHz: Double,
    val volume: Double,
    val noise: NoiseSetting,
    val band: Band,
    val builtIn: Boolean,
    val tone: String? = null,
    val createdAt: Double? = null,
    val updatedAt: Double? = null,
)

private fun builtIn(id: String, name: String, tagline: String, beat: Double, carrier: Double, volume: Double, noise: NoiseSetting, tone: String) =
    Preset(id, name, tagline, beat, carrier, volume, noise, Band.of(beat), builtIn = true, tone = tone)

/** Must match BUILT_IN_PRESETS in core/src/presets.ts exactly (ids are persisted in favourites). */
val BUILT_IN_PRESETS: List<Preset> = listOf(
    builtIn("focus", "Focus", "A steady beta hum for getting into the work.", 16.0, 200.0, 0.3, NoiseSetting(NoiseColor.OFF, 0.25), "focus"),
    builtIn("deep-work", "Deep Work", "A 40 Hz gamma layer for long, absorbed stretches.", 40.0, 220.0, 0.28, NoiseSetting(NoiseColor.PINK, 0.2), "deep"),
    builtIn("calm", "Calm", "Alpha at 10 Hz — relaxed but awake.", 10.0, 180.0, 0.3, NoiseSetting(NoiseColor.OFF, 0.25), "calm"),
    builtIn("wind-down", "Wind Down", "Theta at 6 Hz for the end of the day.", 6.0, 160.0, 0.26, NoiseSetting(NoiseColor.PINK, 0.25), "wind"),
    builtIn("sleep", "Sleep", "Slow delta at 2 Hz under soft brown noise.", 2.0, 120.0, 0.22, NoiseSetting(NoiseColor.BROWN, 0.35), "sleep"),
)

// ── Programs (core/src/programs.ts) ──

@Serializable
data class ProgramSegment(
    val durationSec: Double,
    val beatHz: Double? = null,
    val carrierHz: Double? = null,
    val level: Double? = null,
    val curve: RampCurve? = null,
    val label: String? = null,
    /** Change the noise bed when this segment begins. */
    val noise: NoiseSetting? = null,
)

@Serializable
data class ProgramStart(val beatHz: Double, val carrierHz: Double, val level: Double? = null, val noise: NoiseSetting? = null)

@Serializable
enum class ProgramEnd {
    @SerialName("hold") HOLD,
    @SerialName("stop") STOP,
}

@Serializable
data class Program(
    val id: String,
    val name: String,
    val tagline: String? = null,
    val start: ProgramStart,
    val segments: List<ProgramSegment>,
    val end: ProgramEnd,
    val endFadeSec: Double? = null,
    val volume: Double? = null,
    val presetId: String? = null,
)

data class AutomationStep(
    val index: Int,
    val label: String?,
    val atSec: Double,
    val durationSec: Double,
    val from: ToneTarget,
    val to: ToneTarget,
    val curve: RampCurve,
    val noise: NoiseSetting?,
)

data class CompiledProgram(
    val programId: String,
    val start: ToneTarget,
    val startNoise: NoiseSetting?,
    val steps: List<AutomationStep>,
    val timedSec: Double,
    val end: ProgramEnd,
    val endFadeSec: Double,
    /** null when the program holds indefinitely. */
    val totalSec: Double?,
)

const val DEFAULT_END_FADE_SEC = 20.0

/** Pure compiler: program -> absolute-time automation schedule (core `compileProgram`). */
fun compileProgram(p: Program): CompiledProgram {
    val start = ToneTarget(p.start.beatHz, p.start.carrierHz, p.start.level ?: 1.0)
    val steps = ArrayList<AutomationStep>(p.segments.size)
    var at = 0.0
    var from = start
    p.segments.forEachIndexed { index, s ->
        val to = ToneTarget(s.beatHz ?: from.beatHz, s.carrierHz ?: from.carrierHz, s.level ?: from.level)
        val step = AutomationStep(index, s.label, at, max(0.0, s.durationSec), from, to, s.curve ?: RampCurve.EXPONENTIAL, s.noise)
        steps += step
        at += step.durationSec
        from = to
    }
    return CompiledProgram(p.id, start, p.start.noise, steps, at, p.end, p.endFadeSec ?: DEFAULT_END_FADE_SEC,
        if (p.end == ProgramEnd.STOP) at else null)
}

/** A preset is a program that starts at the preset and holds (core `presetToProgram`). */
fun presetToProgram(preset: Preset) = Program(
    id = "preset:${preset.id}", name = preset.name, tagline = preset.tagline,
    start = ProgramStart(preset.beatHz, preset.carrierHz, 1.0, preset.noise),
    segments = emptyList(), end = ProgramEnd.HOLD, volume = preset.volume, presetId = preset.id,
)

private fun minutes(m: Double) = m * 60

/** Must match BUILT_IN_PROGRAMS in core/src/programs.ts. */
val BUILT_IN_PROGRAMS: List<Program> = listOf(
    Program("arrive", "Arrive", "Settle from busy to calm over 8 minutes, then stay there.",
        ProgramStart(14.0, 200.0, 1.0),
        listOf(ProgramSegment(minutes(8.0), beatHz = 10.0, label = "Settling")),
        ProgramEnd.HOLD, volume = 0.3),
    Program("ease-into-focus", "Ease into Focus", "Start relaxed, rise to a steady focus over 10 minutes.",
        ProgramStart(10.0, 200.0, 0.8),
        listOf(ProgramSegment(minutes(10.0), beatHz = 16.0, level = 1.0, label = "Rising")),
        ProgramEnd.HOLD, volume = 0.3),
    Program("deep-work-block", "Deep Work Block", "5 minutes in, 40 minutes deep, 5 minutes to surface.",
        ProgramStart(14.0, 210.0, 0.85, NoiseSetting(NoiseColor.PINK, 0.2)),
        listOf(
            ProgramSegment(minutes(5.0), beatHz = 40.0, carrierHz = 220.0, level = 1.0, label = "Going in"),
            ProgramSegment(minutes(40.0), label = "Deep"),
            ProgramSegment(minutes(5.0), beatHz = 10.0, carrierHz = 200.0, level = 0.85, label = "Surfacing"),
        ),
        ProgramEnd.STOP, endFadeSec = 15.0, volume = 0.28),
    Program("reset", "Ten-Minute Reset", "A short alpha break between meetings.",
        ProgramStart(12.0, 180.0, 1.0),
        listOf(
            ProgramSegment(minutes(3.0), beatHz = 10.0, label = "Slowing"),
            ProgramSegment(minutes(5.0), label = "Resting"),
            ProgramSegment(minutes(2.0), beatHz = 14.0, label = "Back up"),
        ),
        ProgramEnd.STOP, endFadeSec = 10.0, volume = 0.3),
    Program("wind-down", "Wind Down", "Drift from alpha to theta across 20 minutes.",
        ProgramStart(10.0, 170.0, 1.0, NoiseSetting(NoiseColor.PINK, 0.25)),
        listOf(
            ProgramSegment(minutes(15.0), beatHz = 6.0, carrierHz = 160.0, label = "Unwinding"),
            ProgramSegment(minutes(5.0), level = 0.7, label = "Softening"),
        ),
        ProgramEnd.STOP, endFadeSec = 30.0, volume = 0.26),
    Program("sleep-descent", "Sleep Descent", "From calm to slow delta over 30 minutes, then quietly fades.",
        ProgramStart(8.0, 140.0, 1.0, NoiseSetting(NoiseColor.BROWN, 0.35)),
        listOf(
            ProgramSegment(minutes(15.0), beatHz = 4.0, carrierHz = 130.0, label = "Drifting"),
            ProgramSegment(minutes(15.0), beatHz = 2.0, carrierHz = 120.0, level = 0.6, label = "Descending"),
            ProgramSegment(minutes(15.0), level = 0.4, label = "Asleep"),
        ),
        ProgramEnd.STOP, endFadeSec = 60.0, volume = 0.22),
)
