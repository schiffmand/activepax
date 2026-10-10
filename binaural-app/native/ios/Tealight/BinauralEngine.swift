// Tealight native engine — iOS
// REFERENCE IMPLEMENTATION, NOT YET COMPILED (see Model.swift header).
//
// AVAudioEngine host for ToneRenderer, with the same transport and parameter API as the web core's
// BinauralEngine (core/src/audio/engine.ts): start / stop / pause / resume / rampTo / setVolume /
// setNoise, status 'idle' | 'playing' | 'paused' | 'stopping' | 'interrupted', and fades on every
// transition so nothing ever clicks. Lessons carried over from the core's review rounds:
//
// - getState() always recomputes the derived fields (ear frequencies, band) from beat + carrier.
// - "noise off" keeps the remembered noise volume, so turning noise back on is audible.
// - after stop() the engine and the session are released (battery; frees the audio session).
// - a new glide always starts from the current value (Ramp.retarget), never from a stale one.
// - an interruption never auto-resumes after a call (spec §5.7).

import AVFoundation
import Foundation

enum EngineStatus: String {
    case idle, playing, paused, stopping, interrupted
}

struct EngineState: Equatable {
    var status: EngineStatus
    var beatHz: Double
    var carrierHz: Double
    /// Program envelope 0...1 (owned by ProgramRunner).
    var level: Double
    /// User volume 0...1 (perceptual; owned by the UI's Depth control).
    var volume: Double
    var noise: NoiseSetting
    var swapChannels: Bool

    var leftHz: Double { earFrequencies(carrierHz: carrierHz, beatHz: beatHz).left }
    var rightHz: Double { earFrequencies(carrierHz: carrierHz, beatHz: beatHz).right }
    var band: Band { .of(beatHz: beatHz) }
}

struct EngineStartParams {
    var beatHz: Double?
    var carrierHz: Double?
    var volume: Double?
    var level: Double?
    var noise: NoiseSetting?
}

enum EngineError: Error {
    /// The session couldn't be activated (typically during a phone call). UI: "Can't start during a call".
    case sessionRefused(underlying: Error)
    /// AVAudioEngine failed to start (no output device, hardware busy).
    case engineFailed(underlying: Error)
}

enum EngineEvent {
    case stateChanged(EngineState)
    /// Paused because the OS interrupted us for a call; show "Paused for your call. [Resume]".
    case pausedForCall
    /// Paused because headphones went away; show "Headphones disconnected. Tealight paused…".
    case pausedForRouteLoss
    case headphoneFacts(HeadphoneFacts)
}

@MainActor
final class BinauralEngine: AudioSessionControllerDelegate {
    struct Options {
        var fadeInSec = 2.5
        var fadeOutSec = 2.0
        var pauseFadeSec = 0.4
        var glideSec = 0.4
        /// Minimum ramp for any gain change so even "instant" changes never click (core GAIN_STEP_SEC).
        var gainStepSec = 0.03
    }

    var onEvent: ((EngineEvent) -> Void)?
    let options: Options

    private let session: AudioSessionController
    private let audioEngine = AVAudioEngine()
    private var sourceNode: AVAudioSourceNode?
    private var renderer: ToneRenderer?
    private var configObserver: NSObjectProtocol?
    /// Bumped by every transport call so a delayed teardown can tell it was superseded (core opSeq).
    private var opSeq = 0
    private var pendingTask: Task<Void, Never>?

    private(set) var state: EngineState {
        didSet { if state != oldValue { onEvent?(.stateChanged(state)) } }
    }

