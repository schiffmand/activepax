// Tuck native engine — iOS
// REFERENCE IMPLEMENTATION, NOT YET COMPILED (see Model.swift header).
//
// Plays a Program (or a Preset via presetToProgram) on the BinauralEngine, the native twin of the
// core's ProgramPlayer (core/src/scheduler.ts), reduced to the essentials:
// - at each step boundary, one engine.rampTo(step.to, step.durationSec, step.curve), so the glide
//   itself is rendered sample-accurately by ToneRenderer and timer jitter only shifts *when* a
//   segment starts by a few ms;
// - elapsed time uses a monotonic clock (ContinuousClock), never wall-clock time;
// - pause/interruption freezes the program clock; stop() fades out with the program's end fade.
// With UIBackgroundModes=audio and an active session, main-queue timers keep firing on the lock screen.

import Foundation

@MainActor
final class ProgramRunner {
    enum Status { case idle, playing, paused, ending }

    private let engine: BinauralEngine
    private(set) var status: Status = .idle
    private(set) var compiled: CompiledProgram?
    private var stepTimer: Timer?
    private var nextStep = 0
    private var accumulated: Duration = .zero
    private var runningSince: ContinuousClock.Instant?
    private let clock = ContinuousClock()
    /// Optional sleep timer (seconds of playback); nil = no timer.
    private var timerSec: Double?

    var onStep: ((AutomationStep) -> Void)?
    var onEnded: ((_ completed: Bool) -> Void)?

    init(engine: BinauralEngine) {
        self.engine = engine
    }

    var elapsedSec: Double {
        var d = accumulated
        if let s = runningSince { d += clock.now - s }
        return Double(d.components.seconds) + Double(d.components.attoseconds) / 1e18
    }

    func play(_ program: Program, volume: Double? = nil, timerSec: Double? = nil) throws {
        cancelTimer()
        let c = compileProgram(program)
        compiled = c
        self.timerSec = timerSec.flatMap { $0 > 0 && $0.isFinite ? $0 : nil }
        accumulated = .zero
        nextStep = 0
        // No noise bed: switch noise off but keep the remembered volume (core round-2 fix).
        let noise = c.startNoise ?? NoiseSetting(type: .off, volume: .nan)
        try engine.start(EngineStartParams(beatHz: c.start.beatHz, carrierHz: c.start.carrierHz,
                                           volume: volume ?? program.volume, level: c.start.level, noise: noise))
        runningSince = clock.now
        status = .playing
        scheduleNext()
    }

    func pause() async {
        guard status == .playing else { return }
        freezeClock()
        cancelTimer()
        status = .paused
        await engine.pause()
    }

    func resume() throws {
        guard status == .paused, let c = compiled else { return }
        try engine.resume()
        runningSince = clock.now
        status = .playing
        // Re-aim the current step from where we are, so the glide continues where it froze.
        let t = elapsedSec
        if let current = c.steps.last(where: { $0.atSec <= t && t < $0.atSec + $0.durationSec }) {
            let remaining = current.atSec + current.durationSec - t
            engine.rampTo(beatHz: current.to.beatHz, carrierHz: current.to.carrierHz, level: current.to.level,
                          durationSec: remaining, curve: current.curve)
        }
        scheduleNext()
    }

    func stop(completed: Bool = false) async {
        guard status != .idle else { return }
        cancelTimer()
        freezeClock()
        status = .ending
        await engine.stop(fadeSec: compiled?.endFadeSec)
        status = .idle
        onEnded?(completed)
    }

    // MARK: - Scheduling

    private func freezeClock() {
        if let s = runningSince { accumulated += clock.now - s }
        runningSince = nil
    }

    private func cancelTimer() {
        stepTimer?.invalidate()
        stepTimer = nil
    }

    private func scheduleNext() {
        guard status == .playing, let c = compiled else { return }
        let t = elapsedSec
        // Fire every step whose start time has passed (covers resume and late timers).
        while nextStep < c.steps.count, c.steps[nextStep].atSec <= t + 0.005 {
            let s = c.steps[nextStep]
            let remaining = max(0, s.atSec + s.durationSec - t)
            engine.rampTo(beatHz: s.to.beatHz, carrierHz: s.to.carrierHz, level: s.to.level,
                          durationSec: remaining, curve: s.curve)
            if let n = s.noise { engine.setNoise(type: n.type, volume: n.volume) }
            onStep?(s)
            nextStep += 1
        }
        // When the session ends on its own: program end (end == .stop) or the sleep timer, whichever
        // comes first. The fade-out starts endFadeSec before a sleep timer so it ends on time.
        let ends = [c.totalSec, timerSec.map { max(0, $0 - c.endFadeSec) }].compactMap { $0 }
        let endAt = ends.min()
        if let endAt, t >= endAt {
            Task { await stop(completed: true) }
            return
        }
        let nextStart = nextStep < c.steps.count ? c.steps[nextStep].atSec : nil
        guard let due = [nextStart, endAt].compactMap({ $0 }).min() else { return } // holds indefinitely
        stepTimer = Timer.scheduledTimer(withTimeInterval: max(0.01, due - t), repeats: false) { [weak self] _ in
            MainActor.assumeIsolated { self?.scheduleNext() }
        }
        stepTimer?.tolerance = 0.05
    }
}
