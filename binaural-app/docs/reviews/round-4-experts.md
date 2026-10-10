# Round 4: expert panel review of the Tuck prototype

**Date:** 10 Oct 2026 · **Build:** `prototype/dist/index.html` (834 kB single file, `npm run build` clean) · **Core:** 181/181 tests pass · `tools/ramp-check.mjs` passes 7 of 7
**Screens:** 118 PNGs in `binaural-app/.shots/r4-expert-*` (390x844 @2x), reviewed as 4-up contact sheets in `.shots/r4m/`. They cover every flow in `SCREENS.md`: onboarding and every ear-check verdict, Home idle, chip, playing (fade-in and 9 s), Full / Quiet / Vary, the spec card (beat on and noise only), the layer picker, the timer, Cycles and its break, the 25 min timer end, Take 5, Break over and Another 25 min, Same as last time, Arriving differently, the five-intent row, the pin, Evening and its descent card, the shared layer with a note, Share and Copied, editor, save, saved card and delete, the Menu, Settings end to end, Sensory mode, What we know, the studies, the blind comparison from setup to result, How Tuck plays, This week (empty, sample, and with real notes), the rating, the morning sleep note, the Lock Screen idle and playing, Plus, Start without opening Tuck, the ear check from the Menu, all headphone routes and their sheets, a call, another app playing, a takeover, the keyboard, 200% text (idle, playing, playing with a pill, spec card, session end) and the 1280 px frame.
**Sandboxed viewer:** I re-ran the export and copy flows inside `<iframe sandbox="allow-scripts allow-same-origin">` with no `allow-downloads`, using a **real** log (Settings → log on → play → rate) rather than seeded notes. I read the system clipboard from the parent page afterwards to confirm that "Copied" was true (`scratchpad/r4/clip.mjs`).
**Measured:** the built page's real output in Chromium. A `ScriptProcessor` tap sits on every node feeding `destination` (4096-sample blocks, about 93 ms), and it records RMS and peak per ear, the largest second difference (click detector), and Goertzel tone levels per ear at 136 / 144 / 175 / 185 / 200 / 207 / 214 Hz. Scripts: `scratchpad/r4/meas.mjs` and `meas2.mjs`. Every state was driven through the **UI** (testids), not through `__tuck.session` directly (see A4).
**Read:** `round-3-experts.md`, `round-3-response.md`, `product-spec.md` → Funnel events, `screens/Home.tsx` (More cue, playing glance, beat sync effect).

| Panelist | R1 | R2 | R3 | **R4** | Summary |
|---|---|---|---|---|---|
| 1. Product designer (ADA bar) | 7.0 | 7.5 | 8.0 | **8.5** | The arc is complete and calm. The export sheet is a model of an honest fallback, and the ear check finally feels designed. One new polish regression is visible at default text size: a "More" pill lands on top of the playing glance line. |
| 2. Accessibility and neurodiversity | 7.5 | 7.5 | 8.0 | **8.0** | Every literal-user complaint from round 3 is fixed and verified: exports, an honest Copied, the call copy, the idle disconnect copy, the naming. The 200% top region is still the weak spot. The new More pill covers the words it's meant to reveal, and the question is still cut mid-word. |
| 3. Audio engineer | 6.5 | 5.5 | 6.5 | **9.0** | B1 is fixed and I verified it by measurement. Stop, the timer end, level changes, the swap, Beat Off, Mono and the disconnect are all smooth, dB-linear and click-free, and the sham arm is a real sham. What's left is refinement: loudness matching (not RMS matching) for noise only, and the measurement hygiene behind one row of the response. |
| 4. Growth and product strategy | 6.5 | 7.0 | 7.5 | **8.5** | The published demo no longer fails in front of stakeholders. The comparison holds up to a sceptic, and the shared word is a good, privacy-safe loop. Next: make the activation moment and the share loop visible to the people judging the demo. |

**Panel average: 8.5** (round 3: 7.5). Minimum 8.0. This is the first round in which nothing is a ship-blocker. The remaining work is layout polish at the top of Home, plus 200% text.

