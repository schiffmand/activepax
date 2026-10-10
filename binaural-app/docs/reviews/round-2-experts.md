# Round 2: expert panel review of the Tuck prototype

**Date:** 10 Oct 2026 · **Build:** `prototype/dist/index.html` (single file, 804 kB, `npm run build` clean)
**Screens captured:** 98 PNGs in `binaural-app/.shots/r2-expert-*` (390x844 @2x). 72 come from every `shoot.mjs` sequence in `prototype/SCREENS.md`. 26 more (`r2-expert-t-*`) come from a Playwright script with waits: all four ear-check verdicts, 9 s of playback, another app playing, all seven headphone routes, Take 5, a Cycles break, the blind reveal, the session rating, keyboard focus, 200% root text and a pinned layer. No console errors and no page errors on any run.
**Measured:** the real output of the built page. A splitter and two analysers were tapped onto the node that feeds `AudioContext.destination`, and RMS, peak and FFT bins were read after 10 s of playback.
**Read:** `docs/brand.md`, `docs/product-spec.md`, `docs/reviews/round-1-*.md`, `prototype/src/audio/{hub,layerEngine,session}.ts`, `prototype/src/screens/{Home,Onboarding,Pages}.tsx`, `core/src/audio/{engine,webaudio,stereoCheck}.ts`, and the Android `BinauralEngine.kt` noise gain.

| Panelist | Round 1 | Round 2 | Summary |
|---|---|---|---|
| 1. Product designer (ADA bar) | 7.0 | **7.5** | Almost every round-1 layout complaint is fixed: toasts live in the felt, the editor has an opaque header and a sticky Save, the floating detent labels are gone. What's left is hierarchy. The playing screen shouts "Just started" at 39 px over 400 pt of empty space, and some secondary surfaces (Share, spec-card buttons) still look like defaults. |
| 2. Accessibility and neurodiversity UX | 7.5 | **7.5** | The round-1 fixes landed: the ear check is at −24 dBFS, the ceiling line exists, Sensory status is 20 px, and the copy now matches the state. New problems: large text breaks the layer and clips **Stop**, the mono verdict states a cause it can't know, and a hard-coded "3 good, 2 same as usual, 1 not for me" appears in the blind result. |
| 3. Audio engineer | 6.5 | **5.5** | Channel mapping is correct (measured: L carries 200 Hz, R carries 214 Hz, about 60 dB of separation), fades run in dB, the AudioContext is created and resumed inside the tap, and there's no compressor. But the **noise bed measures −67 dBFS RMS at Medium, 36 dB under the tones**. "Soft brown noise", Noise only, the speaker/mono fallback and the noise arm of the blind comparison are all effectively silent. That one is a ship-blocker. |
| 4. Growth and product strategy | 6.5 | **7.0** | The wedge is sharp and honest. "Start without opening Tuck", the free blind comparison and the share card are real answers to round 1. But the share loop's landing doesn't let the recipient play the shared layer, the Plus page contradicts itself about what's free, there's still no price, and with the noise inaudible, speaker, AirPods-with-Spatial and Mono users will hear near-silence on their first session. |

**Panel average: 6.9** (round 1 was 6.9). The polish rose, but measuring the audio uncovered a defect that hides the gain. Fix the noise gain law first. Everything else is a day's work.

---

## Bugs (verified)

