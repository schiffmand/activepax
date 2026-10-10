// Tealight native engine — iOS
// REFERENCE IMPLEMENTATION, NOT YET COMPILED (see Model.swift header).
//
// The DSP that runs on the real-time audio thread, inside AVAudioSourceNode's render block.
// It is the native twin of the Web Audio graph in core/src/audio/engine.ts:
//
//   sin(left ear)  ─┐
//                   ├─ × TONE_HEADROOM ─┐
//   sin(right ear) ─┘                   ├─ × level × volumeGain × fade ─> L / R
//   noise (L/R decorrelated) × gain ────┘
//
// Rules for this file (real-time safety):
// - no allocation, no locks that can block, no Objective-C messaging, no Swift Concurrency;
// - the control thread talks to it only through a fixed-size command ring guarded by an
//   os_unfair_lock that the render thread *tries* to take (never waits). If the try fails the
//   commands are applied on the next buffer (~5-20 ms later), which is inaudible for ramps.
//
// Every parameter is a `Ramp`, and retargeting a ramp starts from its *current* value, so a new
// glide interrupting one in flight is continuous (the native equivalent of cancelAndHoldAtTime).

import Foundation
import os

/// Same constants as core/src/audio/engine.ts.
enum Headroom {
    /// Each sine peaks at -6 dBFS before volume.
    static let tone = 0.5
    /// Noise bed headroom; noise voices peak at 0.9, so worst case = 0.5 + 0.45 < 1 (no limiter needed).
    static let noise = 0.5
}

/// A per-sample smoothed value. Linear for gains, exponential (per ear) for frequencies.
struct Ramp {
    private(set) var value: Double
    private var target: Double
    private var remaining = 0
    private var increment = 0.0
    private var ratio = 1.0
    private var exponential = false

    init(_ v: Double) {
        value = v
        target = v
    }

    mutating func retarget(_ newTarget: Double, samples: Int, curve: RampCurve) {
        guard newTarget.isFinite else { return }
        if curve == .step || samples <= 0 {
            value = newTarget
            target = newTarget
            remaining = 0
            return
        }
        target = newTarget
        remaining = samples
        if curve == .exponential && value > 0 && newTarget > 0 {
            exponential = true
            ratio = pow(newTarget / value, 1.0 / Double(samples))
        } else {
            exponential = false
            increment = (newTarget - value) / Double(samples)
        }
    }

    @inline(__always)
    mutating func next() -> Double {
        if remaining > 0 {
            if exponential { value *= ratio } else { value += increment }
            remaining -= 1
            if remaining == 0 { value = target }
        }
        return value
    }

    var isIdleSilent: Bool { remaining == 0 && value <= 0 }
}

enum RenderParam: Int {
    case leftHz, rightHz, level, volumeGain, fade
}

/// POD commands (trivially copyable: safe to pass through the ring without ARC traffic).
enum RenderCommand {
    case ramp(RenderParam, target: Double, samples: Int, curve: RampCurve)
    /// `colorIndex`: 0 white, 1 pink, 2 brown. `gain` is linear (already volumeToGain × headroom).
    case noiseGain(colorIndex: Int, gain: Double, samples: Int)
    case swapChannels(Bool)
    case resetPhase
    case none
}

final class ToneRenderer {
    let sampleRate: Double

    // ── render-thread state ──
    private var phaseL = 0.0
    private var phaseR = 0.0
    private var leftHz: Ramp
    private var rightHz: Ramp
    private var level: Ramp
    private var volumeGain: Ramp
    private var fade = Ramp(0)
    private var noiseGains = [Ramp(0), Ramp(0), Ramp(0)]
    private var noiseL = [NoiseVoice(color: .white, seed: 11), NoiseVoice(color: .pink, seed: 11), NoiseVoice(color: .brown, seed: 11)]
    private var noiseR = [NoiseVoice(color: .white, seed: 23), NoiseVoice(color: .pink, seed: 23), NoiseVoice(color: .brown, seed: 23)]
    private var swap = false

