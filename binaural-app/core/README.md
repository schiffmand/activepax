# @binaural/core

The UI-independent heart of the binaural layer app: audio engine, journeys (programs), presets, state store, insights and the headphone check. It is framework-free TypeScript (ESM, strict) with no runtime dependencies. The prototype imports it directly, and the production app can use it unchanged on the web or as the reference spec for the native engines.

```bash
npm install
npm test          # vitest, 136 tests, mocked AudioContext
npm run typecheck # tsc --noEmit (also proves a real AudioContext satisfies AudioContextLike)
```

Import from the package root: `import { BinauralEngine, ProgramPlayer, createStore, ... } from '@binaural/core'` (or `../core/src` with a Vite alias).

---

## Quick start

```ts
import {
  BinauralEngine, ProgramPlayer, createStore, localStorageAdapter,
  getBuiltInPreset, getBuiltInProgram, presetToProgram, sessionToRecord, audioProfile,
} from '@binaural/core';

const store = createStore({ adapter: localStorageAdapter() });
await store.hydrate();
const { settings } = store.getState();

const engine = new BinauralEngine({ ...audioProfile(settings), initial: { volume: settings.defaultVolume } });
const player = new ProgramPlayer(engine, {
  onSessionEnd: (s) => store.dispatch({ type: 'history/add', record: sessionToRecord(s) }),
});

// Must be inside a user gesture the first time on the web (autoplay policy):
playButton.onclick = () => player.play(presetToProgram(getBuiltInPreset('focus')!), { timerSec: 50 * 60 });
// or a journey:
player.play(getBuiltInProgram('arrive')!);

player.subscribe((s) => render(s));      // elapsed, remaining, current Hz/band, step label…
volumeSlider.oninput = (e) => engine.setVolume(+e.target.value);
```

---

## Architecture

```
            ┌───────────── UI (prototype / app) ─────────────┐
            │                                                │
   createStore ◄── sessionToRecord ◄── ProgramPlayer ──► BinauralEngine ──► Web Audio
   (reducer, persistence,           (compiled program,     (oscillators, noise,
    migrations)                      timers, pause math)    gains, limiter)
            │                               ▲
   insights (pure)                  compileProgram / sampleProgram (pure)
```

Everything that touches time takes an injectable `Clock` (`systemClock` by default, `createManualClock()` for tests and demo time-lapse). Everything that touches audio takes an injectable `AudioContextLike`.

### Audio graph

```
oscL (carrier − beat/2) ─┐ merger input 0 (LEFT)
                         ├─ ChannelMerger(2) ─ toneGain(0.5) ─┐
oscR (carrier + beat/2) ─┘ merger input 1 (RIGHT)              ├─ levelGain ─ volumeGain ─ fadeGain ─ limiter ─ destination
noise (looped stereo buffer) ─ noiseGain ─────────────────────┘
```

| Gain | Owner | Purpose |
|---|---|---|
| `toneGain` | engine (fixed) | −6 dBFS headroom per sine |
| `levelGain` | ProgramPlayer | program envelope (journeys can get quieter over time) |
| `volumeGain` | user | volume slider, perceptual square law (`volumeToGain`) |
| `fadeGain` | engine | click-free start / stop / pause fades |
| limiter | engine | `DynamicsCompressor` at −6 dB, 20:1, 3 ms attack, a safety net only |

Because each gain has a single owner, the user's volume, the program's envelope and the transport fades never overwrite one another.

Parameter changes go through `rampParam`: cancel-and-hold at the current value, then an exponential ramp for frequencies (perceptually even) or a linear ramp for gains. So there is no zipper noise and no jumps, even when a new glide interrupts one already running. The helpers also track what they scheduled on each param (`setParam` for initial values, `paramValueAt` to read). Browsers without `cancelAndHoldAtTime` (Firefox, including Android) need the current value to emulate a hold, and `AudioParam.value` only refreshes once per render quantum: a fresh gain set to 0 still reads 1, which would turn every fade-in into a click. Tests cover this with `MockAudioContext({ legacyParams: true })`.

---

## API

