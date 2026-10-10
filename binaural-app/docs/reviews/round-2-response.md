# Round 2: response and changes

**Date:** 10 Oct 2026 · **Build:** `prototype/dist/index.html` (single file) · **Core tests:** 174 passing (168 before, plus 6 in the new `core/test/loudness.test.ts`)
**Inputs:** `round-2-council.md` (six personas, mean 7.6) and `round-2-experts.md` (four experts, mean 6.9; audio 5.5).
**Method:** every bug in both reviews was reproduced and fixed, and every must-fix was either built or decided against with a reason below. Every flow in `prototype/SCREENS.md` was captured with Playwright at 390×844 @2x (`.shots/r3-capture.mjs`, 120+ screenshots, viewed as contact sheets in `.shots/r3-m/`), plus new flows for Take 5 → Another 25 min, the Cycles break, playing a shared layer, the blind comparison end to end, the activation moment, 200% text, Plain labels during the fade-in, the swapped route, and sleep notes on This week. The page's real output was measured by tapping the node that feeds `AudioContext.destination` (`.shots/r3-measure.mjs`). No console or page errors.

## The ship-blocker: the noise law (audio engineer B1, growth must-fix 1)

The noise went through two square laws and a 0.5 headroom: `volumeToGain(noise %) × 0.5 × volumeToGain(level)`. Noise only at Medium measured −67 dBFS RMS, 36 dB under the beat. Speaker, Mono, Spatial and skip-the-ear-check users, and the blind comparison's noise arm, were all hearing near-silence.

**One law, everywhere (core, prototype, iOS, Android).** Noise % is now the noise's amplitude relative to the beat, linear: 100% is as loud as the beat (equal BS.1770 loudness), 50% is 6 dB under it, 25% is 12 dB under it. In core:

