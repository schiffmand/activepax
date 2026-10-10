# Round 3: expert panel review of the Tuck prototype

**Date:** 10 Oct 2026 · **Build:** `prototype/dist/index.html` (single file, 822 kB, `npm run build` clean)
**Screens:** 148 PNGs in `binaural-app/.shots/r3-expert-*` (390x844 @2x), viewed as 4-up contact sheets in `.shots/r3-expert-m/`. They cover every flow in `prototype/SCREENS.md` with real waits: all ear-check verdicts, 9 s of playback, every level and motion, the timer, Cycles and its break, Take 5 → Break over → Another 25 min, the blind comparison end to end, the session rating, the morning sleep note, all seven headphone routes and their sheets, a call and a takeover, Sensory and Plain labels, keyboard, 200% text, the shared layer, editor → save → delete, Settings scrolled, and the 1280 px frame. I added three flows: Export CSV, Copy text and link, and Settings scrolled end to end. There were no console or page errors. Three clicks failed, all by design: Full is locked in Sensory mode, Full is locked in a blind session, and the swapped route has no pill.
**Measured:** the real output of the built page in Chromium. A `ScriptProcessor` recorder was tapped onto every node that connects to `AudioContext.destination`, so I had raw samples for each run. From those I computed RMS and peak per ear, a Goertzel tone scan per channel (tone vs. residual noise), a 0.1 to 1 s envelope, and second-difference (click) detection. Scripts: `scratchpad/meas.mjs`, `meas2.mjs`, `meas3.mjs`. I confirmed one Web Audio behaviour separately in an `OfflineAudioContext`.
**Read:** `round-2-experts.md`, `round-2-response.md`, `round-2-council.md`, `prototype/src/audio/{hub,layerEngine,session}.ts`, `core/src/audio/webaudio.ts` (`rampParam`, `rampFade`, `holdParam`), `screens/Pages.tsx` (`download()`), `screens/Sheets.tsx` (share copy).

| Panelist | R1 | R2 | **R3** | Summary |
|---|---|---|---|---|
| 1. Product designer (ADA bar) | 7.0 | 7.5 | **8.0** | The felt is quiet now, the stitch leads, the spec card has one button, and the Take 5 → Break over → Another 25 min arc is genuinely good. What's left is edge states: the call and disconnect copy, the 200% top area, and the empty half of the ear check. |
| 2. Accessibility and neurodiversity | 7.5 | 7.5 | **8.0** | Most round-2 items landed: Stop is pinned at 200%, the mono verdict is honest, Sensory uses the compact line, the study tags are text, and Plus has two columns. Still open: export buttons that silently do nothing, a "Copied" that can be false, the 200% top region clipping, and "Sleep" still used as a layer name in two places. |
| 3. Audio engineer | 6.5 | 5.5 | **6.5** | The noise law is fixed and every number on screen now matches the measurement to within 0.5 dB. But I found a new ship-blocker in the shared ramp code: **every fade-out and level change starts with an instant jump**, and the jump grows with how long the param has been left alone. After a real session, the "20 s fade, even in dB" is effectively a cut, and level changes click. |
| 4. Growth and product strategy | 6.5 | 7.0 | **7.5** | The price is on the page, the shared link plays, the activation moment exists, and the first tone plays in one tap. The demo is published in a sandbox that blocks downloads, so every Export button fails silently in front of the people judging it. The blind comparison, which carries the Plus pitch, can be told apart by ear. |

**Panel average: 7.5** (round 2: 6.9). Real progress. The ramp-anchoring bug (B1) is a one-line fix with an outsized effect, and it should be fixed before anyone listens to a timer end or an Evening descent.

---

## Bugs (verified)

