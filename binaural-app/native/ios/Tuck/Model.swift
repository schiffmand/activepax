// Tuck native engine — iOS
// REFERENCE IMPLEMENTATION, NOT YET COMPILED. Written against iOS 16+ / Swift 5.9 APIs, but it has
// never been built or run on a device. Treat it as a precise spec in code form, not as shipped code.
//
// Model.swift mirrors core/src/types.ts, core/src/presets.ts and core/src/programs.ts 1:1.
// The JSON shapes are identical (Codable keys = TypeScript field names), so presets, programs and
// session records can move between the web core and the native apps without translation.
// If the TypeScript model changes, change this file in the same commit.

import Foundation

// MARK: - Bands, noise, limits (core/src/types.ts)

/// Conventional EEG band label for a beat frequency. Descriptive only: never a claim of effect.
enum Band: String, Codable, CaseIterable {
    case delta, theta, alpha, beta, gamma

    static func of(beatHz: Double) -> Band {
        switch beatHz {
        case ..<4: return .delta
        case ..<8: return .theta
        case ..<13: return .alpha
        case ..<30: return .beta
        default: return .gamma
        }
    }
}

/// `type: 'off' | 'white' | 'pink' | 'brown'` in TypeScript.
enum NoiseColor: String, Codable, CaseIterable {
    case off, white, pink, brown
}

struct NoiseSetting: Codable, Equatable {
    var type: NoiseColor
    /// Perceptual 0...1.
    var volume: Double

    static let off = NoiseSetting(type: .off, volume: 0.25)
}

enum RampCurve: String, Codable {
    case linear, exponential, step
}

/// The three parameters a program automates.
struct ToneTarget: Codable, Equatable {
    var beatHz: Double
    var carrierHz: Double
    var level: Double
}

enum Limits {
    static let beatHz: ClosedRange<Double> = 0.5...45
    static let carrierHz: ClosedRange<Double> = 40...1000
    static let unit: ClosedRange<Double> = 0...1
}

extension Double {
    /// Same semantics as core `clamp`: NaN maps to the lower bound.
    func clamped(to r: ClosedRange<Double>) -> Double {
        if isNaN { return r.lowerBound }
        return Swift.min(r.upperBound, Swift.max(r.lowerBound, self))
    }
}

/// Left ear = carrier - beat/2, right ear = carrier + beat/2.
func earFrequencies(carrierHz: Double, beatHz: Double) -> (left: Double, right: Double) {
    (carrierHz - beatHz / 2, carrierHz + beatHz / 2)
}

/// Core `sanitizeTone`: clamp to limits and keep beat < carrier so the left ear stays above 0 Hz.
func sanitizeTone(beatHz: Double, carrierHz: Double) -> (beatHz: Double, carrierHz: Double) {
    let carrier = carrierHz.clamped(to: Limits.carrierHz)
    let beat = beatHz.clamped(to: Limits.beatHz.lowerBound...Swift.min(Limits.beatHz.upperBound, carrier - 1))
    return (beat, carrier)
}

/// Perceptual volume -> linear gain (square law), as in core `volumeToGain`.
func volumeToGain(_ v: Double) -> Double {
    let c = v.clamped(to: Limits.unit)
    return c * c
}

// MARK: - Presets (core/src/presets.ts)

struct Preset: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var tagline: String
    var beatHz: Double
    var carrierHz: Double
    var volume: Double
    var noise: NoiseSetting
    var band: Band
    var builtIn: Bool
    var tone: String?
    var createdAt: Double?
    var updatedAt: Double?
}

private func builtIn(_ id: String, _ name: String, _ tagline: String, beat: Double, carrier: Double,
                     volume: Double, noise: NoiseSetting, tone: String) -> Preset {
    Preset(id: id, name: name, tagline: tagline, beatHz: beat, carrierHz: carrier, volume: volume,
           noise: noise, band: .of(beatHz: beat), builtIn: true, tone: tone)
}