### `BinauralEngine`

```ts
new BinauralEngine(options?: {
  context?: AudioContextLike;            // inject (tests / shared context)
  createContext?: () => AudioContextLike;// default: new AudioContext({ latencyHint: 'playback' })
  clock?: Clock;
  fadeInSec?: number;   // 2.5
  fadeOutSec?: number;  // 2
  pauseFadeSec?: number;// 0.4
  glideSec?: number;    // 0.4, the default for setBeat/setCarrier/setVolume
  suspendOnPause?: boolean; // true: suspends the AudioContext when paused (battery)
  noiseBufferSec?: number;  // 8
  initial?: { beatHz?, carrierHz?, volume?, level?, noise? };
})
```

| Method | Notes |
|---|---|
| `start(params?)` | Resumes the context, builds the graph and fades in. Calling it while stopping or paused cancels the teardown and glides to the new params on the same graph. If the context isn't running within `RESUME_TIMEOUT_MS` (500 ms; browsers leave a blocked `resume()` pending forever) or `resume()` rejects, it rejects with `AudioBlockedError`, so show "Tap to start". `noise: { type: 'off' }` keeps the remembered noise volume. |
| `stop({ fadeSec? })` | Fades out, then stops and disconnects every node, then suspends the context (with `suspendOnPause`) so an idle app doesn't hold the audio session. Resolves when silent. |
| `pause()` / `resume()` / `toggle()` | Short fade, then `ctx.suspend()`. Resume fades back in. |
| `rampTo({ beatHz?, carrierHz?, level? }, durationSec, curve)` | Used by the player. `curve`: `'exponential' \| 'linear' \| 'step'`. |
| `setBeat(hz, glide?)`, `setCarrier(hz, glide?)`, `setLevel(0..1, glide?)`, `setVolume(0..1, glide?)` | All glide, and all clamp to `LIMITS`. |
| `setNoise({ type?: 'white'\|'pink'\|'brown'\|'off', volume? }, fadeSec?)` | Crossfades when the colour changes. Buffers are cached. |
| `hold()` | Freezes any glide at its current value. |
| `getState()` | `{ status, beatHz, carrierHz, leftHz, rightHz, band, volume, level, noise }` (target values). |
| `getCurrentFrequencies()` | The instantaneous values mid-glide, read from the audio params. |
| `subscribe(fn)` / `on('started'\|'paused'\|'resumed'\|'stopped'\|'error'\|'state', fn)` | Return an unsubscribe function. Listener errors are isolated. |
| `dispose()` | Immediate teardown. Closes the context only if the engine created it. |

Helpers: `volumeToGain`, `gainToVolume`, `gainToDb`, `sanitizeTone`, `TONE_HEADROOM`, `NOISE_HEADROOM`, `rampParam`, `holdParam`, and `generateNoise(type, length, { seed, peak, loopCrossfadeSamples })`. `generateNoise` is pure: white, pink (Kellet) or brown (leaky integrator), with DC removed, peak normalised and an equal-power seamless loop.

### Programs (journeys)

```ts
interface Program {
  id: string; name: string; tagline?: string;
  start: { beatHz; carrierHz; level?; noise? };
  segments: { durationSec; beatHz?; carrierHz?; level?; curve?; label?; noise? }[]; // no targets = hold
  end: 'hold' | 'stop';  // hold the last values forever, or fade out and finish
  endFadeSec?: number;   // default 20
  volume?: number; presetId?: string;
}
```

- `compileProgram(p) → CompiledProgram` is pure. It returns absolute-time `steps[]` (`atSec`, `durationSec`, `from`, `to`, `curve`, `label`, `noise`), `timedSec`, and `totalSec` (null when the program holds).
- `sampleProgram(c, tSec)` is pure and returns `{ beatHz, carrierHz, level, stepIndex, phase: 'ramp'|'hold'|'after', label }`. It drives UI progress and visuals without touching audio.
- `bandSecondsBetween(c, from, to)` gives the time spent in each band. Insights use it.
- `validateProgram`, `createProgram` (returns a `Result`), and `presetToProgram(preset)` (a preset is a program that holds).
- `BUILT_IN_PROGRAMS` contains: `arrive` (14→10 Hz over 8 min, then hold), `ease-into-focus`, `deep-work-block` (5 + 40 + 5 min), `reset` (10 min), `wind-down`, and `sleep-descent`.