| # | Severity | Where | Bug | Evidence |
|---|---|---|---|---|
| B1 | **Critical** | `core/src/audio/webaudio.ts` `holdParam()` (used by `rampParam` and `rampFade`, so it hits every gain and frequency glide) | On browsers that have it (Chromium, Safari/iOS WebKit), `holdParam` calls `cancelAndHoldAtTime(now)`. When `now` is after the param's last automation event, that call inserts **no** anchor event. The next `linearRamp…` / `exponentialRamp…` then starts from the *previous event's time and value*, not from now, so the gain jumps to wherever that old-to-new line already is at `now`. The fallback path (`cancelScheduledValues` + `setValueAtTime`) is correct, and that's the one the Firefox mock in the tests exercises, so the tests pass. | **Stop after 12 s:** an instant −6.7 dB step (envelope −30.8 → −35.6 → −38.3 dBFS within 0.2 s), then a 1.6 dB/s tail. **Stop after 49 s:** −30.8 → −41 → −61.7 dBFS in about 1 s, then a 0.5 dB/s whisper for 19 s. The size of the step is roughly 40 dB × (time since the fade-in ended) / (that time + 20 s), so after a 25 min timer the "20 s fade" is about a 39 dB cut. **Medium → Quiet after 12 s:** −8.6 dB inside one 10 ms window, with a single-sample discontinuity (0.0498 → 0.0196 at −24 dBFS), which is a click, then 1.2 s of glide for the last 2 dB. Full → Quiet after 40 s: second-difference spike 31× the median. **OfflineAudioContext repro:** with exp ramp to 1 at t=1, then `cancelAndHoldAtTime(3)` and exp ramp to 0.01 at t=5, the gain is already −20 dB at t=2.999. Adding `setValueAtTime(v, 3)` after the hold gives 0 dB at 3.0 and −20 dB at 4.0, which is correct. |
| B2 | **High** (published demo) | `screens/Pages.tsx:69` `download()`: This week → Export CSV / Export JSON, blind result → Export CSV, Settings → Export my data (JSON) | It creates `<a download>` and calls `.click()` with no try/catch, no fallback and no confirmation. In the sandboxed viewer the demo is published in, downloads are blocked, so the tap does **nothing visible**. That's a silent failure on the "your data is yours" promise. | `r3-expert-export-00-week-export.png` vs `-01-after-export-csv.png`: identical. |
| B3 | Medium | `screens/Sheets.tsx:471` Share → Copy text and link | `navigator.clipboard?.writeText(...).catch(() => undefined); setCopied(true)`. The button says **Copied** whether the write succeeded or not. Sandboxed iframes without `clipboard-write` reject the write, and if the API is missing nothing happens at all. | `r3-expert-sharecopy-00-copied.png` |
| B4 | Medium (validity) | Blind comparison | Arm B is noise only, and arm A is noise plus two steady 200/214 Hz tones (measured: tone −31 dBFS per ear, 11 dB above the noise). The loudness match works (A −30.9, B −30.3 dBFS RMS), but anyone can tell the arms apart by **timbre**: one has a hum and one doesn't. So the comparison isn't blind to the listener, only to the screen. | `meas.out` blind: arm A tone 200/214 Hz at −31.2 dBFS; arm B tone scan −55 dBFS (none) |
| B5 | Medium | Home at 200% root text | Stop / Start sound are pinned (fixed), but the top area still clips. While playing, the layer name ("Focus ›") is sliced by the layer's edge. At idle, "How are you arriving?" is cut to "How are you" and the chips are hidden; they can be scrolled to, but nothing shows that they're there. Ghost fragments ("1 4 H z") peek out under the hint line. "Fading out over 20" is cut at the end of a session. The indicator wraps to two centred lines beside a lone "–". | `r3-expert-bigtext-00/01/03`, `bigtext2-01` |
| B6 | Low | Headphones sheet, `disconnected`, idle | The pill says "No headphones, so noise only", but the sheet says "Headphones disconnected, **so Tuck faded out**." Nothing was playing. | `r3-expert-route-disconnected-01-sheet.png` |
| B7 | Low | Call interruption | The notice says "**Paused** for your call." but the session has ended: Home resets to "How are you arriving?" and the layer is idle. The notice's "Start sound" link duplicates the Start sound button 500 pt below. | `r3-expert-other-01-call.png` |
| B8 | Low | Naming | "Don't use **Sleep** while driving" (What we know) and "Breathing layer: Calm, Unwind and **Sleep**" (Settings). No layer called Sleep exists any more; it's Evening descent. | `r3-expert-menu-02`, `settingsfull-01` |
| B9 | Low | Settings → Schedule → Play | The select truncates to "Evening descen" at 390 px. | `r3-expert-rating-00-log-on.png` |
| B10 | Low | Beat On ↔ Off mid-session | The crossfade between beat+noise and matched noise only isn't constant-power: the level dips 2.1 dB (−30.3 → −32.4 → −30.8 dBFS) over about 3 s. It's gentle, but it's audible as a "breath" in a product built around steadiness. | `meas.out` noiseonly toggle envelope |
| B11 | Low | This week, log on but empty | Export CSV / JSON stay enabled above "Notes appear here after your next session" and export an empty file. | `r3-expert-export-00` |

---

## 1. Product designer (score 8.0)

