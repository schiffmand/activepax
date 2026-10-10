# Round 1: expert panel review of the Tuck prototype

**Date:** 10 Oct 2026 · **Build:** `prototype/dist/index.html` (single-file, 760 kB) · **Core tests:** 162 passing
**Screens captured:** 73 PNGs in `binaural-app/.shots/r1-panel-*` (390x844 @2x), using every selector sequence in `prototype/SCREENS.md` that runs without a wait step. No console errors on any run.
**Read:** `docs/brand.md`, `docs/product-spec.md`, `docs/competitors.md`, `prototype/src/audio/*`, `prototype/src/screens/*`, `core/src/audio/*`.

| Panelist | Score /10 | Summary |
|---|---|---|
| 1. Product designer (ADA bar) | **7.0** | The concept and the copy are better than anything else in the category. The layer screen hasn't caught up yet: dead space, floating detent labels, toasts covering content, and an editor without a sticky header or footer. |
| 2. Accessibility and neurodiversity UX | **7.5** | Strong base: radiogroups, aria-live, Plain labels, Sensory mode, 16 px minimum, good text contrast. Losing points on a loud ear-check tone, unexplained locked states, a permanent explainer banner, and a few moments where the copy contradicts the state. |
| 3. Audio engineer | **6.5** | The graph is clean: hard-panned merger, tracked ramps, no compressor, AudioContext created and resumed on a tap. But the prototype's noise gain law doesn't match core and native, the noise colours aren't loudness-matched, fades are linear in amplitude, the loop is 8 s, and a passing re-check never clears the L/R swap. |
| 4. Growth and product strategy | **6.5** | Real core need, clear wedge, honest positioning against Background Sounds. The latent ADHD need (getting started) isn't served yet, Plus is thin, and there is no acquisition or sharing loop. |

**Panel average: 6.9.** It's worth building. Fix the items below before round 2.

---

## 1. Product designer

**Loves**
- Onboarding 1 ("Your audio stays on top.") explains the whole product in one diagram. The "Your audio" layer sits over a "Tuck" layer with the lining strip between them. Best first screen in the category.
- The spec card. Big "14 Hz", L/R in Heather and Lichen, then a quiet table and the envelope plot. Precise without feeling clinical. "Built-in v1.0 · unchanged" is a lovely trust detail.
- The ear-check stitch lights per side (the right half dims while the left plays). Restrained, and it says something.
- The copy discipline holds on every screen I opened. I found no exclamation marks, no outcome language and no streaks.

**Must-fix**
1. **Home, layer panel (idle and playing):** there are about 150 pt of empty felt between the stitch row and the readout (see `r1-panel-home-0`, `-2`). It reads as unfinished. Either shorten the idle layer so the arrival copy gets the space, or use the band for the lining fade (graft 6): a visible brighten across the 8 s, which isn't perceptible in captures 0.7 s in.
2. **Home playing, level detent labels ("Full —", "Medium —"):** they float at the right edge of the upper area, at the same baseline as "Calm 10 Hz ›", and they will collide with long layer names or Dynamic Type (`r1-panel-home-3`, `r1-panel-menu-5`). Pin them to the layer's top edge as ticks inside the gutter, or drop them, since the Quiet/Medium/Full segmented control already exists.
3. **Toasts cover content.** After Save, the toast "Saved as 'Desk'…" covers the first-pick line ("…It isn't a treatment." is cut to "It i", `r1-panel-save-5`). It also stays on top of the layer picker sheet, hiding "Evening descent" (`save-7`). The "illustrative week" toast clips the weekly total line on Home (`week-4`). Dock toasts above the layer handle with reserved space, dismiss them when a sheet opens, and never cover live text.
4. **Edit a copy:** the header has no background. The "Copy of Focus" title scrolls visibly under "‹ Cancel" (`r1-panel-edit-3`). Save is below the fold. Give the header an opaque fill (or a blur) and make **Save** a sticky footer.
5. **Home, first-view audio explainer** ("Your phone doesn't tell apps…"): three lines of prime space on every Home state, including while playing and at session end. Collapse it automatically after the first Start (spec: "first view").
6. **Fading-in line "With you for 0 min":** "0 min" reads as a bug. Show the detail line only from 1 min, or say "Just started".
7. **Session end after a few seconds reads "Set down after 1 min."** (`r1-panel-end-2`, stopped after about 1 s). Round down, and say "Set down after under a minute." below 60 s.
8. **Type hierarchy:** Settings, This week, Tuck Plus and the mixing page use 39 px Atkinson Bold headings, while the science page and Home use Literata. Brand §9 allows it, but the bold sans headings are the loudest thing in the app. Drop them to 31 px / 500 so the "engraved, not advertised" tone carries across.