    // ── command ring (control thread writes, render thread drains) ──
    private let lock: UnsafeMutablePointer<os_unfair_lock>
    private let capacity = 256
    private let ring: UnsafeMutablePointer<RenderCommand>
    private var head = 0
    private var count = 0

    init(sampleRate: Double, leftHz: Double, rightHz: Double, level: Double, volumeGain: Double) {
        self.sampleRate = sampleRate
        self.leftHz = Ramp(leftHz)
        self.rightHz = Ramp(rightHz)
        self.level = Ramp(level)
        self.volumeGain = Ramp(volumeGain)
        lock = .allocate(capacity: 1)
        lock.initialize(to: os_unfair_lock())
        ring = .allocate(capacity: capacity)
        ring.initialize(repeating: .none, count: capacity)
        // The noise arrays are created once and never resized: in-place element mutation doesn't allocate.
    }

    deinit {
        ring.deinitialize(count: capacity)
        ring.deallocate()
        lock.deinitialize(count: 1)
        lock.deallocate()
    }

    func samples(_ seconds: Double) -> Int {
        guard seconds.isFinite, seconds > 0 else { return 0 }
        return Int((seconds * sampleRate).rounded())
    }

    // MARK: control thread

    /// Queue a command. Returns false if the ring is full (only possible if the render thread is
    /// stopped for a long time while the UI keeps sending; the caller then rebuilds state on start).
    @discardableResult
    func send(_ cmd: RenderCommand) -> Bool {
        os_unfair_lock_lock(lock)
        defer { os_unfair_lock_unlock(lock) }
        guard count < capacity else { return false }
        ring[(head + count) % capacity] = cmd
        count += 1
        return true
    }

    // MARK: render thread

    @inline(__always)
    private func drainCommands() {
        guard os_unfair_lock_trylock(lock) else { return } // never block the audio thread
        while count > 0 {
            let cmd = ring[head]
            head = (head + 1) % capacity
            count -= 1
            apply(cmd)
        }
        os_unfair_lock_unlock(lock)
    }

    @inline(__always)
    private func apply(_ cmd: RenderCommand) {
        switch cmd {
        case let .ramp(param, target, n, curve):
            switch param {
            case .leftHz: leftHz.retarget(target, samples: n, curve: curve)
            case .rightHz: rightHz.retarget(target, samples: n, curve: curve)
            case .level: level.retarget(target, samples: n, curve: curve == .step ? .step : .linear)
            case .volumeGain: volumeGain.retarget(target, samples: n, curve: curve == .step ? .step : .linear)
            case .fade: fade.retarget(target, samples: n, curve: curve == .step ? .step : .linear)
            }
        case let .noiseGain(i, gain, n):
            if i >= 0 && i < 3 { noiseGains[i].retarget(gain, samples: n, curve: .linear) }
        case let .swapChannels(on):
            swap = on
        case .resetPhase:
            phaseL = 0
            phaseR = 0
        case .none:
            break
        }
    }

    /// Fill `frames` samples of non-interleaved stereo Float32.
    func render(frames: Int, left: UnsafeMutablePointer<Float>, right: UnsafeMutablePointer<Float>) {
        drainCommands()
        let twoPi = 2.0 * Double.pi
        let k = twoPi / sampleRate
        for i in 0..<frames {
            phaseL += leftHz.next() * k
            phaseR += rightHz.next() * k
            if phaseL >= twoPi { phaseL -= twoPi }
            if phaseR >= twoPi { phaseR -= twoPi }
            var l = sin(phaseL) * Headroom.tone
            var r = sin(phaseR) * Headroom.tone
            for c in 0..<3 {
                let g = noiseGains[c].next()
                if g > 0 {
                    l += noiseL[c].next() * g
                    r += noiseR[c].next() * g
                }
            }
            let master = level.next() * volumeGain.next() * fade.next()
            let outL = Float(l * master)
            let outR = Float(r * master)
            if swap {
                left[i] = outR
                right[i] = outL
            } else {
                left[i] = outL
                right[i] = outR
            }
        }
    }
}