    init(session: AudioSessionController = AudioSessionController(), options: Options = Options()) {
        self.session = session
        self.options = options
        state = EngineState(status: .idle, beatHz: 10, carrierHz: 200, level: 1, volume: 0.3,
                            noise: NoiseSetting(type: .off, volume: 0.3), swapChannels: false)
        session.delegate = self
        // AVAudioEngine stops itself when the hardware configuration changes (sample rate, channel
        // count, e.g. AirPods connecting). Rebuild at the new rate and carry on if we were playing.
        configObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange, object: audioEngine, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.handleConfigurationChange() }
        }
    }

    // MARK: - Graph

    private func buildGraphIfNeeded() {
        let sr = session.sampleRate
        if let r = renderer, r.sampleRate == sr, sourceNode != nil { return }
        teardownGraph()
        let l = earFrequencies(carrierHz: state.carrierHz, beatHz: state.beatHz)
        let r = ToneRenderer(sampleRate: sr, leftHz: l.left, rightHz: l.right, level: state.level,
                             volumeGain: volumeToGain(state.volume))
        r.send(.swapChannels(state.swapChannels))
        applyNoise(state.noise, fadeSec: 0, renderer: r)
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sr, channels: 2) else { return }
        // Non-interleaved Float32 stereo: ablPointer[0] = left, [1] = right.
        let node = AVAudioSourceNode(format: format) { [r] _, _, frameCount, audioBufferList -> OSStatus in
            let abl = UnsafeMutableAudioBufferListPointer(audioBufferList)
            guard abl.count >= 2,
                  let left = abl[0].mData?.assumingMemoryBound(to: Float.self),
                  let right = abl[1].mData?.assumingMemoryBound(to: Float.self) else { return noErr }
            r.render(frames: Int(frameCount), left: left, right: right)
            return noErr
        }
        audioEngine.attach(node)
        audioEngine.connect(node, to: audioEngine.mainMixerNode, format: format)
        audioEngine.mainMixerNode.outputVolume = 1
        renderer = r
        sourceNode = node
    }

    private func teardownGraph() {
        if let node = sourceNode {
            audioEngine.disconnectNodeOutput(node)
            audioEngine.detach(node)
        }
        sourceNode = nil
        renderer = nil
    }

    private func gainSec(_ s: Double) -> Double { max(s, options.gainStepSec) }

    private func send(_ p: RenderParam, _ target: Double, _ sec: Double, _ curve: RampCurve) {
        guard let r = renderer else { return }
        r.send(.ramp(p, target: target, samples: r.samples(sec), curve: curve))
    }

    private func applyTone(_ sec: Double, curve: RampCurve) {
        let e = earFrequencies(carrierHz: state.carrierHz, beatHz: state.beatHz)
        send(.leftHz, e.left, sec, curve)
        send(.rightHz, e.right, sec, curve)
    }

    private func applyNoise(_ noise: NoiseSetting, fadeSec: Double, renderer r: ToneRenderer? = nil) {
        guard let r = r ?? renderer else { return }
        let n = r.samples(gainSec(fadeSec))
        let target = noise.type == .off ? 0 : volumeToGain(noise.volume) * Headroom.noise
        // Crossfade: the chosen colour ramps to its target, the others ramp to 0.
        for (i, color) in [NoiseColor.white, .pink, .brown].enumerated() {
            r.send(.noiseGain(colorIndex: i, gain: color == noise.type ? target : 0, samples: n))
        }
    }

    // MARK: - Transport

    /// Start (or restart) with a fade-in. Must be called from a user action the first time.
    func start(_ p: EngineStartParams = EngineStartParams()) throws {
        opSeq += 1
        pendingTask?.cancel()
        let tone = sanitizeTone(beatHz: p.beatHz ?? state.beatHz, carrierHz: p.carrierHz ?? state.carrierHz)
        var next = state
        next.beatHz = tone.beatHz
        next.carrierHz = tone.carrierHz
        next.volume = (p.volume ?? state.volume).clamped(to: Limits.unit)
        next.level = (p.level ?? state.level).clamped(to: Limits.unit)
        if let n = p.noise {
            // "off" keeps the remembered volume so switching noise back on is audible.
            next.noise = NoiseSetting(type: n.type, volume: n.type == .off && !(n.volume > 0) ? state.noise.volume : n.volume.clamped(to: Limits.unit))
        }

        do { try session.activate() } catch { throw EngineError.sessionRefused(underlying: error) }

        let hadGraph = renderer != nil && state.status != .idle
        state.beatHz = next.beatHz
        state.carrierHz = next.carrierHz
        state.volume = next.volume
        state.level = next.level
        state.noise = next.noise
        buildGraphIfNeeded()
        if hadGraph {
            // Playing, paused or mid-stop: glide to the new values on the same graph.
            applyTone(options.glideSec, curve: .exponential)
            send(.volumeGain, volumeToGain(state.volume), gainSec(options.glideSec), .linear)
            send(.level, state.level, gainSec(options.glideSec), .linear)
            applyNoise(state.noise, fadeSec: options.glideSec)
        } else {
            renderer?.send(.resetPhase)
            send(.fade, 0, 0, .step)
            applyNoise(state.noise, fadeSec: options.fadeInSec)
        }
        if !audioEngine.isRunning {
            audioEngine.prepare()
            do { try audioEngine.start() } catch {
                state.status = .idle
                throw EngineError.engineFailed(underlying: error)
            }
        }
        send(.fade, 1, options.fadeInSec, .linear)
        state.status = .playing
    }

    /// Fade out, stop the engine, release the session. Returns when silent.
    func stop(fadeSec: Double? = nil) async {
        opSeq += 1
        let op = opSeq
        pendingTask?.cancel()
        guard renderer != nil, state.status != .idle else {
            state.status = .idle
            return
        }
        let fade = max(0, fadeSec ?? options.fadeOutSec)
        let audible = state.status == .playing && audioEngine.isRunning
        if audible {
            send(.fade, 0, fade, .linear)
            state.status = .stopping
            let task = Task { @MainActor in
                try? await Task.sleep(nanoseconds: UInt64((fade + 0.05) * 1_000_000_000))
            }
            pendingTask = task
            await task.value
            guard op == opSeq else { return } // start() superseded the stop
        }
        audioEngine.stop()
        teardownGraph()
        session.deactivate()
        state.status = .idle
    }

    /// Quick fade, then pause the engine (keeps the graph for an instant resume).
    func pause() async {
        guard state.status == .playing || state.status == .interrupted else { return }
        opSeq += 1
        let op = opSeq
        pendingTask?.cancel()
        let wasPlaying = state.status == .playing
        send(.fade, 0, wasPlaying ? options.pauseFadeSec : 0, .linear)
        state.status = .paused
        guard wasPlaying else { return }
        let task = Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64((options.pauseFadeSec + 0.05) * 1_000_000_000))
        }
        pendingTask = task
        await task.value
        guard op == opSeq, state.status == .paused else { return }
        audioEngine.pause()
    }

    func resume() throws {
        guard state.status == .paused || state.status == .interrupted, renderer != nil else { return }
        opSeq += 1
        pendingTask?.cancel()
        do { try session.activate() } catch { throw EngineError.sessionRefused(underlying: error) }
        if !audioEngine.isRunning {
            do { try audioEngine.start() } catch { throw EngineError.engineFailed(underlying: error) }
        }
        send(.fade, 1, options.fadeInSec, .linear)
        state.status = .playing
    }

    // MARK: - Parameters

    /// Glide beat / carrier / level (used by ProgramRunner and UI sliders). Mirrors core rampTo().
    func rampTo(beatHz: Double? = nil, carrierHz: Double? = nil, level: Double? = nil,
                durationSec: Double? = nil, curve: RampCurve = .exponential) {
        let dur = max(0, durationSec ?? options.glideSec)
        let tone = sanitizeTone(beatHz: beatHz ?? state.beatHz, carrierHz: carrierHz ?? state.carrierHz)
        let toneChanged = beatHz != nil || carrierHz != nil
        state.beatHz = tone.beatHz
        state.carrierHz = tone.carrierHz
        if toneChanged { applyTone(dur, curve: curve) }
        if let l = level, l.isFinite {
            state.level = l.clamped(to: Limits.unit)
            send(.level, state.level, curve == .step || dur <= 0 ? options.gainStepSec : dur, .linear)
        }
    }

    func setVolume(_ v: Double, glideSec: Double? = nil) {
        guard v.isFinite else { return }
        state.volume = v.clamped(to: Limits.unit)
        send(.volumeGain, volumeToGain(state.volume), gainSec(glideSec ?? options.glideSec), .linear)
    }

    func setNoise(type: NoiseColor? = nil, volume: Double? = nil, fadeSec: Double = 1.5) {
        let t = type ?? state.noise.type
        var v = volume.flatMap { $0.isFinite ? $0.clamped(to: Limits.unit) : nil } ?? state.noise.volume
        if t == .off && v <= 0 { v = state.noise.volume } // never zero the remembered volume
        state.noise = NoiseSetting(type: t, volume: v)
        if state.status != .idle { applyNoise(state.noise, fadeSec: fadeSec) }
    }

    /// Set from the stereo check's 'swapped' verdict (spec: "Tealight will swap them for you").
    func setSwapChannels(_ on: Bool) {
        state.swapChannels = on
        renderer?.send(.swapChannels(on))
    }

    // MARK: - AudioSessionControllerDelegate

    func sessionInterruptionBegan() {
        guard state.status == .playing || state.status == .stopping else { return }
        // The system already silenced us. Drop the fade to 0 so a later restart fades in, never blasts.
        send(.fade, 0, 0, .step)
        state.status = .interrupted
    }

    func sessionInterruptionEnded(shouldResume: Bool, wasCall: Bool) {
        guard state.status == .interrupted else { return }
        if wasCall || !shouldResume {
            state.status = .paused
            if wasCall { onEvent?(.pausedForCall) }
            return
        }
        try? resume()
    }

    func sessionOldDeviceUnavailable(previous: OutputRoute) {
        guard state.status == .playing else { return }
        Task { await pause() }
        onEvent?(.pausedForRouteLoss)
    }

    func sessionHeadphoneFactsChanged(_ facts: HeadphoneFacts) {
        onEvent?(.headphoneFacts(facts))
    }

    func sessionMediaServicesWereReset() {
        // Every AVAudio object is now invalid. Rebuild from scratch, silent; the user restarts.
        let wasActive = state.status != .idle
        teardownGraph()
        audioEngine.reset()
        state.status = wasActive ? .paused : .idle
    }

    private func handleConfigurationChange() {
        let wasPlaying = state.status == .playing
        // The renderer's sample rate may be stale now; rebuild (state carries the parameters).
        teardownGraph()
        guard state.status != .idle else { return }
        buildGraphIfNeeded()
        send(.fade, 0, 0, .step)
        if wasPlaying {
            do {
                try audioEngine.start()
                send(.fade, 1, options.fadeInSec, .linear)
            } catch {
                state.status = .paused
            }
        }
    }
}