- `NOISE_RMS` (brown 0.18, pink 0.157, white 0.105) moved into core; core's own engine now RMS-normalises its buffers too, so all three colours sit within 0.1 LU of each other.
- `NOISE_FULL_GAIN = 2.11` (measured: the gain that puts each RMS-normalised colour at the beat's K-weighted loudness) and `noiseVolumeToGain(v) = v × 2.11`. `NOISE_HEADROOM` is gone, so nothing can stack it again.
- `noiseOnlyGain(v) = √(1 + v²) × 2.11`: with the beat off (speaker, one earbud, call mode, Mono, the Noise only switch, a blind comparison's noise arm), the noise is brought up to the loudness of the layer it replaces (beat + noise). It's never quieter than what it stands in for.
- `WORST_CASE_PEAK` is re-derived (0.5 + 0.9 × 2.11 before the user volume) with `MAX_CLEAN_VOLUME` (about 0.61): every volume up to it stays under −1 dBFS. Tuck's loudest level, Full, is 0.42.
- Helpers for honest labels: `toneDbfs`, `noiseDbfs`, `noiseDbReBeat`, and `formatDb` (true minus sign, U+2212).
- **Regression test** (`core/test/loudness.test.ts`): K-weighted colour matching within 0.5 LU; 100% noise within 0.5 LU of the beat; 25% at −12 dB re the beat; Focus at Medium renders the beat at −31 dBFS and the noise at −43 ± 2 dBFS RMS (it was −67); noise only within 1 LU of the layer it replaces (about −30 dBFS at Medium); the engine's noise voice really renders that law on an RMS-normalised buffer.
- Native: `BinauralEngine.kt` / `ToneRenderer.kt` and `BinauralEngine.swift` / `ToneRenderer.swift` / `Model.swift` use the same `noiseVolumeToGain` and `noiseOnlyGain`.
- The prototype's `NoiseBed` follows the beat: `setBinaural(false)` ramps the noise to the matched noise-only level over the same glide as the beat.

**Measured in the built page** (Chromium, the node feeding the destination, after 14 s): see the table at the end of this file.

Also from the audio engineer: `ensureRunning` now waits for the context's `statechange` (2 s cap) instead of giving up at 600 ms; `setSwap` mid-session dips 25 ms down, rewires, 25 ms up (no click); the fade-in → playing switch runs on the warp clock, so Skip ahead finishes it (B9).

## How conflicts were resolved

Brand principles decide: simplicity, one primary action, sensory calm, honesty.

| Conflict | Call | Why |
|---|---|---|
| Maya likes the big "Just started" in the felt; the designer says 39 px breaks brand §5.2 and shouts. | The felt's time is **20 px**, and the **stitch is the focal object**. Sensory mode uses only the compact 16 px line. | §5.2: only the spec card and the Live Activity get a large number. Maya's need was "something to glance at", which 20 px under the stitch still is. |
| Maya wants the top half used; the designer wants less, not more. | The layer rests **40 to 70 px higher** at every level (tokens updated), the top shows the name only (the numbers live once, on the readout), and one quiet ink2 line sits at the bottom of the top area: **"Started at 10:02 · 1 h 20 min this week"**. | A glanceable answer to "when did I start?" helps time-blindness and adds no control. The dead band is now about 150 pt, not 400. |
| Designer: one primary action on the spec card. Hannah and Dev use Noise only a lot. | **Beat On / Off** is a row in the spec table (a property of the layer, not an action). **Edit a copy** is the single button. **Save** appears only when something is unsaved (a shared layer). Delete is a text link beside Share. | Three equal grey pills, one of them a no-op, became one button. |
| Growth wants "Play it" primary on a shared link; the brand says the layer's button is Start sound. | The shared layer *becomes* the layer (readout, spec card, Start). The button says **Play it** only while the shared layer is selected and idle; "Save it" sits in the top text before and during play. | It's the same single primary action, named for that moment. |
| Maya asked for "Back in 5 min" during Take 5; Take 5 actually fades out at the end. | Status **"Five minutes off."**, felt **"Back in 5 min"** with "At Quiet. One soft chime at the end, then it fades out.", timer chip **"Break, 5 min"**. When it ends: **"Break over."** with **Another 25 min** (Leo's one tap), which restarts the same layer and timer. | "Back" is now true: the next round is one tap away. |
| Growth: get to first sound faster; brand: nothing plays without a tap. | **Check my headphones** wakes the audio inside the tap and the ear check plays the left tone as it appears (one tap, about 5 s of reading). Onboarding 1 is one paragraph and one line shorter. | The first sound still comes from the user's tap. |
| Priya wants Health free; Plus needs reasons. | **One free Health write** (mindful minutes, Settings → Your notes). Plus keeps the Health history with sleep notes, more schedules, start recipes, sync, and the long comparison. | Integration is a trust signal (Priya); analysis is the paid depth. |
| Growth wants an ADHD-core Plus item: body doubling or start recipes. | **Start recipes** (a layer, level and timer per Shortcut, as many as you like) in Plus; one tile, one automation and the widget stay free. Body doubling stays a P2 experiment. | Recipes need no server and no new privacy surface. |
| Growth: celebrate the activation moment; brand: quiet, no badges. | The Home indicator reads **"Stayed under your audio for 10 min"** once, in ink, for the session where it first happens. Nothing else. The definition is in `product-spec.md`. | One literal line in the place that already talks about your audio. |
| Audio engineer: drop the swapped pill; council bug 9: the swapped route shows no mark. | No pill (the swap doesn't change the beat). The readout's swap mark now follows the route as well as the ear-check setting, and the spec card has an **Ears** row: "Swapped for your headphones. The beat is the same either way." | Silent fix, honest readout. |
| Blind comparison: Hannah wants it untouched by the user's choices; Maya wants control. | Comparison sessions play **Medium, Hold, loudness-matched**; Level and Motion are visibly locked (hatched, with "fixed during the blind comparison" read out), and the felt says so. The setup page says it before you start. | Both arms must be identical except for the beat. Outside the comparison nothing is locked. |

## Bugs (all fixed)

| Bug | Fix |
|---|---|
| **Blind comparison unblinds after a session** (council 1, Dev, Hannah) | `useBlindView()`: during a session, after Stop and while "How was layer B?" shows, the readout says "Layer B · numbers hidden" and the stitch is neutral. While idle on the comparison's layer: "Blind comparison · Focus", and the arrival line says "in your blind comparison: A or B" (never "beat"). The spec card says "A or B". The noise arm no longer leaks through loudness either (noise only is matched). |
| **Take 5 looks like a new session** (council 2, Maya, Leo) | See the conflicts table. The status, felt and chip all read as a break, and the end offers Another 25 min. |
| **Blind legend reads as data; hard-coded "3 good, 2 same as usual, 1 not for me"** (council 3, expert B2) | Removed. Each label shows "Average" and "–" until *both* labels have at least one note, then the computed mean. The line under it is a scoring rule: "How the average is scored: Good = 3, Same as usual = 2, Not for me = 1. It shows once both layers have a note." The result names each mean with its n, and keeps "a hint, not a finding". |
| **Shared layer card doesn't drive the layer** (council 4, expert B4) | `store.setTransient()`: the shared layer is selectable, so the readout (10 Hz · L 175 / R 185), spec card ("shared with you, not saved") and Play it all use it. Save from the card, the spec card or while playing. Not now restores your last layer. |
| **Stale "It isn't a treatment" line after Stop; it replaced the time** (council 5, Sam) | Toasts have a kind. The first-play line is a *note*: it sits under the time, never in its place, and is cleared the moment the session fades out (Stop, Esc, a timer, a call, the Lock Screen). |
| Schedule time clipped ("09:30 PI") (council 6, Priya) | The time column is at least 9.5 rem; "09:30 PM" fits. |
| Cycles break said "Tucked in." (council 7, Leo) | "Five minutes off." (Plain: "Break, 5 min."), in the status line and its live region. |
| Vary gave no feedback (council 8, Maya) | The felt says "Vary: from your next session, a different noise bed each time." for 6 s; it clears if you switch back. |
| Swapped route showed no swap mark (council 9) | See the conflicts table. |
| Mono verdict link "Mono Audio is off" (council 10, Sam, expert B7) | The verdict states what was observed ("Both tones came through both ears, so left and right are being merged. Usually that's Mono Audio, Spatial Audio, or the phone speaker."), with **Show me where** (all three), **I've changed it, check again**, and Use noise only. |
| Level "Medium (0.28)"; hyphen-minus in "-24.1 dB" (council 11, Dev, expert) | Spec card: "Medium · beat −31 dBFS, noise −43 dBFS · ceiling Full"; noise row "Brown · 25% · −12 dB re the beat"; noise only "noise −30 dBFS, matched to the layer". Editor: "25% · −12 dB re the beat" and "At Medium: beat −31 dBFS, noise −43 dBFS (RMS per ear)". All with U+2212, from core helpers, so the labels are the real output. |
| Clocks ignored `?hour=` (council 12) | `ui.now()`: the status bar and Lock Screen show the simulated hour. |
| Two time statements in Sensory mode (council 13, Sam) | In Plain labels the status line carries the fade time; the felt shows no time until the fade-in ends. |
| Noise bed inaudible (expert B1) | See the top of this file. |
| Blind arms not level-matched; controls live during blind sessions (B3) | Noise only is loudness-matched; Level, Motion and Vary are locked for comparison sessions. |
| 200% text breaks the layer and clips Stop (B5) | All text sizes are rem (367 classes). The layer measures its controls and grows to fit (capped so the status line keeps room), its middle scrolls, and Start sound / Stop are pinned above the safe area. The readout and timer chip wrap instead of breaking per token; segmented controls wrap instead of truncating; the top bar grows; the spec card's big number is capped at 80 px. |
| Plus page contradicts itself (B6) | Two-column Free / Plus table; the intro no longer lists free things as paid. |
| Cycles "25 on, 5 off" vs "drop to Quiet"; no selected state (B8) | "Cycles: 25 min, then 5 at Quiet"; every timer row has the same radio mark as the layer picker. |
| Status "Tucking in…" at 25 min after Skip (B9) | Warp clock (see above). |
| Disconnected while idle: no pill, full binaural on Start (B10) | `disconnected` forces noise only, and its pill shows while idle: "No headphones, so noise only". |
| Editor dB excluded headroom and level (B11) | See Level above. |
| First-view explainer for returning users and above the shared card (B12) | It now appears once, after the first session (Maya), never above the shared card or with the sample week, and goes when the next session starts. |
| Raw `tuck.app/l?layer=…` link (B13) | The link is `tuckapp.com` (brand §1) and is copied, not shown: "With a tuckapp.com link that opens it in Tuck." |
| Found while testing: "That's Focus, noise only, as noise only" | `playsLine` strips the noise-only suffix. |
| Found while testing: the noise-only readout showed the slider % | It shows "Noise only · brown"; the % no longer describes the output (it's matched). |
| Found while testing: "Another 25 min" came back at Quiet (Take 5 stored Quiet as your level) | A Take 5 break, like a blind session, no longer changes the level you return to. |
| Found while testing: a long back label ("What we know") collided with the title in the header | The back label shortens to "Back" when the title moves into the header. |

## Must-fix items, by reviewer

**Maya.** Vary feedback ✓. Take 5 as a break ✓. The top half has one quiet job ("Started at 10:02 · this week") ✓. The "phone doesn't tell apps" note after the first session ✓.

**Dev.** Level in dB on the spec card and in the editor ✓. Shared link shows and plays the shared layer before Save ✓. Blind leak ✓. True minus ✓.

**Sam.** The treatment line clears on Stop and never replaces the time ✓. "I've changed it, check again" ✓. One time statement in Sensory mode ✓. No stray "Tuck" heading when there's no greeting (Plain, Sensory, greeting off, 00:00–04:00) ✓.

**Priya.** Schedule time field ✓. The morning note names the layer, the start time and the length ("Last night: Focus, 21:04, 10 min."), for sessions started between 18:00 and 04:00 ✓. Sleep notes beside the evening sessions on This week (a "Well / OK / Poorly" row under the bars) ✓. One free Health write ✓.

**Leo.** Take 5 ✓. Cycles break status ✓. Another 25 min ✓.

**Hannah.** Blinding kept until the reveal ✓. The legend is a scoring rule and the averages show "–" ✓. Per-layer averages and n only once both labels have notes ✓.

**Product designer.** Felt 20 px, stitch focal ✓. Dead band and duplicate name ✓. Spec card: Beat row, one button, Save only when unsaved ✓. Share sheet hides the query ✓. Onboarding 1: the Android line cut, one feature line, the lining at full strength ✓. Ear check: the caption stays ("Playing · 200 Hz"), the stitch block moved up ✓. (The ear check's lower half is still quiet space by design: the answer chips and verdict appear there.)

**Accessibility.** 200% text ✓. Blind result computed and labelled ✓. Mono verdict ✓. Sensory felt compact ✓. Study tags are borderless "Finding:" text with a glyph (↑ benefit, ○ no clear effect, ↓ slightly worse, ± mixed) ✓. Plus in two columns ✓. Naming: "Steady mode" is gone (it's "Pin one layer to Home" / "pinned"), and the intent chip says **Evening descent**, as the picker does ✓.

**Audio engineer.** One noise law, calibrated and tested ✓. Noise only matched ✓. Blind arms matched and locked, said on setup ✓. Editor and spec card show physical levels ✓. Swap pill dropped, swap crossfaded ✓. `ensureRunning` waits for statechange ✓.

**Growth.** Noise fixed before any external test ✓. Shared landing plays the layer, Save after ✓. Plus: price and trial, Free / Plus table, start recipes ✓. Activation defined and marked once ✓. One tap to first sound ✓.

## Still open (deliberately)

- **Body doubling** stays a P2 experiment (needs a server and a privacy design, brand §14).
- **The price** (£24.99 a year / £3.49 a month, 7 days free) is a proposal for testing, and the page says so.
- **Start recipes and Health** are described, not wired, in the prototype; the native reference engines don't yet include the Shortcuts layer.
- **Noise only loudness** is matched by formula (power sum of the beat and noise loudness), verified with K-weighting in the core tests; it should be confirmed by ear on real AirPods and the phone speaker before an external test.

## Measured output (built page, `.shots/r3-measure.mjs`)

RMS per ear after 14 s, tapped at the node that feeds `AudioContext.destination`. "Noise" is the power outside ±4 Hz of the two tones.

| Layer and level | Total RMS (L / R) | Noise (L / R) | Peak | Round 2 review measured |
|---|---|---|---|---|
| Focus, Medium (beat + brown 25%) | −31.0 / −31.0 dBFS | −43.0 / −42.7 dBFS | −24 dBFS | noise not measurable under the tone |
| Focus as noise only, Medium | −30.5 / −30.0 dBFS | (all noise) | −17 dBFS | **−67.4 / −66.9 dBFS** |
| Focus, Full | −23.7 / −23.8 dBFS | −36.3 / −36.1 dBFS | −16 dBFS | noise about −60 dBFS |

The noise now sits 12 dB under the beat at 25%, as designed, and noise only lands within 1 dB of the layer it replaces. Everything stays at least 16 dB under full scale, and about 10 dB or more under typical mastered music at Full.