---

## Round-3 bugs: verified status

| R3 bug | Claimed | Verified in round 4 |
|---|---|---|
| B1 ramp anchor (Critical) | Fixed | **Fixed.** Stop after 60 s: −30.8 → −30.9 dBFS in the first 93 ms, then −40.8 at +5 s, −50.7 at +10 s, −60.7 at +15 s, −70 at +19.5 s, then silence (a textbook 2 dB/s dB-linear fade). Timer end via Skip: the same 2 dB/s slope, no step. Medium → Full and Full → Quiet are 1 to 1.6 s glides, and the second difference moves monotonically (no spike). `ramp-check.mjs` passes 7 of 7. |
| B2 silent export (High) | Fixed | **Fixed** in the sandboxed frame for This week CSV, Settings JSON and the blind result. The sheet says "This viewer can't save files, so here is tuck-notes.csv to copy." Copy all put the real JSON on the clipboard (confirmed by reading it back). "Try saving it as a file anyway" fired no download event and said so: "If no file appeared, this viewer blocks downloads." |
| B3 false "Copied" | Fixed | **Fixed.** Share → Copied in the frame, and the clipboard held `Focus: 14 Hz over brown noise, L 200 / R 214. https://tuckapp.com/l?layer=14,207,brown,25,drift,1,Focus`. |
| B4 blind arms told apart by timbre | Fixed | **Fixed.** Arm A: 200 Hz on L (−31.1), 214 Hz on R (−31.2). Arm B: 207 Hz in both ears (−31.1 / −31.2). Total −30.8 vs −30.9 dBFS. The arms differ only in the beat. |
| B5 200% top region clipping | Fixed | **Partly.** The spec card now opens below the top bar ✓ and the indicator is one line ✓. But the new More cue sits on top of the text, and the question is still cut ("How are you arrivin"). See N2. |
| B6 disconnect sheet while idle | Fixed | **Fixed.** "No headphones connected, so Start plays noise only. Connect headphones to hear the beat." |
| B7 call "Paused" | Fixed | **Fixed.** "Stopped for your call. Start sound when you're done." with no duplicate link. |
| B8 "Sleep" naming | Fixed | **Fixed.** Settings: "Calm, Unwind and Evening descent". What we know: "least of all Evening descent". |
| B9 schedule select truncation | Fixed | **Fixed.** The full-width Play select reads "Evening descent". |
| B10 Beat On ↔ Off dip | Fixed | **Fixed**, measured through the spec card: −30.8 → −30.1 dBFS over 4 s, with no dip (a +0.7 dB rise; see A2). |
| B11 export with zero notes | Fixed | **Fixed.** Export appears only once there's a note. |
| Audio 4: mid-session swap | Fixed | **Fixed.** At the swap, L/R tones exchange (200 Hz moves from L to R). One 93 ms block dips 1.9 dB (the 25/25 ms dip), with no click. |

## New bugs (verified)

