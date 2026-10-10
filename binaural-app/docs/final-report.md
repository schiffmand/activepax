# Tuck: final report (incubation, v0.2)

**Date:** 10 Oct 2026 · **Status:** prototype complete, ready for a native TestFlight MVP
**Build:** `prototype/dist/index.html` (one self-contained file, about 820 kB, works from `file://`) · **Core:** 181 tests passing, typecheck clean, plus a real-browser ramp check (`node tools/ramp-check.mjs`) · **Screens:** 60 captures in [`screens/`](./screens/)

---

## 1. Product and positioning

**Tuck: Sound Under Your Audio.** Store subtitle: *Binaural beats & brown noise*. Named fallback if trademark clearance fails: **Lining**.

> *Tuck a little sound under whatever you're playing.*

Tuck is a phone app that plays a soft layer of binaural tones and gentle noise **underneath** the audio you already chose, whether that's Spotify, a podcast, a lecture or YouTube. It never pauses, ducks or replaces that audio. This works because both platforms allow it: on iOS, `AVAudioSession .playback + .mixWithOthers`; on Android, no audio-focus request plus a `mediaPlayback` foreground service.

**The wedge.** The category splits in two (see [`competitors.md`](./competitors.md)):

- **Players** (Brain.fm, Endel, YouTube binaural playlists) make you give up your own audio, cost $60–100 a year, and draw billing complaints.
- **Layers** (iOS Background Sounds, Dark Noise, myNoise) either offer noise only, or are utilitarian tone generators with woo-adjacent copy.

Nobody has shipped a beautiful, honest *binaural-plus-noise layer built to sit under your own audio* and designed around ADHD, autistic and deep-work users. Apple's free Background Sounds is the real benchmark, and Tuck has to beat it on beats, intents, timers, headphone guidance and honesty, without adding friction.

**Brand stance.** The category sells power ("unlock", "boost", "hack"). Tuck sells company. It makes no medical claims, keeps exact numbers one tap away, and says plainly that the science is mixed: *"We tell you what it is and what we know."* Full brand: [`brand.md`](./brand.md).

## 2. Persona insights that drove decisions

Full personas: [`personas.md`](./personas.md).

| Persona | Insight | What it changed |
|---|---|---|
| **Maya**, ADHD knowledge worker | Starting is the hard part. Streaks and "come back" nags read as punishment, and she's been burned by trial billing. | One-decision Home ("Same as last time?"). One tap from the intro to the first sound. **Start without opening Tuck** (Control Center, Shortcuts automation "when Spotify opens", Lock Screen widget). Weekly totals, never streaks. Take 5 / Another 25 min. Vary for novelty without having to choose. |
| **Dev**, programmer in deep work | Allergic to pseudoscience. Wants exact parameters, no account, and n-of-1 evidence. | Engraved readout (`14 Hz · L 200 / R 214`) that flips to a spec card with dBFS levels and the envelope plot. Edit a copy. A free **blind comparison** (beat vs a sham with the same tones and no beat, A/B, numbers hidden). Exports that never fail silently: the file is always shown to copy. |
| **Sam**, autistic / sensory-sensitive | Needs sameness and predictability: no sudden sounds, no motion, literal words. | Saved layers are frozen ("It won't change unless you change it."). Long perceptual (dB) fades. A lockable level ceiling. Sensory mode (compact text, no greeting, reduced motion). Plain labels. The metaphor never appears on a control. |
| **Priya**, sleep & longevity optimizer | Wants a protocol, evidence literacy and integrations, with nothing bright at night. | Evening descent (8 → 2 Hz over 30 min, then a fade). Dim wool theme after 21:00. One daily schedule. Free Health mindful minutes. A private log with next-morning sleep notes. "What we know" includes null and negative results. |
| **Leo**, student | Uses cheap earbuds, 1.5× lectures and pomodoros, and has little money. | The ear check catches mono, one-ear and swapped earbuds. Cycles (25 + 5 at Quiet). The whole layer is free. |
| **Hannah**, skeptic | "The steadiest evidence is for noise." | Noise only is a first-class mode, and the copy says "It isn't a treatment." There are no health claims anywhere (core tests scan for them). |

## 3. Key UX and brand decisions, and why