### `ProgramPlayer` (scheduler and timer)

```ts
const player = new ProgramPlayer(engine /* any EngineLike */, { clock?, tickMs = 1000, onSessionEnd? });
await player.play(program, { timerSec?, endFadeSec?, volume? });
player.pause(); player.resume(); player.stop(fadeSec?); player.setTimer(sec | null);
player.getState(); // { status, programId, presetId, name, elapsedSec, endsAtSec, remainingSec,
                   //   timerSec, stepIndex, stepLabel, current: {beatHz, carrierHz, level, band}, startedAt }
player.subscribe(fn); player.on('step' | 'ended' | 'state', fn);
```

- It schedules one Web Audio ramp per segment. The audio thread does the smoothing, and JS wakes only at segment boundaries, at the start of the end fade, and on UI ticks.
- Pauses are excluded from elapsed time. On resume, the player snaps to the exact schedule position while the fade gain is silent, so long pauses never drift.
- The session ends at `min(timerSec, program totalSec)` with a fade of `endFadeSec`. The fade starts early enough to reach silence exactly at the end.
- It emits one `SessionSummary` per session: `{ programId, presetId, name, startedAt, endedAt, durationSec, band, bandSeconds, completed, endedBy: 'timer'|'program'|'user' }`. Turn it into a history record with `sessionToRecord`.

### Presets

- `BUILT_IN_PRESETS` (frozen):

  | Preset | Beat | Band | Carrier | Volume | Noise |
  |---|---|---|---|---|---|
  | Focus | 16 Hz | beta | 200 Hz | 0.30 | none |
  | Deep Work | 40 Hz | gamma | 220 Hz | 0.28 | pink |
  | Calm | 10 Hz | alpha | 180 Hz | 0.30 | none |
  | Wind Down | 6 Hz | theta | 160 Hz | 0.26 | pink |
  | Sleep | 2 Hz | delta | 120 Hz | 0.22 | brown |

  The default volumes are deliberately low because the beats sit under music.
- `validateTone(beat, carrier)` enforces beat 0.5–45 Hz, carrier 40–1000 Hz, and beat < carrier. `validatePreset(input)` also checks the name (1–40 characters), volume and noise. Both return human-readable error strings.
- `createCustomPreset(input)` and `updateCustomPreset(existing, patch)` return `Result<Preset>` and never throw. Built-ins can't be edited.
- Also exported: `bandFor(hz)`, `earFrequencies(carrier, beat)` and `LIMITS`.

### Store

```ts
const store = createStore({ adapter?: PersistenceAdapter, key?: string, initialState? });
await store.hydrate();          // load + migrate; returns { status: 'empty'|'current'|'migrated'|'future'|'corrupt', ... }
store.dispatch(action); store.getState(); store.subscribe((state, action) => …); await store.flush();
store.readOnly                  // true if stored data is from a newer schema (or corrupt and un-backup-able); never overwritten
```

- **Corrupt data is never lost.** If migrate() reports `'corrupt'` (unparseable text, bad version, wrong shape), `hydrate()` first copies the original bytes to `${key}.corrupt-<timestamp>` and returns that key as `outcome.backupKey`, then runs on defaults. If the backup write throws, the store stays `readOnly` so the original is not overwritten.
- **Reducer validation:** `settings/update` goes through `sanitizeSettingsPatch` (NaN, wrong types and unknown enums are dropped; an all-invalid patch is a no-op). `history/add` rejects non-finite `durationSec`/`startedAt`, and `history/rate` ignores a non-finite feeling.
- **State (schema v2):** `{ schemaVersion, customPresets, favorites, settings, history, lastPlayed }`.
- **Settings:**
  - `defaultVolume`
  - `reducedMotion: 'system'|'reduce'|'full'`
  - `sensoryMode`
  - `hapticsEnabled`
  - `showFrequencies`
  - `defaultTimerSec`
  - `theme`
  - `headphoneCheck: { verdict, at }`
  - `onboarded`