| # | Severity | Where | Bug | Evidence |
|---|---|---|---|---|
| N1 | **Medium** (visible at default size) | Home playing: `useOverflowBelow` and the More cue in `screens/Home.tsx:422` | The response says the More cue "never shows" at default sizes. It does, whenever the playing top content is taller than the space above the layer, and then it **covers the "Started at …" line** with a pill. Reproduced in four states: **Full** (layer 580 pt), **any headphone pill while playing** (one earbud, Mono, Spatial), the **shared layer playing** ("Save Library" row), and the keyboard ↑ to Full. The glance line is cut to "Started at 10:32 · fades out when you s…" behind the pill. | `r4-expert-05-home-4`, `-21-routes-4/5/6`, `-11-shared-1`, `-kb-0` |
| N2 | Medium (a11y) | Home at 200% | The More pill is drawn **over** the text it's meant to reveal: it hides "arriving", "Fading out over 20 seconds" and "Started at 10:37 · fades out whe…". The question is still cut mid-word at idle. At the session end, Done shows but "Start it without opening Tuck" is under the layer. With the spec card open, the pill stays in the DOM under the card, so a tap on it is swallowed (Playwright: "subtree intercepts pointer events"). | `r4-expert-big-idle-0`, `big-end-0/1`, `big-play-1`, `big-spec-0` |
| N3 | Low | Spec card at 200% | The "L 200 Hz · R 214 Hz" readout breaks as "R" / "214 Hz", which splits a value from its label. | `r4-expert-big-spec-0` |
| N4 | Low | Session end vs This week | An Evening descent session reads "Set down after **43** min" and the morning note says "43 min", but This week's bar and By layer say **44**. Round each total the same way everywhere, or count the fade in both. | `r4-expert-20-rating-0`, `-morning-1`, `-morning-2` |
| N5 | Low | Cycles playing glance | With Cycles (4 rounds, a defined end), the first-session line says "fades out when you stop". Say "Round 1 of 4 · ends at 12:32" or "4 rounds". | `r4-expert-06-timer-1` |
| N6 | Low (copy) | This week, under Export | "Turn the log off in Settings, Your notes." The comma reads as a list. Use "Settings → Your notes". | `r4-expert-20-rating-3` |
| N7 | Low (demo) | CSV export | The `time` column uses the real clock (03:36) while the simulated app clock reads 10:xx, and there's no timezone. Anyone who opens the file in the demo sees times that disagree with the screen. Use the app clock, and add an ISO time with an offset. | `r4-expert-sb-6-csv-sheet` |
| N8 | Low | Export sheet | After Copy all and then "Try saving it as a file anyway", the button still reads **Copied** under a status that now says "If no file appeared…". Reset the button when the status changes. | `r4-expert-sb-3-save-anyway` |
| N9 | Low | Ear check from the Menu | A set-up user is offered "Skip, use noise only". Here that's a mode change, not a skip, and "Close" already exists top left. Drop it or reword it to "Use noise only". | `r4-expert-18-mix-6` |
| N10 | Doc | `SCREENS.md` | It says that from 00:00 to 04:00 "the greeting reads 'Tuck'". The code (correctly) shows no greeting then. Update the doc. | `r4-expert-25-mid-0` |

---

## 1. Product designer (score 8.5)

**Round-3 must-fixes checked:** call notice ✓; disconnected idle sheet ✓; ear check lower half ✓ (the stitch sits in the middle and every state is balanced, `01-onb-*`); Home playing dead band ✓ at Medium (the line sits 12 px under the name); schedule select ✓.

**Loves**
- **The export sheet** (`sb-1…3`) is the best "it couldn't do what you asked" screen I've seen in a prototype: the file name, the line count and size, the file itself, one Copy all, and a status line that always says what happened. It turns a sandbox limitation into a trust moment.
- **The morning note** (`morning-1`): "How did you sleep? Last night: Evening descent, 21:38, 43 min. One tap, kept on this phone." Then "Well" appears under Saturday's bar. It's quiet and concrete.
- The **evening Same as last time?** pre-selects Evening descent with warm dim wool, and at 21:00 the Home and the default finally agree.
- **The shared layer with a word:** "Someone shared a layer, 'for reading'." The serif quote carries warmth with no avatar or name.
- **The blind result** ("Layer A had the beat. Layer B played the same tones with no beat."), with "–" until there's data. It's honest typography.

**Must-fix**
1. **N1:** the playing top must never need a More pill at default text size. Either keep the glance line visible by measuring the space and moving the layer's rest height down (Full can rest at 560 when a pill or the Save row is showing), or fold the glance into the status line in those states ("Tucked in · since 10:32"). The pill should exist only at accessibility sizes.
2. **N5:** the Cycles glance should state the plan's end.
3. **N4:** one rounding rule for durations.
4. Small: the onboarding stitch could pulse once when "Playing left" starts, so the visual and the sound are tied. Right now only the left half brightens, and that's easy to miss.

## 2. Accessibility and neurodiversity UX (score 8.0)