| # | Severity | Where | Bug | Evidence |
|---|---|---|---|---|
| B1 | **Critical** | `prototype/src/audio/hub.ts` `noiseGain()` + `NoiseBed.setVolume()`; same law in `core/src/audio/engine.ts:522` and Android `BinauralEngine.kt:203` | The noise goes through **two square laws plus headroom**: `volumeToGain(noise.volume) × NOISE_HEADROOM × volumeToGain(level)`. At 25% noise and Medium that is 0.0625 × 0.5 × 0.078 × buffer RMS 0.18, which is about **−67 dBFS RMS**. The tone sits at −31 dBFS, so the noise is 36 dB under it and roughly 50 dB under typical music (about −14 LUFS). | Measured: Focus at Medium is −31.1 dBFS RMS per channel (tone only). **Noise only at Medium is −67.4 / −66.9 dBFS RMS**, peak −55 dBFS. At Full it's still about −60 dBFS. |
| B2 | **Critical (honesty)** | `screens/Pages.tsx:770`, blind result | "Average of your taps: 3 good, 2 same as usual, 1 not for me." is a **hard-coded string**. It shows on a fresh comparison next to "0 notes, 0 plays" for both layers. This is fabricated data inside the feature whose whole point is honest self-evidence. | `r2-expert-t-blind-reveal.png` |
| B3 | High | Blind comparison | Because of B1, the "noise only" arm is about 36 dB quieter than the beat arm, not "at the same level" as the setup page says. The comparison is trivially unblinded: it's tone against near-silence. Level, Drift, Vary and Hold also stay changeable during blind sessions, which confounds the result. | `r2-expert-blind-2.png` (copy), `r2-expert-blind-4.png` (controls live), the measurements under B1 |
| B4 | High | Shared layer card (`?layer=…`) | Home says "Someone shared a layer. **Library** … 10 Hz over soft pink noise", but the layer readout underneath still says **"14 Hz · L 200 / R 214"** (Focus), and Start sound plays Focus. There's no way to hear the shared layer before saving it. | `r2-expert-shared-0.png` |
| B5 | High | Home with 200% root text (Dynamic Type proxy) | The layer is fixed-height. The readout breaks into "14 / Hz", "L / 200", "R / 214", three of the five chips slide under the layer, and **Start sound and Stop are clipped below the viewport**. | `r2-expert-t-bigtext.png`, `r2-expert-t-bigtext-play.png` |
| B6 | Medium | Tuck Plus page | The intro says Plus "adds schedules, the blind comparison, Health and sync". The same page then says "A basic blind comparison is free" and "One daily time is free". | `r2-expert-plus-2.png` |
| B7 | Medium | Ear check, "Both" twice | The verdict asserts "**Mono Audio is on** in Accessibility settings." "Heard in both" is just as likely to mean Spatial Audio, the phone speaker, or a mono Bluetooth route. The secondary action is labelled "Mono Audio is off", which reads as a status, not a button. | `r2-expert-t-ear-mono.png` |
| B8 | Medium | Timer sheet, Cycles row | The title says "25 on, **5 off**", but the body says breaks "drop to Quiet". Sound doesn't go off. Unlike the other rows, the Cycles row also has no check mark or radio state. | `r2-expert-timer-1.png` |
| B9 | Low | Cycles after Prototype controls → Skip | The status still reads "Tucking in…" at 25 min ("With you for 25 min · Round 1 of 4"), because `fadingIn → playing` runs on a wall-clock `setTimeout`, not the warp clock. | `r2-expert-t-cycles.png` |
| B10 | Low | Headphones disconnected while idle | The pill is hidden while idle (`Home.tsx:298`), so Start sound gives no hint that the beat will play on the speaker. The prototype starts the full binaural layer instead of falling back to noise only, as the speaker route does. (Code path; not captured, because the pill click had nothing to click.) | `r2-expert-t-hp-disconnected.png` |
| B11 | Low | Editor "Noise level 25% · -24.1 dB" | The dB label leaves out `NOISE_HEADROOM` and the Level stage, so it is 30+ dB off the real output. It also uses a hyphen-minus, not "−". | `r2-expert-edit-2.png` |
| B12 | Low | Returning Home with sample data, shared card | The first-view explainer ("Your phone doesn't tell apps…") still shows for a user with 5 sessions, and above the shared card. | `r2-expert-ret-4.png`, `r2-expert-shared-0.png` |
| B13 | Low | Share sheet | The link shows as raw `https://tuck.app/l?layer=14,207,brown,25,drift,1,Focus`. Brand §1 says the domain uses "tuckapp" / "tucksound". | `r2-expert-share-2.png` |

---

## 1. Product designer (score 7.5)

**Loves**
- **Stereo confirmed** (`r2-expert-t-ear-ok`): the two stitch halves close up, with "That gap in the stitch is where the beat lives." It's the best moment in the app: one motion, one sentence, and it teaches the mechanism.
- The **Evening descent spec card** (`r2-expert-eve-2`): "8 → 2 Hz", a dashed beat line over a solid level line, "45 min +60 s". Precise and calm.
- The **Dim wool** evening palette: warm, dark, and the primary button is an outline. It honours the "never a bright button at night" rule.
- The **editor** now has an opaque header that picks up the title on scroll, and a sticky Save with "Start sound on Home to hear changes live." The round-1 complaint is fixed.
- **Session end** reads "Set down after under a minute. Fading out over 20 seconds." It's literal, kind and correct.

