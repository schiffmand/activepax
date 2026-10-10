// Tuck native engine — iOS
// REFERENCE IMPLEMENTATION, NOT YET COMPILED (see Model.swift header).
//
// Owns AVAudioSession policy. The one rule that makes Tuck a *layer*:
//
//   category .playback  +  option .mixWithOthers   (and NOT .duckOthers, NOT .interruptSpokenAudioAndMixWithOthers)
//
// - .playback: keeps playing with the ring/silent switch on and, with UIBackgroundModes=audio, in the
//   background and on the lock screen.
// - .mixWithOthers: we never interrupt Spotify / podcasts / YouTube, and they don't interrupt us.
//   A mixable session is also never the "Now Playing" app, so the user's music keeps the lock-screen
//   player and the hardware/AirPods play-pause controls. Do not set MPNowPlayingInfoCenter or
//   register MPRemoteCommandCenter handlers. Tuck's own lock-screen control is a Live Activity.
//
// It also reports interruptions (calls, Siri, alarms), route changes (headphones unplugged, AirPods
// connected) and the headphone facts the UI's headphone-state model needs (core/product-spec §5.2):
// speaker vs headphones, Mono Audio, Spatial Audio.

import AVFoundation
import CallKit
import UIKit

enum OutputRoute: Equatable {
    case speaker        // built-in speaker or receiver: both tones mix acoustically, no beat
    case wiredHeadphones
    case bluetooth      // A2DP / LE; AirPods included
    case airPlayOrCar   // AirPlay, CarPlay, HDMI, USB audio: stereo separation unknown
    case none
}

struct HeadphoneFacts: Equatable {
    var route: OutputRoute
    /// Settings › Accessibility › Audio/Visual › Mono Audio. Binaural beats cannot form.
    var monoAudio: Bool
    /// iOS 15+: the current output has Spatial Audio enabled (best effort; head tracking moves tones).
    var spatialAudio: Bool
    /// Human-readable name for UI ("AirPods Pro"), never sent anywhere.
    var outputName: String?
}

protocol AudioSessionControllerDelegate: AnyObject {
    /// The system silenced us (call, Siri, alarm, another non-mixable app). Our IO has stopped.
    func sessionInterruptionBegan()
    /// The interruption ended. `shouldResume` is the system's hint; `wasCall` is true if a phone or
    /// VoIP call was involved (spec §5.7: never auto-resume after a call).
    func sessionInterruptionEnded(shouldResume: Bool, wasCall: Bool)
    /// The previous output went away (headphones unplugged, AirPods out of the case).
    func sessionOldDeviceUnavailable(previous: OutputRoute)
    /// Any change to route / Mono Audio / Spatial Audio.
    func sessionHeadphoneFactsChanged(_ facts: HeadphoneFacts)
    /// mediaserverd crashed and restarted: every audio object is invalid and must be rebuilt.
    func sessionMediaServicesWereReset()
}

@MainActor
final class AudioSessionController {
    weak var delegate: AudioSessionControllerDelegate?
    private let session = AVAudioSession.sharedInstance()
    private let callObserver = CXCallObserver()
    private var callSeenDuringInterruption = false
    private var observers: [NSObjectProtocol] = []

    private(set) var facts = HeadphoneFacts(route: .none, monoAudio: false, spatialAudio: false, outputName: nil)

