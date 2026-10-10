# Round 4: response and changes

**Date:** 10 Oct 2026 · **Build:** `prototype/dist/index.html` (single file, about 838 kB, `npm run build` clean) · **Core:** 183 tests passing (181 before: 2 new loudness tests in `loudness.test.ts`), typecheck clean
**Inputs:** `round-4-council.md` (six personas, mean 8.5, min 8.0) and `round-4-experts.md` (four experts, mean 8.5, min 8.0). Combined: average 8.5, minimum 8.0. Target for round 5: average ≥ 8.7, every reviewer ≥ 8.
**Method:** every bug in both reviews was reproduced in the built page, then fixed, and every must-fix was built or decided against below. The fixes were checked with a scripted Playwright pass (`scratchpad/r5/check.mjs`: element positions, readout text, CSV contents) and by viewing the screenshots. All screens in `docs/screens/` were re-captured with `tools/shoot-all.mjs`, now 72 (12 new, one more inside a sandboxed iframe with no `allow-downloads`).

## What round 4 asked for, in one line

The two lowest scores (Sam 8.0, accessibility 8.0) and three of the 8.5s came from one place: the top of Home. At default text size the layer covered the "Started at…" line, with a **More** pill on top of it. At 200%, the pill floated over the words it was meant to reveal. The other theme was numbers that disagreed: the journey readout, 43 vs 44 min, and the editor showing L / R for an invalid beat. Both are fixed at the cause, not patched per screen.

## The two layout fixes

### 1. At default text sizes, the top is never covered and there is no More (Maya 1, N1, growth 1)

**Cause.** The playing layer rests at its level's height (Full 580 pt). The space above it only fits the status, the name and the glance line at Medium with nothing else showing. Full, any headphone pill, a notice, or a shared layer's Save row pushed the glance line under the layer, and `useOverflowBelow` then drew the More pill over it.