1. **The layer is the interface.** A felt panel sits at the bottom of Home (the "lining"). You pull it up or tap **Start sound**. Its height *is* the level (Quiet, Medium, Full), so the metaphor and the control are the same object.
2. **Arrival, not frequency.** Home asks "How are you arriving?" (Scattered, Wound up, Too much, Heavy-eyed, Just working) and maps the answer literally to a layer ("That's Focus: a 14 Hz beat over soft brown noise."). Users name a state, never a deficit, and the mapping is always visible.
3. **Engraved, not advertised.** Numbers are always present but small (16 px tabular figures). Only the spec card and the Live Activity get a big number. Marketing never uses a number as a promise.
4. **Honest audio indicator.** "Your audio keeps playing above" / "Nothing else playing". Tuck never shows another app's name, because the phone doesn't tell it and we don't pretend to know.
5. **Headphones are a first-class state.** An ear check runs in onboarding and is always available from the Menu. Speaker, one earbud, call mode, Mono and disconnected fall back to loudness-matched noise only, shown as a calm one-line pill. The Mono/Spatial verdict reports what it observed and offers "Show me where" and "I've changed it, check again".
6. **One noise law, everywhere** (from round 2's ship-blocker). Noise % is linear amplitude relative to the beat: 100% equals the beat's loudness and 25% is −12 dB. Noise only is matched to the layer it replaces. The same law applies in core, the prototype, Swift and Kotlin, and `loudness.test.ts` guards it.
7. **Nothing to keep up with.** No streaks, no goals you can fail, no badges. Activation is marked once, quietly: "Stayed under your audio for 10 min".
8. **Accessibility as a feature.** All text is in rem. At 200% text the layer grows, its middle scrolls with a soft edge fade, Start / Stop stay pinned, the top indicator stays one line, and a More cue shows when the top content runs under the layer. Every control has keyboard support and a visible focus ring. Reduce Motion and Reduce Transparency are honoured.
9. **Visual identity.** Wool palette (moss/charcoal by day, warm dim wool at night). Literata for display text and Atkinson Hyperlegible Next for UI. The "stitch", a blue left half and a yellow right half with the beat in the gap, is the only motif.

## 4. Council score history

| Round | Average | Minimum | Scores |
|---|---|---|---|
| 1 | **6.95** | 6.5 | Maya (ADHD knowledge worker) 7 · Dev (programmer in deep work) 7.5 · Sam (autistic / sensory-sensitive) 6.5 · Priya (longevity / sleep optimizer) 6.5 · Leo (student) 7 · Hannah (skeptic) 7.5 · Apple Design Award-level product designer 7 · Accessibility & neurodiversity UX specialist 7.5 · Audio engineer 6.5 · Growth / product strategist 6.5 |
| 2 | **7.3** | 5.5 | Maya 7.5 · Dev 8 · Sam 7.5 · Priya 7.5 · Leo 7.5 · Hannah 7.5 · Product designer (ADA bar) 7.5 · Accessibility & neurodiversity UX 7.5 · Audio engineer **5.5** · Growth / product strategist 7 |
| 3 | **7.85** | 6.5 | Maya 8 · Dev 8 · Sam 8 · Priya 8 · Leo 8.5 · Hannah 8 · Product designer (ADA bar) 8 · Accessibility & neurodiversity UX 8 · Audio engineer **6.5** · Growth / product strategist 7.5 |
| 4 | **8.5** | 8.0 | Maya 8.5 · Dev 8.5 · Sam **8** · Priya 8.5 · Leo 9 · Hannah 8.5 · Product designer (ADA bar) 8.5 · Accessibility & neurodiversity UX **8** · Audio engineer 9 · Growth / product strategist 8.5 |
| 5 | *not yet scored* | | Target: average ≥ 8.7 and every reviewer ≥ 8. The round-4 fixes are in [`reviews/round-4-response.md`](./reviews/round-4-response.md). |

**Round 4 trend.** For the first time every reviewer is at 8 or above and nothing is a ship-blocker. The audio engineer went from 6.5 to 9 after measuring the ramp fix end to end. What held the mean at 8.5 was the top of Home. At default text size the playing layer covered the "Started at…" line at Full, with any headphone pill and on a shared layer, and drew a **More** pill on top of it. At 200% that pill floated over the words it was meant to reveal (Sam and accessibility, both 8). The second theme was numbers that disagreed: the journey readout mixed a live beat with static ears ("7.8 Hz · L 136 / R 144"), the same session read 43 min and 44 min, and the editor derived L / R from an invalid beat. All are fixed at the cause in round 5 ([`reviews/round-4-response.md`](./reviews/round-4-response.md)). The layer now rests no higher than leaves Home's measured top visible, and the More cue exists only at accessibility sizes, in its own reserved row. There is one self-consistent readout helper, one minute rule (listening time up to Stop, rounded down), and every built-in layer's noise only is pinned within 0.3 LU (K-weighted) of the layer it replaces.

**Reading the round-3 trend.** Round 3 put all six customers at 8 or above for the first time ("I'd keep it"); Leo reached 8.5. Two reviewers held the minimum down. The audio engineer (6.5) measured a new ship-blocker in core's shared ramp code: `cancelAndHoldAtTime` inserts no anchor once a param's last event has finished, so every Stop and level change after a long still period started with a jump (about −27 dB within a second after 49 s; a click on Medium → Quiet). Growth (7.5) found every Export button silent inside the sandboxed published viewer, and a blind comparison whose arms could be told apart by ear. All three are fixed in round 4: an explicit anchor after every hold (with spec-faithful mock tests and a real-browser `OfflineAudioContext` check, `tools/ramp-check.mjs`), an Export sheet that always shows the file to copy and says what happened, and a sham control arm (same carrier in both ears, 0 Hz beat, same level). Measured in the built page after the fix: Stop after 20 s fades 0.1 dB in its first 50 ms and is −20 dB at +10 s; Medium → Quiet glides with no step. (A Beat On ↔ Off row reported here was withdrawn in round 4: it was driven through `session.setBinaural()`, which Home's sync effect undoes, so it measured a no-op. The round-4 panel's UI-driven measurement, −30.8 → −30.1 dBFS with the tones gone, is the record.)

**Round 2 trend.** Nine of the ten reviewers rose or held. The audio engineer fell from 6.5 to 5.5 because measuring the real output exposed a ship-blocker: the noise bed sat at −67 dBFS RMS, 36 dB under the tones, so noise only and the speaker fallback were effectively silent.

That was fixed after round 2 ([`reviews/round-2-response.md`](./reviews/round-2-response.md)). Measured in the built page, Focus at Medium now has the beat at −31 dBFS and the noise at −43 dBFS, and noise only lands at −30 dBFS, within 1 dB of the layer it replaces. The round-2 bugs (B1–B13) and the council's must-fixes were all closed in the same pass.

Round 3 re-scored the build with these fixes in (row 3).

## 5. What's real vs mocked

| Real (works in the prototype today) | Mocked or simulated |
|---|---|
| Real binaural beats in the browser through `@binaural/core`'s `BinauralEngine` (hard-panned L/R sines, perceptual fades, glides, no zipper noise) | **Mixing under other apps.** A browser can't sit under Spotify. The "other app" is simulated (generated music or speech) in Prototype controls. |
| Loudness-matched white / pink / brown noise beds (core `generateNoise`, RMS-normalised, seamless loops) | **Headphone routes** (speaker, one earbud, call, Mono, Spatial, swapped, disconnected) are set by hand. Native apps read them from the audio route. |
| Programs and journeys (Evening descent), timers, Cycles, Take 5, Drift / Vary / Hold, all driven by core's `ProgramPlayer` | **Lock Screen / Live Activity, Control Center, Shortcuts, widget.** Drawn and described, not wired. |
| The ear check (a real stereo test with verdict logic from core `interpretStereoCheck`) | **Apple Health / Health Connect writes, schedules firing in the background, sync**: UI only. |
| Persistence (core store, localStorage, migrations, corrupt-data backup), saved layers, private log with CSV/JSON export (an Export sheet with the file to copy, so it works even where downloads are blocked), the blind comparison with computed averages | **Tuck Plus purchase.** Price and trial are shown (a proposal), but there is no StoreKit / Play Billing. |
| Shareable layer links (`?layer=…`) that open and play the shared layer | **Time**: a warp clock and "Skip ahead" compress sessions, and `?hour=` fakes the time of day. Sample week data is labelled "Sample data" on screen. |
| Native engines (Swift / Kotlin), written in full against current APIs | **Never compiled or run on a device** (see `native/README.md`). |

## 6. Core API overview

`@binaural/core` is framework-free, strict TypeScript ESM with no runtime dependencies. Full reference: [`../core/README.md`](../core/README.md).

- **`BinauralEngine`**: Web Audio graph (oscL / oscR → ChannelMerger → tone / level / volume / fade gains → limiter). Methods: `start / stop / pause / resume`, `rampTo`, `setBeat / setCarrier / setVolume / setNoise`, `subscribe`. Throws `AudioBlockedError` when autoplay blocks it, and works with an injectable `AudioContextLike` and `Clock`.
- **Programs**: `compileProgram` and `sampleProgram` (pure), `ProgramPlayer` (schedules one audio ramp per segment, pause-exact, timer with end fade, emits a `SessionSummary`). Built-ins: arrive, ease-into-focus, deep-work-block, reset, wind-down, sleep-descent.
- **Presets**: `BUILT_IN_PRESETS`, `validateTone`, `createCustomPreset`, `bandFor`, `earFrequencies`, `LIMITS`.
- **Loudness**: `noiseVolumeToGain`, `noiseOnlyGain`, `NOISE_RMS`, `toneDbfs / noiseDbfs / noiseDbReBeat / formatDb`. These produce the real dBFS figures shown on the spec card.
- **Store**: `createStore` (reducer, schema v2, migrations, corrupt-data backup, read-only on future schemas), `memoryAdapter`, `localStorageAdapter`, `audioProfile(settings)` (sensory mode means longer fades and a lower ceiling).
- **Insights**: `summarizeWeek / summarizeRange`, `reflections` (at most three gentle sentences, tested never to mention streaks), `compareRanges`.
- **Stereo check**: `planStereoCheck`, `runStereoCheck`, `interpretStereoCheck` → `ok | swapped | mono | one-ear | unsure`.
- **Native bridge**: `ProgramPlayer` accepts any `EngineLike`, so a React Native or Capacitor bridge can reuse the scheduler, timer and session accounting unchanged.

## 7. Native path and next steps: TestFlight MVP plan

The reference engines are in `native/ios/Tuck` (AVAudioEngine + `AVAudioSourceNode`, `.mixWithOthers`, interruption, route, Mono and Spatial handling) and `native/android` (`AudioTrack` float stream, no audio focus, `mediaPlayback` foreground service, becoming-noisy, call mode and spatializer opt-out). They mirror core's model, programs and noise law.

**Recommended path: iOS first, SwiftUI.** The audio session and Live Activity are the product, so they should be native. Port the pure logic (programs, presets, store schema, insights, stereo-check verdicts) to Swift against core's tests as fixtures. React Native or Capacitor is the fallback if speed to Android matters more.

| Week | Milestone | Exit criteria |
|---|---|---|
| 1 | Xcode project, compile `BinauralEngine.swift` / `ToneRenderer.swift`, audio session | A layer plays under Spotify, Apple Podcasts and YouTube on a real iPhone, with no ducking and no pausing, locked and unlocked, for 60 minutes. Measured CPU and battery. |
| 2 | Home, the layer, Start / Stop, Level, the five intents, the timer, the spec card | Click-free fades checked on AirPods and wired earbuds. Output levels match core's loudness tests within 1 dB. |
| 3 | Onboarding and ear check, route and Mono/Spatial detection, noise-only fallback, interruptions (calls, Siri, unplug) | Every headphone state in `SCREENS.md` is reproduced on a device. |
| 4 | Live Activity / Lock Screen control, App Intents ("Start Focus under my audio"), Control Center control, persistence | A session starts from the Lock Screen and from a Spotify-opens automation without opening Tuck. |
| 5 | "What we know", Settings / Sensory mode, This week, privacy-preserving on-device metrics (activation, north star) | Passes the accessibility criteria in `product-spec.md` §7 (VoiceOver, Dynamic Type AX5, Reduce Motion). |
| 6 | TestFlight to 30–50 recruited testers (see §8) | No crashes, plus a measured activation rate. |

Android follows the same plan with `LayerService` once iOS activation is proven. Plus (StoreKit 2) comes after the first TestFlight cohort, not before.

**Launch gates:** trademark clearance for "Tuck" (USPTO / EUIPO / WIPO, classes 9 / 41 / 44, including the historical "Tuck Sleep" mark), or switch to Lining. App Store review of the "adhd" keyword (a keyword, never a claim). A round-3 audio re-score.

## 8. Business notes

**Pricing hypothesis.** The layer is free forever: every intent, every number, timers and saved layers, with no paywall before sound. **Tuck Plus** costs **£24.99 a year or £3.49 a month**, with 7 days free, a reminder 3 days before any charge, and cancellation in two taps. Plus adds start recipes, extra schedules, Health history with sleep notes, sync, and the long or own-vs-own blind comparison.

The price undercuts Brain.fm ($99.99) and Endel (about $60) on purpose. It's a proposal to test (a Van Westendorp survey, then a paywall A/B with £19.99 and £29.99), not a decision. A one-off lifetime tier is worth testing with Dev and Leo.

**Risks**

| Risk | Mitigation |
|---|---|
| **The science is mixed.** Effects of binaural beats are small and individual, and one study found beats made a task slightly harder. | Honesty is the brand: noise only is first-class, the science page shows null results, and the blind comparison lets users find out for themselves. Value doesn't depend on the beat working. |
| **Apple Background Sounds is free and built in.** | Beat it on binaural beats, intents, journeys, timers, the ear check, starting without opening the app, and design. Keep the free tier generous. |
| **Platform behaviour.** Some apps (calls, a few video apps) take exclusive audio. OEMs vary on Android. Spatial Audio can't be turned off from inside an app on iOS. | Detect the state and say so plainly ("When it can't mix"). The ear check catches Spatial and Mono. Test on the top 10 Android OEMs. |
| **Trademark / ASO.** "Tuck" collides with Tuck Sleep's history and "tummy tuck" search noise. | Legal clearance before public use, with Lining as the named fallback. Own phrases ("sound under music", "brown noise under podcast"), and use negative keywords. |
| **Medical-claim drift** in marketing or App Review (ADHD, insomnia). | Guardrails in brand §14 and core copy tests. Testimonials describe experience, never outcomes. |
| **Hearing safety and battery.** | Output peaks at −10 dBTP or lower (the hottest case, brown noise only at Full; a layer at Medium peaks near −23 dBFS), under a stated −1 dBTP ceiling, with low default levels and a lockable level ceiling. Battery is measured in week 1. |

**Validation plan**

1. **Smoke test (now):** a landing page ("Keep your playlist. Tuck something soft under it.") with a waitlist, with ads segmented by persona phrase ("brown noise under podcast", "binaural beats with Spotify"). Target: ≥ 8% sign-up from qualified traffic.
2. **TestFlight cohort (week 6):** 30–50 people recruited from r/ADHD, r/productivity, autistic community spaces and CS / pre-med students. Measure:
   - **first sound in under 10 s**
   - **activation**: 10 min under another app within 48 h, target ≥ 60%
   - **north-star input**: sessions with other audio playing for at least half the session
   - **starts without opening the app**: the streak-free retention signal
   - **D7 / D30 retention**
3. **Interviews:** 10 calls covering the job ("what were you listening to when you started Tuck?") and willingness to pay.
4. **Paywall test** after the cohort shows D30 retention of 20% or more. Kill or pivot if activation stays under 40% after two onboarding iterations.

## 9. Final pass (this release)

- `core`: `npm test` passes all 183 tests and `npm run typecheck` is clean. `prototype`: `npm run build` (tsc + vite single-file) is clean.
- Captured all 72 screens with `tools/shoot-all.mjs` (round 4 added 14 and round 5 added 12; four run inside a sandboxed iframe like the published viewer) into [`screens/`](./screens/), viewed them as contact sheets, and found no console or page errors.
- **Round 5 (after the round-4 reviews):** Home's playing top is never covered at default text size (the layer rests no higher than the measured top allows), and the More cue exists only at accessibility sizes, in its own row below the text. The journey readout is self-consistent. One minute rule applies everywhere. A disconnect mid-session is shown on Home. Cycles states its end. Exports use the app's clock and carry `arm` / `beat_hz` after a blind reveal. There is a five-second activation preview in Prototype controls, a headphone check for first-visit share recipients, and per-layer K-weighted loudness and true-peak tests in core. Details are in [`reviews/round-4-response.md`](./reviews/round-4-response.md).
- **Fixed: the editor's sticky Save footer sliced a line of text in half** as content scrolled under it. `PageShell` footers now have a soft fade (`prototype/src/ui/kit.tsx`).
- **Fixed: at 200% text, the playing layer clipped text.** The felt's container queries were in px, so the long first-play note was cut mid-line, and Home's top region cut the layer name under the lining. The felt thresholds are now in rem (`styles.css`), so the note gives way to the compact line at large text sizes. A new `useOverflowFade` hook fades the cut edge of the Home top and layer middle scroll regions, and only while they actually overflow (`ui/kit.tsx`, `screens/Home.tsx`). Default-size screens are unchanged.