## 2. Accessibility and neurodiversity UX

**Loves**
- Proper semantics: the chips, intents, layer list and timer are `role=radiogroup` / `radio` with `aria-checked`. The Segmented control has arrow-key handling and skips locked options. Sliders have `aria-valuetext` in words ("14 hertz", "25 percent").
- Colour tokens: ink2 `#AEB2A0` on surface `#272E27` is about 7:1, and the Dim theme is still above 4.5:1. 16 px minimum is respected everywhere I checked.
- Sensory mode works as one switch: Plain labels, the texture off, a five-intent row, no greeting question, ceiling Medium. "Ask how I'm arriving" stays off once turned off.
- The "It isn't a treatment." line on the first pick of each chip is exactly the right register for ADHD and autistic users who've been sold cures.

**Must-fix**
1. **Ear check is about 12 dB louder than the layer.** `runStereoCheck(..., volume: 0.55)` gives 0.55² × 0.5 ≈ 0.15, about **−16 dBFS**. A Medium layer tone is about −28 dBFS. It's the first sound the app ever makes, a pure 200 Hz sine, for an audience that includes sensory-sensitive people. Start it at about −24 dBFS, and offer "Louder" if the answer is "Neither".
2. **Sensory mode, Level control:** "Full" is hatched and unreachable with no explanation (`r1-panel-menu-5`). Add a line under the control, "Ceiling: Medium. Change it in Settings.", and an accessible name to match ("Full, unavailable, ceiling is Medium").
3. **Sensory mode, status line:** "Starting. Fading in over 15 seconds." is set as the 31 px Literata headline across two lines. That's the loudest element in the quiet mode. In Sensory mode, render the status at 20 px sans.
4. **Copy contradicts state (trust-breaking for literal readers):**
   - Onboarding → "Skip, use noise only": Home says "That's Focus: a 14 Hz beat over soft brown noise." while the readout says "Noise only · brown 25%" (`r1-panel-skip-1`). Refresh the chip line when noise-only is set.
   - Lock Screen mock: "Your audio · Paused", yet the Tuck card says "Playing under your audio, no timer" (`r1-panel-lock-3`). When nothing else is playing, say "Playing, no timer".