- **Actions:**
  - `preset/add|update|remove`
  - `favorite/toggle|reorder`
  - `settings/update`
  - `history/add|rate|remove|clear`
  - `lastPlayed/set`
  - `state/replace|reset`

  `reducer` is exported and pure. A no-op returns the same reference and causes no write.
- **Rules:** sessions shorter than 30 s are not recorded. History is capped at 2000 sessions and favourites at 24. `feeling` is an optional 1–5 self-report and is never required.
- **Adapters:** `memoryAdapter()` and `localStorageAdapter(storage?)`. Every storage access is wrapped in try/catch so private mode or a full quota can't break the app. Adapters can be sync or async, and writes are serialised.
- **Migrations:** `MIGRATIONS[n]` upgrades version n to n+1, and `migrate(raw)` runs the chain and then `normalize`s the result. To change the schema, add a migration and bump `SCHEMA_VERSION`. Never edit an existing migration.
- **Derived settings:**
  - `audioProfile(settings)`: sensory mode gives 6 s fades, a 1.5 s glide and a 0.6 volume ceiling.
  - `prefersReducedMotion(settings, systemPref)`: sensory mode always reduces motion.

### Insights (pure, no streaks)

- `summarizeWeek(history, now, weekStartsOn?)` and `summarizeRange(history, range)` return a `RangeSummary` containing:
  - `totalSec`, `sessions`, `byBand`, `topBands`
  - `activeDays` (informational, not a streak)
  - `longestSessionSec`, `averageSessionSec`
  - `perDay[]` with 7 complete buckets. Sessions that cross midnight are split between days.
  - `byTimeOfDay`, `favoriteName`, `averageFeeling`
- `weekRange`, `lastNDays`, `clipSession`, `timeOfDay`, `formatDuration`.
- `reflections(summary)` returns at most three gentle, descriptive sentences. Tests assert they never mention streaks, missed days or goals.
- `compareRanges(a, b)` returns `'more' | 'less' | 'similar'` (±15 % counts as similar), with no alarm language.
- `BAND_LABELS` maps bands to the use people put them to: delta→Sleep, theta→Wind down, alpha→Calm, beta→Focus, gamma→Deep work.

### Headphone / stereo check

- `planStereoCheck(opts)` is pure and returns the timeline: left, then right, by default.
- `await runStereoCheck(ctx, { clock?, onStep?, toneSec, gapSec, frequencyHz=440, volume, edgeSec })` resolves to `{ steps, totalSec, done, cancel() }`. It is async because it resumes a suspended context first (after the engine paused or stopped), and rejects with `AudioBlockedError` if the context won't run. Without that, the `onStep` timers would fire over silence and produce a false "one ear" verdict. Call it from a tap. It routes through the same `ChannelMerger` hard-pan as the engine, and uses soft 80 ms edges so there are no clicks.
- `interpretStereoCheck(answers)` returns a verdict of `'ok' | 'swapped' | 'mono' | 'one-ear' | 'unsure'`, with calm copy and concrete tips (for example, turn off Mono Audio or Spatial Audio). Swapped channels are reported as fine, because binaural beats work either way round.

---

## Mapping to native (iOS / Android)

The binaural layer has to play **under** Spotify, podcasts and YouTube without pausing or ducking them. The web prototype can't fully demonstrate that, so the native shells need to work like this.

### iOS (AVFoundation)