**Round-2 must-fixes checked:**
- Felt at 20 px with the stitch as the focal object ✓ (`home-03`).
- Dead band: down from about 400 pt to about 250 pt at Medium, with one quiet "Started at 10:39 · 25 min this week" line ✓ (partial; the band is still the largest area on screen).
- Spec card: Beat On / Off as a row, one Edit a copy button, Save only for unsaved layers ✓ (`spec-00`, `sharedplay-01`).
- Share sheet hides the query ✓.
- Onboarding 1 is shorter, with the lining strip at full strength ✓.
- Ear check: the caption stays ("Playing · 200 Hz") ✓, but the bottom 45% is still empty in every state ✗.

**Loves**
- **Take 5 → Break over → Another 25 min** (`take5b-00…02`). "Five minutes off.", "Back in 5 min · At Quiet. One soft chime at the end, then it fades out.", the chip reads "Break, 5 min", and one tap brings the same timer back. That's a complete, honest loop with no new UI.
- The **noise-only spec card** (`spec-01`) has a big "Noise", then "No beat is playing. Both ears hear brown noise." and "matched to the layer's loudness". The type does the explaining.
- The **Evening descent card** is still the best screen in the app: "8 → 2 Hz", the dashed-beat and solid-level envelope, and "+60 s".
- **Blind sessions:** locked controls are visibly hatched, "Layer B · numbers hidden" holds through the end-of-session question, and the felt says "Level and motion stay fixed during the comparison."
- **Shared layer** (`sharedplay-00/02`): "Play it", then "Save Library" while it plays. That's the right primary for that moment.

**Must-fix**
1. **Call notice (B7):** say "Stopped for your call." and drop the inline "Start sound" link, because the big button already is that action. Or keep the session paused and resume it in one tap, if the native engine really pauses.
2. **Disconnected sheet while idle (B6):** "No headphones, so Tuck plays noise only. Plug in or connect to get the beat." No "faded out" when nothing was playing.
3. **Ear check, lower half:** either move the question and verdict to sit directly under the buttons, which they already do, and **raise the whole block to centre it in the free space**, or put the stitch diagram large in the middle. A first-run screen that is 45% empty reads as unfinished.
4. **Home playing, top area:** the 250 pt band between "Calm ›" and "Started at" is still dead. Anchor the started line directly under the layer name (16 pt gap), and let the layer rise a further 60 pt at Medium.
5. **Settings select truncation (B9):** let the Play select take the full row under "At" at narrow widths.

## 2. Accessibility and neurodiversity UX (score 8.0)

**Round-2 must-fixes checked:**
- 200% text: Start / Stop are pinned and the middle scrolls ✓, but the top region still clips ✗ (B5).
- Blind result is computed, with "–" until both labels have a note and a scoring rule, not data ✓ (`blind-05`).
- Mono verdict states what was observed, with "Show me where", "I've changed it, check again" and "Use noise only" ✓ (`onbmono-00`).
- Sensory felt is the compact 16 px "Ceiling: Medium. Change it in Settings." ✓ (`sensory-02`).
- Study tags are borderless "Finding:" text with a glyph ✓.
- Plus has two columns ✓.
- Naming: "Steady mode" is gone ✓, but "Sleep" is still used in two places ✗ (B8).

**Loves**
- **Plain labels during the fade-in:** "Starting. Fading in over 8 seconds." One literal sentence, and no second time statement in the felt.
- The **pinned Home** reads "Your layer is ready. Calm · 10 Hz. Pinned. It plays exactly as saved. Change it in Settings." No question and no chips.
- The **morning note** reads "Last night: Focus, 21:42, 10 min. One tap, kept on this phone. Well / OK / Poorly / Skip", and This week shows "Well" under that evening's bar. Concrete and skippable.
- **Keyboard:** Enter starts, ↑ moves to Full with a visible outline, Esc stops into the session-end line. The 2 px ring is clear on the dark wool.

**Must-fix**
1. **Silent export (B2):** a button that does nothing is the worst outcome for a literal user ("did it work? did I break it?"). Every export must end in a visible state. On success: "Saved tuck-notes.csv to Downloads." On failure, or when downloads are blocked: open a sheet with the data in a selectable text area and a **Copy** button, titled "Downloads are blocked here, so here's the file to copy." Disable Export when there's nothing to export (B11), or say "Nothing to export yet."
2. **"Copied" must be true (B3):** await `writeText`, show Copied only on success, and on failure show the text selected, with "Copy didn't work here. The text is selected; copy it yourself."
3. **200% top region (B5):** when the top content overflows, show a fade or "More ↓" cue at its bottom edge, or move the arrival chips into the layer's scroll area. Never cut the question mid-sentence. At accessibility sizes, hide the status indicator's icon and let the indicator be one left-aligned line.
4. **Naming (B8):** "Don't use Evening descent while driving" (or "any layer while driving"), and "Breathing layer: Calm, Unwind and Evening descent".
5. **Fades that jump (B1)** are an accessibility issue as much as an audio one. A sudden 8 to 30 dB drop on Stop is the kind of startle that sensory-sensitive users told us makes them delete an app. The spec card promises "even in dB", so the promise has to hold.