/// Must match BUILT_IN_PRESETS in core/src/presets.ts exactly (ids are persisted in favourites).
let builtInPresets: [Preset] = [
    builtIn("focus", "Focus", "A steady beta hum for getting into the work.",
            beat: 16, carrier: 200, volume: 0.3, noise: NoiseSetting(type: .off, volume: 0.25), tone: "focus"),
    builtIn("deep-work", "Deep Work", "A 40 Hz gamma layer for long, absorbed stretches.",
            beat: 40, carrier: 220, volume: 0.28, noise: NoiseSetting(type: .pink, volume: 0.2), tone: "deep"),
    builtIn("calm", "Calm", "Alpha at 10 Hz — relaxed but awake.",
            beat: 10, carrier: 180, volume: 0.3, noise: NoiseSetting(type: .off, volume: 0.25), tone: "calm"),
    builtIn("wind-down", "Wind Down", "Theta at 6 Hz for the end of the day.",
            beat: 6, carrier: 160, volume: 0.26, noise: NoiseSetting(type: .pink, volume: 0.25), tone: "wind"),
    builtIn("sleep", "Sleep", "Slow delta at 2 Hz under soft brown noise.",
            beat: 2, carrier: 120, volume: 0.22, noise: NoiseSetting(type: .brown, volume: 0.35), tone: "sleep"),
]

// MARK: - Programs (core/src/programs.ts)

struct ProgramSegment: Codable, Equatable {
    var durationSec: Double
    var beatHz: Double?
    var carrierHz: Double?
    var level: Double?
    var curve: RampCurve?
    var label: String?
    /// Change the noise bed when this segment begins.
    var noise: NoiseSetting?
}

struct ProgramStart: Codable, Equatable {
    var beatHz: Double
    var carrierHz: Double
    var level: Double?
    var noise: NoiseSetting?
}

enum ProgramEnd: String, Codable { case hold, stop }

struct Program: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var tagline: String?
    var start: ProgramStart
    var segments: [ProgramSegment]
    var end: ProgramEnd
    var endFadeSec: Double?
    var volume: Double?
    var presetId: String?
}

struct AutomationStep: Equatable {
    var index: Int
    var label: String?
    var atSec: Double
    var durationSec: Double
    var from: ToneTarget
    var to: ToneTarget
    var curve: RampCurve
    var noise: NoiseSetting?
}

struct CompiledProgram: Equatable {
    var programId: String
    var start: ToneTarget
    var startNoise: NoiseSetting?
    var steps: [AutomationStep]
    var timedSec: Double
    var end: ProgramEnd
    var endFadeSec: Double
    /// nil when the program holds indefinitely.
    var totalSec: Double?
}

let defaultEndFadeSec = 20.0

/// Pure compiler: program -> absolute-time automation schedule (core `compileProgram`).
func compileProgram(_ p: Program) -> CompiledProgram {
    let start = ToneTarget(beatHz: p.start.beatHz, carrierHz: p.start.carrierHz, level: p.start.level ?? 1)
    var steps: [AutomationStep] = []
    var at = 0.0
    var from = start
    for (index, s) in p.segments.enumerated() {
        let to = ToneTarget(beatHz: s.beatHz ?? from.beatHz, carrierHz: s.carrierHz ?? from.carrierHz, level: s.level ?? from.level)
        let step = AutomationStep(index: index, label: s.label, atSec: at, durationSec: max(0, s.durationSec),
                                  from: from, to: to, curve: s.curve ?? .exponential, noise: s.noise)
        steps.append(step)
        at += step.durationSec
        from = to
    }
    return CompiledProgram(programId: p.id, start: start, startNoise: p.start.noise, steps: steps, timedSec: at,
                           end: p.end, endFadeSec: p.endFadeSec ?? defaultEndFadeSec,
                           totalSec: p.end == .stop ? at : nil)
}