| Core concept | iOS |
|---|---|
| Coexisting with other audio | `AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])`. **Do not** use `.duckOthers`, because we sit under the music and never push it down. Without `.mixWithOthers`, starting our audio pauses Spotify. |
| Background playback | `UIBackgroundModes: audio` in Info.plist. Keep the engine running and the session active. |
| Oscillators + merger | Use `AVAudioEngine` with an `AVAudioSourceNode` that renders a stereo buffer directly: `L[i] = sin(φL)`, `R[i] = sin(φR)`, with phase accumulators. Hard panning is implicit because the channels are written separately. |
| Glides (`rampParam`) | Per-sample smoothing inside the render block. Exponential interpolation of each ear's frequency toward its target over N samples, matching `sampleProgram`. |
| gains / limiter | `AVAudioMixerNode` volume, or multiply in the render block. Limiter: `AVAudioUnitEffect` with `kAudioUnitSubType_PeakLimiter`. |
| Noise bed | `AVAudioPlayerNode` scheduling a looped `AVAudioPCMBuffer`. Use the same `generateNoise` algorithm (port it, or precompute assets). |
| pause / suspend | Fade, then `engine.pause()`. Keep the session active if a timer is running. |
| Interruptions | Observe `AVAudioSession.interruptionNotification` (a call or Siri ends it) and `routeChangeNotification`. Headphones unplugged → `.oldDeviceUnavailable` → pause, because speakers can't do binaural. |
| Mono / Spatial Audio | `UIAccessibility.isMonoAudioEnabled`, plus `monoAudioStatusDidChangeNotification`. If it's on, show the stereo-check `mono` guidance. Spatial Audio can't be queried, so detect it with the stereo check. |
| Lock screen | Optional. Set `MPNowPlayingInfoCenter` **only** if you want our controls. With `.mixWithOthers` the other app normally keeps the Now Playing slot, which is what we want. |

### Android

| Core concept | Android |
|---|---|
| Coexisting with other audio | **Don't request audio focus** (or ignore focus loss). Requesting `AUDIOFOCUS_GAIN` would pause Spotify. Set `AudioAttributes` to `USAGE_MEDIA` / `CONTENT_TYPE_MUSIC` (or `USAGE_ASSISTANCE_SONIFICATION` if a vendor ducks media). |
| Background playback | A foreground service with `foregroundServiceType="mediaPlayback"`, a persistent notification, and the `FOREGROUND_SERVICE_MEDIA_PLAYBACK` permission (API 34+). |
| Oscillators + merger | `AudioTrack` in `ENCODING_PCM_FLOAT`, `CHANNEL_OUT_STEREO`, streaming mode, with a render thread that writes interleaved L/R sines. Or use Oboe (C++) for low CPU. |
| Glides, gains, limiter | Same per-sample smoothing as iOS. Gains are multiplied in. Use a simple look-ahead peak limiter, or `DynamicsProcessing` (API 28+). |
| Noise bed | Mix the looped noise buffer into the same render loop. |
| Interruptions | `ACTION_AUDIO_BECOMING_NOISY` (headphones unplugged) → fade and pause. A phone call → `TelephonyCallback`, or let focus behaviour pass because we don't hold focus. |
| Mono audio | `Settings.System` `master_mono` (where readable), the accessibility balance setting, and the stereo check. |

### What ports 1:1

`programs.ts`, `presets.ts`, `insights.ts`, `store/*` (as JSON with the same migrations), `stereoCheck.interpretStereoCheck` and `planStereoCheck` are pure. Port them directly, or run them in a JS runtime (React Native or Capacitor) and drive only a thin native audio module with the `EngineLike` interface:

```ts
interface EngineLike {
  start(params?): Promise<void>; stop({ fadeSec? }?): Promise<void>; pause(): Promise<void>; resume(): Promise<void>;
  rampTo(target, durationSec?, curve?): void; setNoise(noise, fadeSec?): void; getState(): { status };
}
```

`ProgramPlayer` accepts any `EngineLike`. A React Native or Capacitor bridge to the native engine can therefore reuse the scheduler, timer and session accounting unchanged.

## Honesty constraints (enforced in tests)

- No medical claims appear in preset or program copy. Tests scan for words such as cure, treat, heal, ADHD, insomnia and proven. The research on binaural beats is mixed and effects are individual, so the copy describes what a sound is *for*, not what it does to your brain.
- Insights contain no streaks, goals that can be failed, or "you missed a day" messages.
- Sensory mode is opt-in. It gives softer, longer fades, a lower volume ceiling and reduced motion.