**Round-3 must-fixes checked:** silent export ✓ (verified in the frame, with a real clipboard read-back); honest Copied ✓; naming ✓; fades that jump ✓ (measured, no startle at Stop or at the timer end); 200% top region ✗ (partly; see N2).

**Loves**
- "Copied 77 lines. Paste it into a file named tuck-data.json." That's a literal, complete instruction.
- Idle disconnect: "No headphones connected, so Start plays noise only. Connect headphones to hear the beat." Cause, effect and fix in two sentences.
- Sensory mode playing: "Starting. Fading in over 15 seconds." and "Ceiling: Medium. Change it in Settings." with a hatched Full. It's predictable.
- Below 5 notes, counts instead of words ("With the beat: 1 note: 1 good.") stops the app from overclaiming.

**Must-fix**
1. **N2, 200% top region, third round running.** The cue must not cover content. Put it **below** the scroll area (in the 12 px gap above the layer edge, full-width, "More above the layer ↓"), or pad the scroll area's bottom by the pill height so the last line can scroll clear of it. Never cut the question: at 200% the question gets the full width, and the chips move into the scrollable list beneath it. Hide or `inert` the pill whenever a sheet or the spec card is open.
2. **N3:** keep "R 214 Hz" together (`white-space: nowrap` per ear, wrapping only at the "·").
3. **At the 200% session end,** "Start it without opening Tuck" is off-screen. Since it only shows until it's tapped or dismissed, at large sizes give it to the Done row as a second line, or skip it.
4. **N9:** a returning user shouldn't meet "Skip" from a Menu destination. A literal reader asks "skip what?".

## 3. Audio engineer (score 9.0)

**Measured in the built page** (Chromium, UI-driven, RMS per ear, Goertzel per ear):

| Check | Measured | Verdict |
|---|---|---|
| Channel mapping (Focus) | 200 Hz: L −31.1 / R −45.1 (leakage); 214 Hz: L −45.1 / R −31.2 | ✓ |
| Medium / Full / Quiet total | −30.8 / −23.8 / −40.6 dBFS, peaks −23.5 / −16.5 / −33.2 | ✓ matches the spec card (beat −31 / −24 / −41) |
| Fade-in (8 s) | −74 → −30.9 dBFS, about 0.5 dB per 93 ms block, monotonic, no edge | ✓ |
| **Stop after 60 s (20 s fade)** | −30.8 → −30.9 (first block), −40.8 @5 s, −50.7 @10 s, −60.7 @15 s, −70 @19.5 s, then 0 | ✓ **B1 fixed** |
| Timer end (25 min via Skip) | the same 2 dB/s slope from −30.8 to −70, no step | ✓ |
| Level M→F / F→Q | 1.0 s / 1.6 s glides; second difference changes monotonically (no spike) | ✓ no click |
| Beat Off via spec card (4 s) | −30.8 → −30.1 dBFS, no dip; tones gone (scan ≤ −47) | ✓ (+0.7 dB, see A2) |
| Mono route mid-session | the same crossfade, ends noise only −30.3 | ✓ |
| Disconnect mid-session | −30.8 → −69 dBFS in about 1.7 s, dB-linear, then 0 | ✓ |
| Swap mid-session | tones exchange ears; one block −1.9 dB (the 25/25 ms dip) | ✓ |
| Speaker route | noise only −30.1 / −30.3, no tone | ✓ |
| Blind arms | A 200/214 at −31.1; B 207/207 at −31.1; totals −30.8 / −30.9 | ✓ a true sham |
| Ear check | L tone only on L (R digital silence) and the reverse; −33.7 dBFS RMS, peak −24 | ✓ |
| Evening descent @15 s | L 136 / R 144 region, tone −31, total −30.5 | ✓ |

**Loves**
- The fix is in the right place (core `holdParam`), it comes with a **spec-faithful mock** and a real-browser `OfflineAudioContext` check, and I measured the effect end to end. This is how audio regressions should be handled.
- The **sham arm** is the right scientific control, and it's matched to 0.1 dB.
- Every fade is now honest dB-linear: Stop, the timer end and the disconnect differ only in duration. "Even in dB" on the spec card is true.