5. **Selected state in segmented controls** (Quiet/Medium/Full, Drift/Hold, the editor's Noise row) relies on surface2 `#323A31` against `#272E27`, which is about 1.2:1. Text weight helps, but WCAG 1.4.11 wants 3:1 for the state indicator. Add a 2 px ink outline or underline to the selected segment. Unselected chip borders (`--c-line` on bg, about 1.6:1) have the same problem.
6. **"This week" with sample data** isn't labelled illustrative on the page itself. Only a transient toast says so (`r1-panel-week-7`). SCREENS.md promises the label. Add "Sample data" under the heading so screenshots can't be mistaken for real.
7. **Layer picker "Delete"** sits 16 px from the selection radio on the same row (`save-7`). A confirm sheet exists, but move Delete behind a swipe, an overflow menu or the spec card to avoid motor mis-taps.

## 3. Audio engineer

**What's right**
- Channel mapping is correct: `oscL → merger input 0`, `oscR → merger input 1`. The ear check uses the same merger routing, not a StereoPanner, so it tests what the engine plays. Swapping happens in a splitter→merger router in front of the destination. L 200 / R 214 matches `earFrequencies(207, 14)`.
- No clicks. Every gain change is a tracked ramp (`rampParam` with a minimum `GAIN_STEP_SEC` of 30 ms), and the `paramValueAt` bookkeeping avoids the Firefox `.value`-reads-1 click. Frequency glides are exponential. The noise loop is crossfaded (equal-power, which is correct for uncorrelated head and tail). Noise colour changes crossfade over 1.5 s.
- Autoplay: the AudioContext is created lazily in the Start or ear-check tap, `ensureRunning()` races `resume()` against 600 ms, and a refusal surfaces as a 'blocked' notice instead of failing silently.
- Headroom: tones 0.5 plus noise 0.45 is under 1 before the level gains, and the compressor is rightly removed (no pumping, no makeup gain).
- Levels under music: Medium tone ≈ −28 dBFS, Full ≈ −21 dBFS, Quiet ≈ −38 dBFS per ear. Against masters at around −14 LUFS that's correctly "under". Nothing here will be too loud.
- Each ear gets differently-seeded noise, so the noise doesn't form a phantom centre.

**Must-fix**
1. **The prototype's noise gain law differs from core, iOS and Android.** `prototype/src/audio/hub.ts` NoiseBed uses `n.volume * NOISE_HEADROOM`, which is linear. `core/src/audio/engine.ts`, `native/ios/Tealight/BinauralEngine.swift:157` and `native/android/.../BinauralEngine.kt:203` use `volumeToGain(volume) * NOISE_HEADROOM`, which is square law. At 25 %, the prototype's noise is **6 dB louder** than shipping builds will be. The editor's "25% · −12.0 dB" label matches neither (native is −24 dB before headroom). Pick one law (square, as in core), use `volumeToGain` in NoiseBed, and compute the label from it.
2. **The noise colours aren't loudness-matched.** All three buffers are peak-normalised to 0.9, which puts their RMS at white −8.5, pink −13.2 and brown −13.8 dBFS. Switching brown to white at the same % jumps about 5 dB and gets much brighter. Normalise to equal RMS, or better to roughly equal loudness with a K-weighted estimate, and keep a peak ceiling.
3. **Fades are linear in amplitude** (`fadeGain` and `NoiseBed.fade` use `'linear'`). Over 8–20 s, a linear-amplitude fade-in seems to jump up in the first second, and a fade-out seems to hang, then drop out suddenly at the end. For sensory users that's the one moment they notice. Ramp in dB (exponential from −60 dB, then a short linear tail to 0), or use an equal-loudness curve. The lining animation should follow the same curve (graft 6).
4. **The L/R swap never clears.** In `Onboarding.tsx`, `answer()` sets `swapChannels: true` on 'swapped' but never sets it false on 'ok'. If a user swaps once (earbuds in the wrong ears) and later re-checks correctly, the layer plays reversed and the readout "L 200 / R 214" is false. On 'ok', set `swapChannels: false`. Also note that the ear check deliberately bypasses the swap router. That's right for testing hardware, but say so in a comment so nobody "fixes" it.
5. **The 8 s noise loop.** `noiseBuffer()` builds 8 s buffers. With a crossfaded loop and random start offset it doesn't click, but a 1–2 h session repeats the same 8 s grain about 700 times. Attentive listeners (the deep-focus users) hear the "wash" repeat, especially with white noise. Use 30 s or more, or generate in an AudioWorklet (native already renders in real time).
6. **The Take 5 chime ignores Level.** It's fixed at −24 dBFS, but Take 5 drops the layer to Quiet (about −38 dBFS), so the chime is about 14 dB above the bed. Scale it to the current level (bed + 6 dB at most) and give it a 30 ms attack instead of the 30 ms linear-to-1.0 envelope.
7. **The 40 Hz "Long focus" layer, and the spec card's band names.** Binaural beats lose their beat quality above about 30 Hz (they turn into roughness or two tones). Also, "gamma/beta/alpha range (descriptive)" on the spec card invites the entrainment reading that brand §6 bans ("beta waves"). Drop the band label, and add an honest line to the 40 Hz layer ("At 40 Hz the beat is faint; most of what you hear is texture.").

**Should-fix:** Drift moves only the beat, while brand §7 says "the beat and the noise wander". Either add a ±1 dB slow noise-level wander or change the copy. Native packages are still `app.tealight.*` / `Tealight/` (old brand). Rename before any TestFlight build.

## 4. Growth and product strategy

**Loves**
- The wedge is real and documented: "I want my podcast AND the focus sound" (competitors.md, finding 3). Every funded competitor (Brain.fm, Endel) replaces your audio. The "Sound Under Your Audio" store name is ASO-smart: it targets uncrowded intent phrases and avoids "tummy tuck".
- Honesty is a moat with this audience. The science page cites null and negative studies, "free and the layer stays free" goes after the category's #1 complaint (billing), and the blind comparison turns skepticism into a feature.
- "Noise only" as a first-class mode quietly captures the brown-noise trend without any beat claims.

**Must-fix**
1. **Beat Apple Background Sounds where it's weak, on screen 1.** It's free, in Control Center, and already "Use When Media Is Playing". Tuck's reasons to exist are binaural, intents, timers, the Live Activity and Android. Onboarding 1 should show one of them (for example "Binaural beats and brown noise, under anything"), not only the mechanism Background Sounds also has.
2. **The latent ADHD need is starting, not choosing.** The product optimises the in-app moment, but ADHD users fail before opening the app. Pull the P2 items **Shortcuts/App Intents + "When Spotify starts, start Tuck" automation recipe + Control Center/Quick Settings tile** into P1, and add a one-tap "Start with my audio" suggestion after the first session. This is also the retention mechanism in a product that (rightly) has no streaks.
3. **Body doubling is the unspoken job.** "Company for your attention" is the brand line, but nothing in the product delivers company beyond copy. Explore an opt-in, privacy-safe "a few people are working with a layer right now" count, or a timer shared with one friend via link. The spec cut "Others tucked in right now", so bring it back to the brand §14 privacy standard as a P2 experiment.
4. **Plus is thin.** Schedules, Health and Sync won't convert. The blind comparison ("find out if the beat does anything for *you*") is the only Plus feature with pull. Make it the Plus hero, add exportable results (CSV/PDF) for the optimiser and longevity persona, and add saved-layer-per-context, so you don't paywall the layer.
5. **No acquisition loop.** Add a shareable, non-medical layer card ("My desk layer: 14 Hz over brown noise, L 200 / R 214") with a deep link that opens it in Tuck. Dev and Priya will post exact specs. That fits "engraved, not advertised" and costs no claims.
6. **Measure activation honestly:** first sound within 10 s (spec), and the percentage of sessions with "Your audio keeps playing above" true. That second number is the proof of the wedge and should be the north-star input.

---

## Bugs (reproducible)

1. **Onboarding skip → Home: the chip line claims a beat while noise-only is set.** "That's Focus: a 14 Hz beat over soft brown noise." sits above the readout "Noise only · brown 25%". Steps: `$U` → `[t=onboard-skip]`. (`r1-panel-skip-1`)
2. **A passing ear check doesn't clear `swapChannels`.** `Onboarding.tsx answer()` only ever sets it true, so the channels stay reversed after a later correct check, and the L/R readout becomes false.
3. **The prototype's noise gain law (linear) differs from core and native (square).** That's +6 dB at 25 %, and the editor's dB label is wrong for shipping engines. (`hub.ts NoiseBed.setNoise/setVolume` vs `engine.ts`, `BinauralEngine.swift:157`, `BinauralEngine.kt:203`)
4. **A toast covers live text and survives into sheets.** The "Saved as 'Desk'" toast truncates the "It isn't a treatment." line and covers picker rows. The "illustrative week" toast clips the weekly total line. (`r1-panel-save-5`, `-7`, `r1-panel-week-4`)
5. **Editor header is transparent.** The title scrolls visibly under "‹ Cancel". (`r1-panel-edit-3`)
6. **Lock Screen mock:** "Your audio · Paused" next to "Playing under your audio" when no other app is playing. (`r1-panel-lock-3`)
7. **Session end rounds up.** Stopping after about 1 s reads "Set down after 1 min." (`r1-panel-end-2`)
8. **"With you for 0 min"** shows during the fade-in. (`r1-panel-home-2`)
9. **"This week" with sample data has no on-page "illustrative" label**, contrary to SCREENS.md. (`r1-panel-week-7`)
10. **The greeting reads "Evening." at 00:39.** `copy.ts greeting()` returns Evening for 00:00–03:59. Brand allows only three greetings; consider no greeting between 00:00 and 04:00, or "Late." if approved.
11. **The Take 5 chime is fixed at −24 dBFS**, about 14 dB above a Quiet bed.
12. **Native code still uses the old brand namespace** (`app.tealight.layer`, `native/ios/Tealight`).
13. **The level detent labels ("Full —", "Medium —")** float outside the layer and overlap the upper content column. (`r1-panel-home-3`, `r1-panel-menu-5`)

Not reproducible with `shoot.mjs` (needs a wait step) and so not reviewed this round: ear-check verdict screens, the Timer-end / Take 5 time-lapse, and the headphone-route simulations. Next round should script these with Playwright waits.