/// A preset is a program that starts at the preset and holds (core `presetToProgram`).
func presetToProgram(_ preset: Preset) -> Program {
    Program(id: "preset:\(preset.id)", name: preset.name, tagline: preset.tagline,
            start: ProgramStart(beatHz: preset.beatHz, carrierHz: preset.carrierHz, level: 1, noise: preset.noise),
            segments: [], end: .hold, endFadeSec: nil, volume: preset.volume, presetId: preset.id)
}

private func minutes(_ m: Double) -> Double { m * 60 }

/// Must match BUILT_IN_PROGRAMS in core/src/programs.ts.
let builtInPrograms: [Program] = [
    Program(id: "arrive", name: "Arrive", tagline: "Settle from busy to calm over 8 minutes, then stay there.",
            start: ProgramStart(beatHz: 14, carrierHz: 200, level: 1),
            segments: [ProgramSegment(durationSec: minutes(8), beatHz: 10, label: "Settling")],
            end: .hold, volume: 0.3),
    Program(id: "ease-into-focus", name: "Ease into Focus", tagline: "Start relaxed, rise to a steady focus over 10 minutes.",
            start: ProgramStart(beatHz: 10, carrierHz: 200, level: 0.8),
            segments: [ProgramSegment(durationSec: minutes(10), beatHz: 16, level: 1, label: "Rising")],
            end: .hold, volume: 0.3),
    Program(id: "deep-work-block", name: "Deep Work Block", tagline: "5 minutes in, 40 minutes deep, 5 minutes to surface.",
            start: ProgramStart(beatHz: 14, carrierHz: 210, level: 0.85, noise: NoiseSetting(type: .pink, volume: 0.2)),
            segments: [
                ProgramSegment(durationSec: minutes(5), beatHz: 40, carrierHz: 220, level: 1, label: "Going in"),
                ProgramSegment(durationSec: minutes(40), label: "Deep"),
                ProgramSegment(durationSec: minutes(5), beatHz: 10, carrierHz: 200, level: 0.85, label: "Surfacing"),
            ],
            end: .stop, endFadeSec: 15, volume: 0.28),
    Program(id: "reset", name: "Ten-Minute Reset", tagline: "A short alpha break between meetings.",
            start: ProgramStart(beatHz: 12, carrierHz: 180, level: 1),
            segments: [
                ProgramSegment(durationSec: minutes(3), beatHz: 10, label: "Slowing"),
                ProgramSegment(durationSec: minutes(5), label: "Resting"),
                ProgramSegment(durationSec: minutes(2), beatHz: 14, label: "Back up"),
            ],
            end: .stop, endFadeSec: 10, volume: 0.3),
    Program(id: "wind-down", name: "Wind Down", tagline: "Drift from alpha to theta across 20 minutes.",
            start: ProgramStart(beatHz: 10, carrierHz: 170, level: 1, noise: NoiseSetting(type: .pink, volume: 0.25)),
            segments: [
                ProgramSegment(durationSec: minutes(15), beatHz: 6, carrierHz: 160, label: "Unwinding"),
                ProgramSegment(durationSec: minutes(5), level: 0.7, label: "Softening"),
            ],
            end: .stop, endFadeSec: 30, volume: 0.26),
    Program(id: "sleep-descent", name: "Sleep Descent", tagline: "From calm to slow delta over 30 minutes, then quietly fades.",
            start: ProgramStart(beatHz: 8, carrierHz: 140, level: 1, noise: NoiseSetting(type: .brown, volume: 0.35)),
            segments: [
                ProgramSegment(durationSec: minutes(15), beatHz: 4, carrierHz: 130, label: "Drifting"),
                ProgramSegment(durationSec: minutes(15), beatHz: 2, carrierHz: 120, level: 0.6, label: "Descending"),
                ProgramSegment(durationSec: minutes(15), level: 0.4, label: "Asleep"),
            ],
            end: .stop, endFadeSec: 60, volume: 0.22),
]