**Must-fix / should-fix**
1. **A1, loudness match, not RMS match, for noise only.** Noise only is matched in RMS (−30.1 vs −30.8), but most of brown noise's energy sits below 150 Hz, where ears and K-weighting count it less than the 200 Hz tones. My estimate, not measured, is that noise only reads 2 to 4 LU quieter than the layer it replaces, and the Beat Off and Mono switch may feel like a drop even though the meter says +0.7 dB. Measure integrated LUFS (BS.1770 K-weighting) for each layer vs its noise only, and match within 1 LU. Do the same for the blind arms (they're identical in spectrum, so they're already fine).
2. **A2:** the beat-off endpoint is 0.7 dB hotter than the beat-on state. That's within tolerance, but fold it into A1's calibration.
3. **A3, crest factor:** brown noise only at Full will peak around −11 dBFS (measured −17.8 at Medium). That's fine for the digital path, but when it sums under music at full device volume, check that the limiter or ceiling is defined. State the true-peak ceiling in the spec.
4. **A4, measurement hygiene (process).** Calling `__tuck.session.setBinaural(false)` is **immediately reverted** by Home's sync effect (`Home.tsx:69`): in my capture the tones never left. The round-3 response's "Beat On → Off: −30.8 ± 0.3 dBFS throughout" figure matches that no-op capture exactly, so that row probably measured nothing. (The UI path is fine; I measured it above.) Drive audio checks through the UI, or expose a debug setter that writes the pref, and assert the tone scan as well as RMS.

## 4. Growth and product strategy (score 8.5)

**Round-3 must-fixes checked:** export fallback in the viewer ✓ (verified in the frame); sham arm before marketing ✓; B1 before listening tests ✓; optional shared word ✓; funnel instrumented in the spec ✓ (`product-spec.md`: local counters, opt-in aggregates, with no layer names or words; that's the right privacy shape).

**Loves**
- **Plus is a fair, legible deal:** £24.99/yr, 7 days free, a reminder 3 days before, a Free / Plus table, and sync described as "your own iCloud or Google account, end-to-end encrypted, no Tuck server". It's credible for the privacy-first segment.
- **The shared word** creates context ("for reading") without identity. That's a share loop that doesn't fight the brand.
- **The comparison** is now defensible. "Your own evidence" can be marketed without inviting a debunk thread.
- **Start without opening Tuck**, shown once until it's tapped or dismissed, is the right retention lever for the ADHD core.

**Must-fix**
1. **N1 is a demo-judging issue.** The shared-layer playing screen, which is the first thing a share recipient sees after "Play it", shows a "More" pill covering text. Fix it before any share-loop test.
2. **Make activation visible in the demo.** "Stayed under your audio for 10 min" only appears after 10 minutes with the other-app toggle on. Add a Prototype control, "Show the activation moment", so judges see the aha in 5 seconds.
3. **Share recipient conversion:** after "Play it", the recipient sees "Save Library" but no route to their own first ear check. Add one quiet line after the first 60 s for recipients with no setup: "Tuck needs stereo headphones for the beat. Check yours". Shared listeners are the users most likely to be on a speaker.
4. **Funnel, next step:** add `share_opened`, `share_played`, `share_saved` (no word, no layer) to the spec table, so the share loop can be judged like onboarding.

---

## Summary of must-fixes for round 5

1. Remove the More pill from every default-size state; keep the playing glance visible at Full, with pills, and on a shared layer (N1).
2. 200% text: the cue below the text, never on it; the question never cut; the pill hidden under sheets and the spec card (N2, N3).
3. Loudness-match noise only and the Beat Off target in LUFS, not RMS (A1, A2).
4. Small consistency fixes: duration rounding (N4), the Cycles end (N5), copy (N6, N9), the export time column (N7), the stale Copied (N8), the SCREENS.md greeting (N10).
5. Demo affordances: an activation preview control and a headphone prompt for share recipients.
