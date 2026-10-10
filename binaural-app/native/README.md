# Tuck native engines (reference, not yet compiled)

> **Status: reference implementations, not yet compiled.** None of these files has been built,
> linted or run on a device. They are a precise, reviewable spec written in Swift and Kotlin
> against current platform APIs (iOS 16+, Android minSdk 26 / targetSdk 35). Expect small API and
> compile fixes when they go into real Xcode and Gradle projects. The behaviour they describe is
> intended to be final. The tested source of truth for all logic is the TypeScript core in
> [`../core`](../core).

The product is a **layer**: binaural tones and optional gentle noise that play *underneath*
Spotify, podcasts or YouTube, never instead of them. Each platform has one rule that makes this work,
and the rest of the code follows from it.

| | iOS | Android |
|---|---|---|
| **The layer rule** | `AVAudioSession` category `.playback` with option `.mixWithOthers` (no `.duckOthers`) | Never call `requestAudioFocus()`. Play `USAGE_MEDIA` through an `AudioTrack` |
| Keeps playing in the background | `UIBackgroundModes = audio` ([`Info.plist.additions.xml`](ios/Tuck/Info.plist.additions.xml)) | Foreground service, `foregroundServiceType="mediaPlayback"` ([`AndroidManifest.xml`](android/app/src/main/AndroidManifest.xml)) |
| Doesn't steal the user's music controls | A mixable session is never "Now Playing". We don't touch `MPNowPlayingInfoCenter` or `MPRemoteCommandCenter`. Our lock-screen control is a Live Activity | No `MediaSession` and no `MediaStyle` notification. A plain ongoing notification with **Stop** |
| Tone generator | `AVAudioEngine` + `AVAudioSourceNode` render block | `AudioTrack` (`MODE_STREAM`, float PCM) fed by a writer thread |
| Calls | Interruption notifications, plus `CXCallObserver` to tell a call from other interruptions. Never auto-resume after a call | No focus callbacks, so we watch `AudioManager` mode (`IN_CALL` / `IN_COMMUNICATION`). Pause, never auto-resume |
| Headphones removed | Route change `.oldDeviceUnavailable` → pause | `ACTION_AUDIO_BECOMING_NOISY` → pause |
| Mono Audio | `UIAccessibility.isMonoAudioEnabled` + change notification | `Settings.System "master_mono"` (hidden AOSP key, best effort) |
| Spatial Audio | Detect `isSpatialAudioEnabled` on the route and warn (apps can't opt a stereo stream out) | Opt the stream out with `setSpatializationBehavior(SPATIALIZATION_BEHAVIOR_NEVER)` (API 32+), and report spatializer state |

## Files

```
native/
├── ios/Tuck/
│   ├── Model.swift                 Presets, programs, compileProgram: mirrors core/src/{types,presets,programs}.ts
│   ├── NoiseGenerator.swift        mulberry32 + white / pink (Kellet) / brown, streaming, allocation-free
│   ├── ToneRenderer.swift          Real-time DSP: per-ear sines, noise bed, smoothed ramps, command ring
│   ├── BinauralEngine.swift        AVAudioEngine host: start/stop/pause/resume/rampTo/setVolume/setNoise
│   ├── AudioSessionController.swift  .playback + .mixWithOthers, interruptions, route/mono/spatial facts
│   ├── ProgramRunner.swift         Plays a Program step by step (twin of core ProgramPlayer)
│   └── Info.plist.additions.xml    UIBackgroundModes=audio (+ Live Activities)
└── android/app/src/main/
    ├── AndroidManifest.xml         FGS mediaPlayback permissions + service
    └── java/app/tuck/layer/
        ├── model/Model.kt          Same model, kotlinx.serialization with identical JSON names
        ├── audio/ToneRenderer.kt   Pure-Kotlin DSP (JVM-testable): ramps, mulberry32, noise, renderer
        ├── audio/BinauralEngine.kt AudioTrack + writer thread, no audio focus
        ├── audio/HeadphoneMonitor.kt  Becoming-noisy, call mode, output route, mono, spatializer
        ├── service/ProgramRunner.kt   Plays a Program step by step
        └── service/LayerService.kt    Foreground service + "Focus · 36 min left [Stop]" notification
```

## Shared design (both platforms)

The signal path is the same as the web graph in `core/src/audio/engine.ts`:

```
sin(left ear)  ─┐
                ├─ × TONE_HEADROOM (0.5) ─┐
sin(right ear) ─┘                          ├─ × level × volumeGain × fade ─> L / R
noise L/R (seeds 11 / 23) × gain ──────────┘
```

- **Ears, not beat.** Left = carrier − beat/2 and right = carrier + beat/2, each with its own phase
  accumulator. Glides ramp each ear's frequency exponentially, exactly as the web engine does, so
  `sampleProgram()` in core predicts native playback too.
- **Headroom, no limiter.** Tones peak at 0.5 and noise at 0.9 × 0.5, so the worst case is below
  full scale before any gain ≤ 1 is applied. There is no compressor to pump.
- **Gains:** `fade` belongs to the engine (start/stop/pause), `volumeGain` to the user (Depth),
  and `level` to the program envelope. None of them fight each other.
- **Click-free by construction.** Every parameter is a per-sample `Ramp` that retargets from its
  *current* value, which is the native equivalent of `cancelAndHoldAtTime`. Gain changes are never
  shorter than 30 ms. Fades run on start (2.5 s), stop (2 s) and pause (0.4 s).
- **Real-time safety.** The render/writer thread never allocates or blocks. iOS uses a fixed command
  ring behind an `os_unfair_lock` that the render thread only *tries* to take. Android uses a
  `ConcurrentLinkedQueue` (allocation happens on the producer side only).
- **Noise** is generated as a stream, not a looped buffer, so it has no loop seam. It uses the same
  PRNG and filters as `core/src/audio/noise.ts`. Peak scaling is empirical (a stream can't be
  peak-normalised), followed by a DC blocker and a ±0.9 safety clamp.

### Lessons from the core's review rounds, applied here

- `getState()` derives ear frequencies and band from beat + carrier every time, so they are never
  stale after a program switch.
- "Noise off" keeps the remembered noise volume (`NaN`/0 means "unchanged" when the type is off), so
  playing a program without a noise bed and then turning noise on is audible.
- `stop()` releases the output (AVAudioEngine stopped and session deactivated / AudioTrack released),
  so an idle app doesn't render silence or hold the audio session.
- Calls pause and **never auto-resume** (spec §5.7: "Paused for your call. [Resume]").
- Losing the headphones pauses. It never falls back to the phone speaker on its own.
- Sound only ever starts from a user action. The Android service is `START_NOT_STICKY`.

## Mirroring the data model

`Model.swift` and `model/Model.kt` mirror `core/src/types.ts`, `presets.ts` and `programs.ts`:
`Band`, `NoiseSetting` (`type: off|white|pink|brown`), `RampCurve`, `ToneTarget`, `LIMITS`,
`sanitizeTone`, `volumeToGain`, `Preset`, `Program` / `ProgramSegment`, `compileProgram`,
`presetToProgram`, and the five built-in presets and six built-in programs with the same ids. JSON
field names and enum strings are identical, so a preset or program saved by one platform loads on
the others. **When the TypeScript model changes, update both native files in the same commit.**
A cheap guard for later is a CI step that exports `BUILT_IN_PRESETS` / `BUILT_IN_PROGRAMS` from core
as JSON and compares them with the native lists in unit tests.

## Platform notes and known gaps

**iOS**
- Configure the session before the first start, and again after `mediaServicesWereReset`
  (category and options are lost). The controller does both.
- `AVAudioEngineConfigurationChange` (for example AirPods connecting at a new sample rate) stops the
  engine. The engine rebuilds the renderer at the new rate and fades back in if it was playing.
- An interruption with reason `.appWasSuspended` (iOS 14.5+) is not a real interruption and is ignored.
- If activating the session fails during a phone call, `start()` throws `EngineError.sessionRefused`.
  The UI should say "Can't start during a call", not show a generic error.
- Live Activity (spec §5.8) and the headphone-state UI are not included here. The engine publishes
  `HeadphoneFacts` and `pausedForCall` / `pausedForRouteLoss` events for them.

**Android**
- Never request audio focus, not even transiently. Some OEM builds (notably older MIUI and EMUI)
  pause apps that play without focus when another app takes it. Test on those and document it in
  support copy rather than grabbing focus.
- If `POST_NOTIFICATIONS` is denied, the foreground service still runs, but its notification is
  hidden (it appears in the task manager). Ask for the permission in context on first play.
- `master_mono` is a hidden AOSP setting, and some OEMs use a different key. Fall back to the
  in-app stereo check (`interpretStereoCheck` in core).
- Before API 31 there is no mode-change listener, so the monitor polls `AudioManager.mode` once a
  second while running.
- Custom presets and programs reach the service as JSON. Only built-in ids are resolved in this
  reference.

## Before shipping (checklist)

1. Create the Xcode and Gradle projects, add these files, and fix compile errors.
2. Port the core's engine tests to XCTest / JUnit against `ToneRenderer`. It is pure, so tests can
   render a buffer and assert on it: fade-in from 0 with no click, ear frequencies after a glide,
   noise crossfade continuity, swap channels, and "noise off keeps volume".
3. Test on devices with music playing in Spotify, Apple Music / YouTube Music and a podcast app.
   Start Tuck first, then the other app, and the other way round. Neither may pause the other.
4. Test calls (cellular and VoIP), Siri / Assistant, alarms, unplugging headphones, Bluetooth
   reconnects, and the lock screen for 60+ minutes.
5. Measure battery over an hour of playback at the default buffer sizes.