    init() {
        let nc = NotificationCenter.default
        observers.append(nc.addObserver(forName: AVAudioSession.interruptionNotification, object: session, queue: .main) { [weak self] n in
            MainActor.assumeIsolated { self?.handleInterruption(n) }
        })
        observers.append(nc.addObserver(forName: AVAudioSession.routeChangeNotification, object: session, queue: .main) { [weak self] n in
            MainActor.assumeIsolated { self?.handleRouteChange(n) }
        })
        observers.append(nc.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: session, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                // Category/options are lost on reset: configure again before the engine rebuilds.
                try? self?.configure()
                self?.delegate?.sessionMediaServicesWereReset()
            }
        })
        observers.append(nc.addObserver(forName: UIAccessibility.monoAudioStatusDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.refreshFacts() }
        })
        observers.append(nc.addObserver(forName: AVAudioSession.spatialPlaybackCapabilitiesChangedNotification, object: session, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.refreshFacts() }
        })
        refreshFacts()
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    /// Set category and options. Cheap; safe to call repeatedly (e.g. from a "Fix audio settings" button).
    func configure() throws {
        try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        // A long IO buffer saves battery; we are a background layer, latency doesn't matter.
        try? session.setPreferredIOBufferDuration(0.02)
    }

    /// Activate before starting AVAudioEngine. Throws when the system refuses (e.g. during a phone
    /// call, AVAudioSession.ErrorCode.cannotInterruptOthers / .insufficientPriority): the UI should
    /// show "Can't start during a call" rather than a generic error.
    func activate() throws {
        try configure()
        try session.setActive(true)
        refreshFacts()
    }

    /// Deactivate after stop. With a mixable session this doesn't affect other apps; it just releases
    /// our claim so iOS can power the audio hardware down when nothing else is playing.
    func deactivate() {
        try? session.setActive(false, options: [.notifyOthersOnDeactivation])
    }

    /// The hardware sample rate to render at (avoids a resampler in the output path).
    var sampleRate: Double { session.sampleRate > 0 ? session.sampleRate : 48_000 }

    /// True if another app is currently playing audio (spec §5.7 audio indicator: never a name).
    var otherAudioIsPlaying: Bool { session.isOtherAudioPlaying }

    // MARK: - Interruptions

    private func handleInterruption(_ n: Notification) {
        guard let info = n.userInfo,
              let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        switch type {
        case .began:
            // iOS 14.5+: an interruption can be reported only because the app was suspended while
            // silent (e.g. paused in the background). That is not a real interruption of playback.
            if let r = info[AVAudioSessionInterruptionReasonKey] as? UInt,
               AVAudioSession.InterruptionReason(rawValue: r) == .appWasSuspended {
                return
            }
            callSeenDuringInterruption = callObserver.calls.contains { !$0.hasEnded }
            delegate?.sessionInterruptionBegan()
        case .ended:
            let optRaw = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let shouldResume = AVAudioSession.InterruptionOptions(rawValue: optRaw).contains(.shouldResume)
            let wasCall = callSeenDuringInterruption || callObserver.calls.contains { !$0.hasEnded }
            callSeenDuringInterruption = false
            delegate?.sessionInterruptionEnded(shouldResume: shouldResume, wasCall: wasCall)
        @unknown default:
            break
        }
    }

    // MARK: - Route

    private func handleRouteChange(_ n: Notification) {
        let previous = facts.route
        refreshFacts()
        guard let raw = n.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }
        if reason == .oldDeviceUnavailable, previous != .speaker, previous != .none {
            // Apple HIG: pause when headphones are removed, never blast out of the speaker.
            delegate?.sessionOldDeviceUnavailable(previous: previous)
        }
    }

    func refreshFacts() {
        let outputs = session.currentRoute.outputs
        let first = outputs.first
        let route: OutputRoute
        switch first?.portType {
        case .builtInSpeaker?, .builtInReceiver?: route = .speaker
        case .headphones?: route = .wiredHeadphones
        case .bluetoothA2DP?, .bluetoothLE?, .bluetoothHFP?: route = .bluetooth
        case nil: route = .none
        default: route = .airPlayOrCar
        }
        let spatial = outputs.contains { $0.isSpatialAudioEnabled }
        let next = HeadphoneFacts(route: route, monoAudio: UIAccessibility.isMonoAudioEnabled, spatialAudio: spatial, outputName: first?.portName)
        if next != facts {
            facts = next
            delegate?.sessionHeadphoneFactsChanged(next)
        }
    }
}