## 3. Audio engineer (score 6.5)

**Round-2 must-fixes checked, by measurement:**

| Check | Measured (built page, Chromium, per ear) | Verdict |
|---|---|---|
| Channel mapping | L tone peak at 200.0 Hz, R at 214.0 Hz; ear check left tone only on L (R is digital silence), right tone only on R | ✓ |
| Focus, Medium | total −30.8 dBFS RMS; tone −31.1; residual noise −42.7 / −42.2 (12 dB under the beat, as the law says); peak −23.7 | ✓ matches the spec card (−31 / −43) |
| Full / Quiet | Full: tone −24.1, noise −35.7, peak −16.6. Quiet: tone −40.9, noise −51.9 | ✓ 17 dB range, at least 16 dB of headroom |
| Noise only, matched | −30.2 / −30.3 dBFS (layer it replaces: −30.8); no tone (scan −54 dBFS) | ✓ within 0.6 dB |
| Speaker route / disconnected | −30.2 / −30.4 dBFS, noise only, no tone | ✓ (round 2: −67) |
| Blind arms | A (beat): −30.9; B (noise only): −30.3 dBFS RMS; Level stays at Medium for both | ✓ matched, but see B4 |
| Evening descent at 15 s | L 136.0 / R 143.75 Hz (7.75 Hz, falling from 8), carrier about 140 | ✓ |
| Ear check | −27.5 dBFS RMS (peak −24.0), 4 dB above the Medium layer | ✓ acceptable for a lone tone |
| Fade-in | dB-linear: −69 → −31 dBFS in 2.5 dB per 0.5 s steps over 8 s, no step at the start | ✓ |
| **Fade-out** | **instant step of −6.7 dB after 12 s and about −27 dB after 49 s, then a slow tail** | ✗ **B1** |
| **Level change** | **−8.6 dB in under 10 ms (sample discontinuity), then glide** | ✗ **B1** |
| Layer switch (frequency glide) | no envelope change (±0.2 dB), worst second difference 6× the median during the 4 s glide: clean | ✓ |

**Loves**
- **The noise law is now right and honest end to end.** One linear law in core, one RMS-normalised buffer per colour, a matched noise-only gain, and every label on screen (spec card, editor, noise-only card) agrees with my independent measurement to within 0.5 dB. That's rare.
- The **speaker / mono / disconnected fallback** went from silence (−67 dBFS) to a matched −30 dBFS bed. The biggest first-session failure from round 2 is gone.
- The **fade-in** is a textbook dB-linear ramp with a short linear edge from zero.
- **Frequency glides** between layers are clean.
- The **chime** uses exponential decay to −62 dB before `stop()`, so there's no click.

**Must-fix**
1. **B1, the ramp anchor. Fix in core, today.** In `holdParam`, after `param.cancelAndHoldAtTime(time)`, always call `param.setValueAtTime(v, time)` with the tracked value. `cancelAndHoldAtTime` only inserts a hold when it cuts through an active event; it inserts nothing once the last event has finished. Then:
   - **Add a regression test that models the spec**: the mock's `linearRampToValueAtTime` / `exponentialRampToValueAtTime` must interpolate from the *previous event's* time and value, and `cancelAndHoldAtTime` must not add an event past the last one. Today's mock hides the bug.
   - Add a Playwright `OfflineAudioContext` test: start, hold 60 s, stop with a 20 s fade, and assert the gain at stop+0.05 s is within 0.5 dB of the gain before it, and at stop+10 s about −20 dB.
   - Re-measure Take 5's drop to Quiet, the Cycles break, the timer end and Evening descent's 60 s fade after 30+ minutes. All of them go through `rampParam` / `rampFade`.
   - Check the native engines too: Swift and Kotlin don't use Web Audio, but if they ported "ramp from the last scheduled value" logic, the same bug follows.