**Fix (`screens/Home.tsx`).** While playing, Home measures what its top needs: the top bar plus the natural height of the status, name, pill or notice and glance line (`ui.playTopH`, measured from the content, not from the box it is given, so it can't feed back). `layerTotalH()` then rests the layer no higher than leaves that visible, at default text sizes. The level's height gives way first: Full rests at 599 pt total instead of 614 with nothing else showing, and lower with a pill. The Level control still shows which level is on, and the sound is unchanged. The layer never goes below its own controls' measured minimum.

**Verified (390 × 844, default text):**

| State | Glance line | Layer top | More |
|---|---|---|---|
| Full (tap or ↑ key) | 203–225 pt | 245 pt | none |
| One earbud / Mono (+ Full) | 263–285 pt | 305 pt | none |
| Shared layer playing (+ Full) | 251–273 pt | 293 pt | none |
| Cycles | 203–225 pt | 280 pt | none |

The More cue now only exists at accessibility sizes (below). Screens: `61-playing-full`, `62-playing-one-earbud`.

### 2. At 200%, the cue sits below the text, never on it (Sam 1, N2, N3)

- **The More cue has its own reserved 48 px row** under Home's scroll area, at accessibility sizes only. It's in the flow, so it can't cover a word, and the space is reserved, so the text doesn't jump when the cue comes and goes. It's a bordered button ("More ⌄", "More above the layer. Scroll down." to a screen reader), not a floating shadowed pill.
- **It goes while a sheet or the spec card is open** (N2: Playwright had found clicks swallowed under the card).
- **The question is never cut mid-word.** Home's voice headings cap at 48 px and its status lines at 38 px. At 200% the question was 62 px and three lines tall, which can't fit above a layer that needs half the screen for its controls. Now "How are you / arriving?" is two whole lines. Body text, chips, buttons and the readout still scale in full. The headings stay at least 1.5 × the body size, so the hierarchy holds. This is the one place where text scales less than 200%, and it is a display heading.
- **Session end at 200%:** "Set down after under a minute. / Fading out over 20 seconds." is fully visible. "Start it without opening Tuck" waits for a default-size session (it's also in the Menu), so it never sits under the layer (accessibility 3).
- **N3:** each ear's value stays with its label on the spec card and in the editor (`L 200 Hz`, `R 214 Hz` with no-break spaces and `nowrap`). The line can wrap only at the dot.

Screens: `47-large-text-idle`, `65-large-text-session-end`, `72-large-text-idle-more`, `48-large-text-spec-card`.

## Numbers that agree

### 3. The journey readout (Dev 1, Hannah 1, Priya 3; bug 3)

**Cause.** `Home.tsx:858` showed the live beat (`s.beatNow`) beside the layer's static start ears (`ears(layer)`), so it read "7.8 Hz · L 136 / R 144". `beatNow` also survived the session, so idle read "2 Hz · L 136 / R 144".

**Fix.** The session now carries the live carrier too (`carrierNow`, from the player's `current`). A single helper, `readoutNumbers(layer, live)` in `tuck/layers.ts`, derives L and R from the live beat and carrier, rounds each ear, and shows the beat as R − L of the rounded values. So the line is self-consistent by construction ("8 Hz · L 135.9 / R 143.9", "2 Hz · L 119 / R 121"). It falls back to the layer's start values whenever the session isn't running. `beatNow` and `carrierNow` are cleared when a session returns to idle. The Lock Screen uses the same helper. Verified: Evening descent idle "8 Hz · L 136 / R 144", playing and live, and back to "8 Hz · L 136 / R 144" after a full 60 s set-down (`66-evening-descent-playing`).

### 4. One minute count (Priya 1, N4; bug 7)

**Cause.** The session end and the morning note count listening time up to Stop, rounded down (43). Core's history record runs until the fade has finished, and This week rounded to nearest, so 43 min + the 60 s fade read 44.

**Rule, stated in the spec and SCREENS.md:** minutes are listening time up to Stop or the start of the timer's fade, **rounded down**. The fade-out is reported on its own, in seconds. Implemented in `audio/session.ts` (`heardSec`, set at Stop or when the end fade begins, caps the recorded `durationSec`) and in `durationWords` and This week's bars (now `floor`). Verified end to end: a 43 min 25 s Evening descent reads "Set down after 43 min", "Last night: Evening descent, 21:05, 43 min", "43 min this week", Saturday's bar 43, and By layer 43.

### 5. "0 noted sessions" under a sleep note (Priya 2; bug 7)

With only sleep notes, the session-notes summary no longer renders. Your notes now counts sleep notes in their own line: "1 sleep note, the morning after an evening session." This week's Export CSV includes sleep notes as rows (`arm` = `sleep note`, rating 3 / 2 / 1), so the file matches the screen (`70-this-week-sleep-note`).

### 6. The editor with an invalid beat (Dev 2; bug 6)

While the beat is out of range, the ear line reads "L and R show once the beat is in range." It doesn't derive 157.5 / 256.5 from 99 Hz (`67-editor-invalid-beat`).

### 7. Export times on the app's clock (Dev 3, N7; bug 8)

`notesCsv` uses `ui.appTime()`, which is the clock the screen shows (shifted by `?hour=`). It also adds a `started_at` ISO column with the UTC offset (`2026-10-10T09:55:09+00:00`). The real build has no shift, so the real clock is used.

### 8. The blind CSV stands on its own (Hannah 3)

After the reveal, `tuck-blind.csv` fills the new `arm` column (`beat` / `no beat`) and `beat_hz` (14 for the beat arm, 0 for the sham). Before the reveal both stay blank, so nothing leaks. This week's CSV marks ordinary notes `beat` or `noise only` (`71-blind-export-revealed`, captured in the sandboxed frame).

## Smaller fixes

| # | Fix | Where |
|---|---|---|
| Bug 4 / Sam 2 | **A disconnect mid-session says so on Home**: "Headphones disconnected, so Tuck faded out. Start plays noise only until they're back." It replaces the generic pill, so the same thing isn't said twice, and it goes when headphones return. The copy lives once in `tuck/copy.ts`, shared with the sheet. | `Home.tsx` `NoticeBanner`, `64-disconnected-mid-session` |
| Bug 5 / Leo / N5 | **Cycles states its end:** "Started at 10:57 · ends at 12:52" (four 25 min rounds and three 5 min breaks; no break after the last). Any plan with an end (a timer, Cycles, Evening descent) now states it in the glance line ahead of the weekly total. The time-blindness anchor beats a tally. | `sessionEndsAt()` in `Home.tsx`, `63-cycles-running` |
| Bug 9 / Maya 2 | **One pull hint, every time:** "Pull the top edge up, or tap Start sound." (Plain labels too). Brand §6 and the spec are updated. | `Home.tsx` `Felt` |
| Hannah 2 | Blind setup: "…with no beat: **they're built to sound alike**." It's a design claim, not a tested one. | `Pages.tsx`, spec row 23 |
| N6 | "Turn the log off in Settings → Your notes." | `Pages.tsx` |
| N8 | After Copy all, "Try saving it as a file anyway" resets the button to "Copy all" under the new status. | `ExportSheet` |
| N9 | The ear check from the Menu or Settings no longer offers "Skip, use noise only". Close is top left. After a verdict that isn't OK, it offers "Use noise only", named as the mode change it is. First run keeps "Skip, use noise only". | `Onboarding.tsx` |
| N10 | SCREENS.md and `greetingFor`'s comment now say there is no greeting line from 00:00 to 04:00 (it never read "Tuck"). | `SCREENS.md`, `copy.ts` |

## Audio (A1–A4)

- **A1, loudness match, not RMS match.** This was already the design (`NOISE_FULL_GAIN` and `noiseOnlyGain` are set from BS.1770 K-weighting), but only Focus's brown noise was tested. `core/test/loudness.test.ts` now renders every built-in layer with its own carrier, beat and noise colour, plus its noise only, through K-weighting. All are within 0.3 LU, against a requirement of 1 LU: Focus +0.01, Calm +0.10, Unwind +0.20, Evening descent +0.28, Steady +0.09, Long focus −0.02 LU. The panel's estimate that noise only reads 2 to 4 LU quieter doesn't hold, because the RMS was already raised to compensate for the K-weighting of brown noise's low end.
- **A2.** The +0.7 dB RMS rise at Beat Off is that loudness match: brown noise needs about +0.6 dB more RMS than a ~200 Hz tone for the same LKFS (pink about −0.5 dB). The test pins it at 0 to 1.5 dB RMS for Focus, so the numbers are explained rather than tolerated.
- **A3, true-peak ceiling: −1 dBTP** (`PEAK_CEILING`), now stated in the spec (product-spec → Output levels). The hottest case, brown noise only at 35% on Full, measures **−10.0 dBTP** (4× oversampled, 64-tap windowed sinc; sample peak −10.1). That's 9 dB of headroom, and a test keeps it under the ceiling. The panel's estimate was about −11.
- **A4, measurement hygiene.** Confirmed: `__tuck.session.setBinaural(false)` is undone within one render by Home's sync effect (binaural stays `true`, the readout still says 14 Hz), so the round-3 "Beat On → Off −30.8 ± 0.3" row measured a no-op. That row is withdrawn from `final-report.md`. `?debug=1` now exposes `__tuck.setBeat(on)`, which flips the layer the way the spec card's Beat switch does (checked: binaural false, readout "Noise only · brown", and back). The spec says to drive audio checks through it and to assert the tone scan as well as RMS. The panel's own UI-driven measurement (−30.8 → −30.1 dBFS, tones gone) stands as the Beat Off record.

## Growth

- **Activation in five seconds.** Prototype controls → **Show the activation moment** starts a session (if none) and the simulated other app, then shows "Stayed under your audio for 10 min" in the indicator, for this session only. `prefs.activatedAt` isn't written, so the real moment still happens once (`69-activation-moment`).
- **Share recipients on a speaker.** A recipient on a first visit (no setup before the link) who has had a minute of sound, and still has no ear-check verdict, sees one quiet line under Save: "The beat needs stereo headphones, one tone in each ear." with **Stop and check my headphones**. It fades the layer over 1.5 s and opens the ear check with Close. The check needs silence, so the button says it stops (`68-shared-recipient-check`).
- **Funnel:** `share_opened` (with `first_visit` only), `share_played` (60 s of sound), `share_saved` and `share_ear_check` are in the spec table. None carries a layer, a word or a sender. The loop is judged as opened → played → saved.
- **N1 before any share test:** done (fix 1). The shared layer playing at Full shows the glance line with no More.

## How conflicts were resolved (via `brand.md`)

- **Level height vs the top line.** Brand §7 makes the layer's height the level. Brand §12 asks for one decision and gentle, predictable screens, and §5.5 for exact numbers that are always present. A level that hides your own status line fails §12, and the Level control already names the level. So the top wins: the layer gives up 15 pt at Full with nothing else showing, and up to 75 pt with a pill, only when the top needs it. §5.4 ("motion and sound are one event") still holds, because the layer only moves for a reason that changes the sound: a level change, or a route change that crossfades to noise only.
- **Weekly total vs end time in the glance line.** Both are "plain facts, no streaks". For a session with a plan, the end time is the more useful fact for time-blind users (Maya, Leo), and the weekly total is one tap away on This week. So the end time comes first.
- **Headings at 200%.** Accessibility asked for the question never to be cut. Full 200% headings can't fit above the controls on a 390 pt phone. Brand §9 says "the home line wraps; controls never shrink", so the home line still wraps and no control or body text shrinks. Only the Literata display heading is capped, so every word stays visible.
- **The share-recipient prompt vs "never on Home: upsells, prompts".** It isn't an upsell and it isn't shown to set-up users. It appears once the person has heard a minute, it says a literal fact, and the action says it stops the sound.

## Screens added in `docs/screens/`

`61-playing-full`, `62-playing-one-earbud`, `63-cycles-running`, `64-disconnected-mid-session`, `65-large-text-session-end`, `66-evening-descent-playing`, `67-editor-invalid-beat`, `68-shared-recipient-check`, `69-activation-moment`, `70-this-week-sleep-note`, `71-blind-export-revealed` (sandboxed frame), `72-large-text-idle-more`. All 72 were re-captured and viewed.

## Not done, and why

- **The onboarding stitch pulsing once on "Playing left"** (designer, small). It's a motion addition, and the stitch already lights the left half. Kept for the motion review alongside Reduce Motion.
- **Wiring the funnel events.** They stay specified, not wired: the prototype sends nothing anywhere, by design.
- **A UI-driven, in-browser LUFS meter** for the built page. Core's K-weighted tests render the same buffers and gains the engine uses. The native week-2 exit criterion ("output levels match core's loudness tests within 1 dB") covers the device side.