**Must-fix**
1. **Home, playing (the felt focal line):** "Just started" / "12 min" is set at 39 px. It's the largest thing on screen during the state where nothing should shout, and it breaks brand §5.2 ("only two places use a large number"). Drop it to 20 px, ink2, and let the stitch be the focal object.
2. **Home, playing (dead band):** there are about 400 pt of empty background between "Focus 14 Hz ›" and the layer's top edge (`r2-expert-home-2`, `-t-play9`). The layer name is shown twice: "Focus 14 Hz" up top and "14 Hz · L 200 / R 214" in the readout. Either raise the layer at Medium so the felt is the hero, or move the status line ("Tucked in.") and layer name into the felt and leave the top area as plain background.
3. **Spec card, action row:** "Edit a copy", "Save" and "Noise only" are three identical grey pills, and Save on an unchanged built-in does nothing useful. Make Noise only a toggle row in the table ("Beat: On / Off"), keep **Edit a copy** as the one button, and show Save only when something differs from the built-in.
4. **Share sheet:** hide the raw query string. Show `tuckapp.com/l/…` (short) or no URL at all, since the card plus "Copy text and link" is enough.
5. **Onboarding 1:** four paragraphs plus a diagram. Cut "The same on iPhone and Android." (it means nothing to the user) and merge the two feature lines into one. The diagram's lining strip is a muddy mauve (`#7a6158`-ish) on night colours; use the brand lining token at full strength, as the Mixing page does.
6. **Ear check:** the bottom 45% of the screen is empty in every state, and the "L · 200 Hz" caption disappears while the left tone plays, shifting the layout. Keep the caption and change only its text ("Playing…"), and pull the verdict block up beside the stitch.

## 2. Accessibility and neurodiversity UX (score 7.5)

**Loves**
- Every round-1 a11y item is fixed: the ear check starts at about −24 dBFS with "Play it a little louder" as an explicit opt-in (`r2-expert-t-ear-none`), the Sensory ceiling has its own line, Sensory status is 20 px sans, and the skip/noise-only copy matches the readout.
- **Pinned layer** (`r2-expert-t-pinned`): "Your layer is ready. Focus · 14 Hz. Pinned. It plays exactly as saved." No question, no chips. Exactly what Sam needs.
- **Session rating** is opt-in, three plain chips and a Done. No stars, no guilt.
- The keyboard focus ring is clearly visible (`r2-expert-t-kbd-focus`).
- The science page is honest in plain language: "one study found beats made a task slightly harder".

**Must-fix**
1. **Large text (B5):** the layer must grow with Dynamic Type. At accessibility sizes, stack the readout ("14 Hz" on one line, "L 200 / R 214" on the next), let the layer scroll internally, and **pin Start sound / Stop to the bottom safe area so they can never clip**. Test at AX3 (about 200%).
2. **Blind result (B2):** delete the hard-coded taps line. If you keep it, compute it from `notes`, and label the "–" mean ("Average rating, 1 to 3: –").
3. **Mono verdict (B7):** say what was observed, not a guessed cause: "Both tones came through both ears, so left and right are being merged. Usually that's Mono Audio, Spatial Audio, or the phone speaker." Offer **Open Settings · Use noise only · Check again**, and drop the "Mono Audio is off" link.
4. **Sensory mode, playing (`r2-expert-menu-5`):** the felt shows "Under a minute" at 39 px. Sensory mode should use the compact felt line only (16 px). "Under a minute" as a headline also reads oddly in Plain labels.
5. **The Studies page "+ Benefit" pills** look like add buttons (outlined pill plus a plus sign). Make them non-interactive text tags with no border, e.g. "Finding: small benefit". Use "−" / "○" for negative and null so findings aren't told apart by icon alone.
6. **Plus page (B6):** the self-contradiction is exactly the kind of thing literal readers catch and stop trusting. List free and Plus in two plain columns.
7. **Naming:** "Pin one layer to Home" is described as "Steady mode", but Steady is also an intent. Sensory mode's row says "Sleep" while the picker says "Evening descent". Pick one name per thing. Brand must-change 5 already made this rule for Drift/Hold.

## 3. Audio engineer (score 5.5)

**Loves**
- **Channel mapping is right and measured.** The left analyser shows 200 Hz at −56 dB and 214 Hz at −115 dB; the right shows the mirror image. Hard-panned through a merger, with no panner law, no crosstalk and no compressor.
- **Autoplay is handled properly.** `getContext()` and `resume()` run synchronously inside the Start tap (`session.start` → `ensureRunning`). The ear check uses its own gesture, and a blocked context shows a notice instead of failing silently.
- **Fades** use `rampFade` in dB with a short linear edge to and from zero, so there are no clicks at start or stop. Layer switches glide frequency over 4 s.
- **Levels under music are sensible** for the tones: Quiet −41, Medium −31, Full −24 dBFS RMS (measured), a 17 dB range with Full still about 10 dB under typical mastered music. The chime is scaled to the layer.
- The ear check deliberately **bypasses the swap router**, so it tests the hardware as worn. Correct.