2. **B4, make the blind comparison blind to the ear.** The control arm should be a **sham**: the same carrier in both ears (for example 207 / 207 Hz, a 0 Hz beat) at the same tone level, plus the same noise. The arms then sound the same and differ only in the beat. The setup copy changes to "One has the beat; the other plays the same tones with no beat." This is also the more defensible scientific control.
3. **B10:** use an equal-power crossfade (or one matched in loudness, not amplitude) for Beat On ↔ Off, so the level doesn't dip 2 dB.
4. **Verify the mid-session swap dip.** Setting `headphone: 'swapped'` mid-session through `__tuck.ui.set` produced no measurable dip or rewire in my capture, so I couldn't confirm the 25/25 ms dip claimed in round-2-response. Either the route change isn't applied until the next session (say so), or `setSwap` isn't reached. Once B1 is fixed, its `rampParam(routerIn.gain, 0, t, 0.025)` will need re-checking too: with no prior events on `routerIn.gain`, the ramp currently runs from t=0.

## 4. Growth and product strategy (score 7.5)

**Round-2 must-fixes checked:**
- Noise fixed before external tests ✓ (measured).
- Shared landing plays the layer, Save afterwards ✓.
- Plus has a price (£24.99/yr, £3.49/mo, 7 days free, a reminder 3 days before, "the price is a proposal"), a Free / Plus table and start recipes ✓.
- Activation is defined and marked once ("Stayed under your audio for 10 min") ✓.
- One tap to first sound ✓: "Check my headphones" plays the left tone immediately.

**Loves**
- The **activation line** in the indicator is exactly the right size: one sentence, once, in the place that already talks about your audio.
- **"Start it without opening Tuck"** appears at every session end. It's the retention mechanic for the ADHD core, and it never nags.
- **Plus** now reads as a fair deal: the layer stays free, and you pay for depth (more schedules, recipes, sync, the long comparison). "Your own evidence" is a differentiated hero no competitor can copy quickly.
- **"Same as last time?"** for returning users cuts the daily start to one tap.

**Must-fix**
1. **B2 in the published demo:** stakeholders open the artifact, tap Export CSV to see "your data is yours", and nothing happens. Detect the blocked download and fall back to a copyable sheet, or route exports through the viewer's file-save capability. Treat "nothing happened" as a release blocker for any demo build.
2. **B4 undermines the Plus hero.** "Your own evidence" is only evidence if the comparison holds up to a sceptic. Hannah-type users will notice the hum in one arm. Ship the sham arm before the comparison is marketed.
3. **B1 before any listening test.** The first thing a tester notices at a timer end is a thud instead of a 20 s fade, and that undoes the "calm, never startles" positioning.
4. **Share loop:** the share card copies, but the recipient lands on "Someone shared a layer. Library". Add the sharer's optional one-word note ("for reading") as the only personal field. It's opt-in and keeps the numbers-only privacy line, and a share with context converts better than a bare layer.
5. **Instrument the funnel in the prototype spec:** ear check started / passed / skipped, first sound in ≤10 s, the activation moment, the D1 "Same as last time?" tap. Without these the round-4 changes can't be judged.

---

## Round-2 expert items: status

| Round-2 item | Status in round 3 |
|---|---|
| B1 noise gain law | **Fixed** (measured −42.7 noise under −31.1 tone; noise only −30.2) |
| B2 hard-coded blind taps | **Fixed** |
| B3 blind arms unmatched / controls live | **Fixed** for loudness and locks; arms still distinguishable by timbre (new B4) |
| B4 shared card doesn't drive the layer | **Fixed** |
| B5 200% text clips Stop | **Partly fixed**: Stop is pinned; the top region still clips (new B5) |
| B6 Plus contradiction | **Fixed** |
| B7 mono verdict cause | **Fixed** |
| B8 Cycles "5 off" | **Fixed** ("Cycles: 25 min, then 5 at Quiet", radio marks) |
| B9 "Tucking in…" at 25 min | **Fixed** ("With you for 25 min · Round 1 of 4 · break, back to Medium after 5 min") |
| B10 disconnected idle | **Fixed** (pill while idle, noise only measured), but the sheet copy is wrong (new B6) |
| B11 editor dB | **Fixed** ("25% · −12 dB re the beat", "At Medium: beat −31 dBFS, noise −43 dBFS", which matches the measurement) |
| B12 explainer for returning users | **Fixed** |
| B13 raw link | **Fixed** |
| Swap pill / swap crossfade | Pill dropped ✓; the crossfade couldn't be verified (see audio must-fix 4) |
| `ensureRunning` 2 s statechange | **Fixed** (code) |
