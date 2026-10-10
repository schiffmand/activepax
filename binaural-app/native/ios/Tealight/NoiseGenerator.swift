// Tealight native engine — iOS
// REFERENCE IMPLEMENTATION, NOT YET COMPILED (see Model.swift header).
//
// Streaming noise for the render thread. Same algorithms and PRNG as core/src/audio/noise.ts
// (mulberry32, Kellet pink, leaky-integrator brown), but generated sample by sample instead of into a
// looped buffer, so there is no loop seam at all. Everything here is allocation-free and lock-free:
// it runs inside the AVAudioSourceNode render block.

import Foundation

/// mulberry32, bit-identical to core `mulberry32` (UInt32 wrapping arithmetic = JS `>>> 0` / Math.imul).
struct Mulberry32 {
    private var a: UInt32
    init(seed: UInt32) { a = seed }

    @inline(__always)
    mutating func next() -> Double {
        a = a &+ 0x6D2B_79F5
        var t = a
        t = (t ^ (t >> 15)) &* (t | 1)
        t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
        return Double(t ^ (t >> 14)) / 4_294_967_296.0
    }
}

/// One mono noise voice. Two of these (different seeds) make a decorrelated, wide stereo bed.
struct NoiseVoice {
    let color: NoiseColor
    private var rng: Mulberry32
    // pink (Paul Kellet, refined)
    private var b0 = 0.0, b1 = 0.0, b2 = 0.0, b3 = 0.0, b4 = 0.0, b5 = 0.0, b6 = 0.0
    // brown
    private var last = 0.0
    // DC blocker (matters for brown; harmless for the others)
    private var dcX = 0.0, dcY = 0.0

    init(color: NoiseColor, seed: UInt32) {
        self.color = color
        rng = Mulberry32(seed: seed)
    }

    /// Next sample, roughly normalised so that peaks sit near ±0.9 like the core's buffers
    /// (core normalises a whole buffer; a stream can't, so these are empirical scale factors).
    @inline(__always)
    mutating func next() -> Double {
        let w = rng.next() * 2 - 1
        var x: Double
        switch color {
        case .white, .off:
            x = w * 0.9
        case .pink:
            b0 = 0.99886 * b0 + w * 0.0555179
            b1 = 0.99332 * b1 + w * 0.0750759
            b2 = 0.969 * b2 + w * 0.153852
            b3 = 0.8665 * b3 + w * 0.3104856
            b4 = 0.55 * b4 + w * 0.5329522
            b5 = -0.7616 * b5 - w * 0.016898
            x = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
            b6 = w * 0.115926
        case .brown:
            last = (last + 0.02 * w) / 1.02
            x = last * 3.5
        }
        // One-pole DC blocker: y[n] = x[n] - x[n-1] + R * y[n-1]
        let y = x - dcX + 0.9995 * dcY
        dcX = x
        dcY = y
        // Soft safety clamp: the headroom budget (WORST_CASE_PEAK) assumes |noise| <= 0.9.
        return Swift.max(-0.9, Swift.min(0.9, y))
    }
}