**Must-fix**
1. **Noise gain law (B1), everywhere (prototype, core, iOS, Android):** apply exactly one perceptual law. Recommended: noise `typeGain = volumeToGain(noise.volume)`, with no extra `× NOISE_HEADROOM` on top of an RMS-normalised buffer, and calibrate so "25%" lands at about −12 dB relative to the tone RMS. At Medium that puts the noise around −43 dBFS RMS: audible, and still under the tone and the music. Then re-derive `WORST_CASE_PEAK` (tone 0.5 + noise peak 0.83 × gain) and keep the sum under −1 dBFS at Full. Add a core test that asserts "Noise only, Medium" renders within ±2 dB of a target such as −38 dBFS RMS, so this can't regress silently.
2. **Noise only must be level-matched to the layer, not to the noise slider.** When the beat is off (speaker, mono, call mode, Noise only, blind arm B), bring the noise up to the layer's loudness (match K-weighted loudness to the beat+noise mix), or the fallback is quieter than the thing it replaces.
3. **Blind comparison (B3):** level-match the two arms on BS.1770 loudness after fixing 1–2, lock Level, Motion and Vary for the comparison's sessions, and say so on the setup page ("Level and motion are fixed during the comparison").
4. **Editor dB label (B11):** show the real output relative to full scale ("Noise −43 dBFS"), or relative to the beat ("12 dB under the beat"). The current "−24.1 dB" matches nothing you can hear.
5. **Spec card "Level Medium (0.28)":** 0.28 is an internal slider value. Show "Medium · beat about −31 dBFS". The engraved-numbers promise only works if the numbers are physical.
6. **Swap state is perceptually irrelevant for a binaural beat** (the beat forms either way). Keep the fix silent: drop the Home pill "Left and right swapped back for you" (`r2-expert-t-hp-swapped`) and keep it only in the spec card. Note too that `setSwap` rewires the splitter instantly. That's fine at session start, but if it's ever called mid-session it will click, so crossfade over 50 ms if you add that path.
7. **`ensureRunning` gives up after 600 ms.** On iOS with a Bluetooth route waking up, `resume()` can take longer, and the user gets the "blocked" notice while sound then starts anyway. Wait for the `statechange` event with a 2 s cap.

## 4. Growth and product strategy (score 7.0)

**Loves**
- **The core need is met and stated in one line:** "Your audio stays on top." No competitor (Endel, Brain.fm, BetterSleep) is built around layering under the user's own audio. The Mixing page ("Your app keeps playing / Tuck underneath, at your Level") is the clearest category explainer we've seen.
- **"Start without opening Tuck"** addresses the latent ADHD need, getting started, with "Starting is the hard part, so Tuck can start itself" and a Spotify-opened automation recipe. That's real retention without streaks.
- **The free blind comparison is a novel, defensible feature.** It turns the category's biggest weakness (mixed science) into trust. "Your own evidence" is the right Plus story.
- The **share card** carries numbers only: a privacy-safe acquisition loop that fits the Dev and Hannah personas.

**Must-fix**
1. **Fix B1 before any external test.** Speaker users, AirPods users with Spatial Audio on (the iOS default for many), Mono users and anyone who skips the ear check all land in Noise only. They currently get about −67 dBFS, i.e. silence. First-session churn from "it doesn't do anything" would swamp every other metric.
2. **Shared-layer landing (B4):** make the card itself the layer. Load Library into the layer, show "Play it" as the primary action, and offer "Save it" after 30 s of play. A share that can't be heard doesn't convert.
3. **Plus (B6):** no price, a contradictory list, and the hero ("Your own evidence") is gated behind a feature that is currently broken (B2, B3). Put the price and trial terms on the page ("£x/yr, 7-day trial, reminder 3 days before"), list Free vs Plus in two columns, and add one Plus item that serves the ADHD core: **multiple saved "start recipes"** (layer + level + timer per Shortcut), or **body doubling** from the P2 list.
4. **Activation instrumentation (prototype spec):** define the aha as "≥10 min of Tuck while another app was playing in the first 48 h", and make the Home indicator ("Your audio keeps playing above") the place that celebrates it quietly the first time ("Tuck stayed under your audio for 10 min.").
5. **Onboarding:** move "Check my headphones" ahead of the explanation, or merge the two screens. Sound within 10 s is the brand's own target, and the current flow takes four taps and about 15 s of reading before any tone plays.

---

## Round-1 items checked as fixed

The toast in the felt; the editor's sticky header and footer; the explainer collapsing after the first Start; "Just started" instead of "0 min"; "under a minute" instead of rounding up; floating detent labels removed; the ear check at −24 dBFS with "Play it a little louder"; the Sensory ceiling line; Sensory status at 20 px; noise-only chip copy; Lock Screen "Playing, no timer"; a passing check clearing the swap; the Too-much checkbox off by default with "Too much plays Steady now."; Evening descent "Ends after 45 min" with its arc on the spec card.
