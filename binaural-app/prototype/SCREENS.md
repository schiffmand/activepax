# Tuck prototype: how to reach every screen

Build once, then point `tools/shoot.mjs` at the single-file build (it works from `file://`):

```bash
cd binaural-app/prototype && npm install && npm run build
cd .. && U="file://$PWD/prototype/dist/index.html"
node tools/shoot.mjs "$U?screen=home&hour=10" .shots/home     # writes .shots/home-0.png …
```

To re-capture every screen below in one go: `node tools/shoot-all.mjs` (writes `docs/screens/<nn>-<name>.png`).

Every run starts with fresh storage, so it opens on onboarding. URL parameters:

| Parameter | Effect |
|---|---|
| `?screen=home` | Skip onboarding and land on the first-run Home. |
| `?hour=14` | Pretend the local hour is 14:00. Use it for screenshots that shouldn't depend on the real clock: from 21:00 (and from 18:00 with Sleep) the app turns to warm Dim wool, and between 00:00 and 04:00 the greeting reads "Tuck". |
| `?reset=1` | Clear saved data. |
| `?debug=1` | Expose `window.__tuck` (`session`, `store`, `ui`) for scripted states, e.g. `__tuck.ui.set({ headphone: 'speaker' })`. |
| `?layer=10,180,pink,30,hold,1,Library` | Open a shared layer card (beat, carrier, noise, noise %, motion, beat on, name). |

Each extra argument to `shoot.mjs` is a CSS selector it clicks, taking a screenshot after each click (`-1.png`, `-2.png` …). It waits 700 ms after each click, so fades and timers are caught mid-way: the layer rises over 1.4 s and the sound fades in over 8 s. Flows that need longer waits (ear-check verdicts, the 20 s fade-out, Take 5) need a Playwright script with waits; the `wait` column says how long.

All navigation controls carry a stable `data-testid`. Below, `[t=x]` is short for `[data-testid=x]`. Type it in full on the command line, for example `'[data-testid=start]'`. `$H` is `$U?screen=home&hour=10`.

## Onboarding

| Screen | URL | Click sequence |
|---|---|---|
| Onboarding 1: "Your audio stays on top.", one line on what Background Sounds doesn't do, the two-band diagram | `$U` | none |
| Ear check: the left tone plays straight away (one tap to first sound); the caption reads "Playing · 200 Hz" | `$U` | `[t=onboard-check]`, wait 1.5 s |
| Ear check, left tone playing (left stitch half lit). The tone is about −24 dBFS | `$U` | `[t=onboard-check]` `[t=ear-play-left]` |
| "Where did you hear it?" | `$U` | `[t=onboard-check]` `[t=ear-play-left]`, wait 2 s |
| Neither on the left: guidance and "Play it a little louder" (about −19 dBFS) | `$U` | as above, then `[t=ear-answer-none]` |
| Stereo confirmed | `$U` | `[t=ear-play-left]` (wait 2 s) `[t=ear-answer-left]` `[t=ear-play-right]` (wait 2 s) `[t=ear-answer-right]` |
| Verdicts: "Both tones came through both ears" (Mono, Spatial or the speaker; Show me where · I've changed it, check again · Use noise only), Swapped | `$U` | answering `[t=ear-answer-both]` twice, or `[t=ear-answer-right]` then `[t=ear-answer-left]` |
| Skip, noise only (Home says "That's Focus, as noise only…") | `$U` | `[t=onboard-skip]` |

A passing ear check clears an earlier swap; a swapped verdict sets it, and the readout then shows a swap mark.

## Home and the layer

| Screen | URL | Click sequence |
|---|---|---|
| Home, first run (Scattered preselected; the "phone doesn't tell apps" note now appears after the first session, once) | `$H` | none |
| A chip picked, with the "It isn't a treatment." line | `$H` | `[t=chip-wound-up]` |
| Playing: "Tucking in…", the first-play "isn't a treatment" line under the time in the felt (cleared on Stop) | `$H` | `[t=start]` |
| Playing: the stitch is the focal object, the time with you is 20 px under it; the top shows the status, the layer name and "Started at 10:02 · 1 h this week" | `$H` | `[t=start]`, wait 9 s |
| Playing: level Full / Quiet (the felt shows less at Quiet) | `$H` | `[t=start]` `[t=level-full]` or `[t=level-quiet]` |
| Playing: Hold / Vary (Vary says in the felt that it applies from the next session) | `$H` | `[t=start]` `[t=motion-hold]` or `[t=motion-vary]` |
| Spec card (the layer flips): Beat On / Off row, Level and noise in dBFS with a true minus, one Edit a copy button | `$H` | `[t=readout]` |
| Spec card, noise only (matched to the layer's loudness) | `$H` | `[t=readout]` `[t=spec-beat-off]` |
| Session end ("Set down after under a minute.") and the one-time "Start it without opening Tuck" | `$H` | `[t=start]` `[t=stop]` |
| Layer picker (Long focus with its honest line) | `$H` | `[t=layer-name]` (while playing) |
| Timer sheet, with Cycles | `$H` | `[t=timer-chip]` |
| Cycles running (Round 1 of 4), then a break at Quiet (status "Five minutes off.") | `$H` | `[t=timer-chip]` `[t=timer-cycles]` `[t=start]`, then Menu → Prototype controls → `[t=demo-skip]`, wait 4 s |
| Timer end with Take 5 (time-lapse) | `$H` | `[t=timer-chip]` `[t=timer-25]` `[t=start]` `[t=nav-menu]` `[t=menu-demo]` `[t=demo-skip]` `[t=sheet-close]`, wait 25 s |
| Take 5: "Five minutes off.", felt "Back in 5 min", timer chip "Break, 5 min" | `$H` | as above, then `[t=take-five]` |
| Break over, with "Another 25 min" (one tap restarts the same timer) | `$H` | during Take 5: Prototype controls → `[t=demo-skip]`, close, wait 6 s; then `[t=another-round]` |
| "Same as last time?" (returning) | `$H` | `[t=nav-menu]` `[t=menu-demo]` `[t=demo-week]` `[t=sheet-close]` |
| "Arriving differently?" (the current layer's chip is selected) | `$H` | as above, then `[t=arriving-differently]` |
| Five-intent row ("Ask how I'm arriving" off) | `$H` | `[t=nav-menu]` `[t=menu-settings]` `[t=set-ask]` `[t=page-back]` |
| Pinned layer | `$H` | `[t=nav-menu]` `[t=menu-settings]`, choose a layer in `select[data-testid=set-pin]`, `[t=page-back]` |
| Evening (warm Dim wool, outline button), Heavy-eyed → Evening descent, "Ends after 45 min" | `$U?screen=home&hour=21` | `[t=chip-heavy-eyed]`, then `[t=readout]` for the descent drawn on the envelope |
| Shared layer: the layer *is* the shared one (readout 10 Hz · L 175 / R 185, spec card "shared with you, not saved"), the button says Play it, Save it is offered before and while it plays | `$U?hour=10&layer=10,180,pink,30,hold,1,Library` | none; then `[t=start]`, `[t=shared-save-playing]` |
| Share sheet | `$H` | `[t=readout]` `[t=spec-share]` |
| Start without opening Tuck | `$H` | `[t=nav-menu]` `[t=menu-anywhere]` |

Headphone routes show as one-line pills above the status line; the pill opens the Headphones sheet with the full sentence and its fix. With `?debug=1`: `__tuck.ui.set({ headphone: 'speaker' })` (also `oneEar`, `callMode`, `mono`, `spatial`, `disconnected`), then `[t=banner-<route>]` for the sheet. `disconnected` shows its pill while idle too ("No headphones, so noise only") and Start plays noise only. `swapped` has no pill (the swap is silent): the readout carries a swap mark and the spec card an Ears row.

Toasts never cover text: they appear in the layer's felt, in place of the focal line, and opening a sheet or page dismisses them.

## Editing and saving

| Screen | URL | Click sequence |
|---|---|---|
| Edit a copy (opaque header, Save in a fixed footer, the Hz range and step) | `$H` | `[t=readout]` `[t=spec-edit]` |
| Editor, advanced (scroll: the title moves into the header) | `$H` | `[t=readout]` `[t=spec-edit]` `[t=editor-more]`, then scroll |
| Save sheet ("Play this when I pick Too much" off, with what it plays now) | `$H` | `[t=readout]` `[t=spec-edit]` `[t=editor-save]` |
| Saved (the toast in the felt) | `$H` | the three clicks above, then `[t=save-confirm]` |
| Saved layer's spec card (Edit a copy; Delete is a text link) and the delete sheet | `$H` | after saving, `[t=readout]`, then `[t=spec-delete]` |

## Menu pages

| Screen | URL | Click sequence |
|---|---|---|
| Menu sheet | `$H` | `[t=nav-menu]` |
| Settings (pin, schedule with an unclipped time field, private log, free Save sessions to Health, Reduce Motion / Transparency status) | `$H` | `[t=nav-menu]` `[t=menu-settings]` |
| Sensory mode on (no greeting line; plain 20 px status with the one time statement; the felt uses the compact 16 px line; hatched Full with "Ceiling: Medium. Change it in Settings.") | `$H` | `[t=nav-menu]` `[t=menu-settings]` `[t=set-sensory]` `[t=page-back]` `[t=start]` |
| What we know (last-reviewed date; carrier explained) | `$H` | `[t=nav-menu]` `[t=menu-science]` |
| What we know, from the spec card (lands on the matching paragraph) | `$H` | `[t=readout]` `[t=spec-science]` |
| The studies (6), with DOI links and borderless "Finding:" tags (word plus glyph) | `$H` | `[t=nav-menu]` `[t=menu-science]` `[t=science-studies]` |
| Blind comparison: setup ("loudness-matched, at Medium, held still"), running (averages show "–" until both labels have a note; a scoring line, not data), result | `$H` | `[t=nav-menu]` `[t=menu-blind]`, then `[t=blind-start]`, `[t=blind-play]`; `[t=blind-reveal]` for the result |
| Blind comparison, idle Home: readout "Blind comparison · Focus", neutral stitch; playing: Level and Motion locked | `$H` | after `[t=blind-start]`: `[t=page-back]`; then `[t=blind-play]` from the page |
| A blind session's end ("How was layer B?"; the readout stays "Layer B · numbers hidden") | `$H` | after `[t=blind-play]`: Prototype controls → `[t=demo-skip]`, `[t=sheet-close]`, `[t=stop]` |
| How Tuck plays under your audio | `$H` | `[t=nav-menu]` `[t=menu-mixing]` (also `[t=audio-indicator]`) |
| This week (empty, with the private-log offer) | `$H` | `[t=nav-menu]` `[t=menu-week]` |
| This week (sample data, labelled on the page) | `$H` | `[t=nav-menu]` `[t=menu-demo]` `[t=demo-week]` `[t=sheet-close]` `[t=nav-menu]` `[t=menu-week]` |
| Session rating ("How was that?") | `$H` | Settings → `[t=set-log]`, back, `[t=start]`, Prototype controls → `[t=demo-skip]`, close, `[t=stop]` |
| Morning sleep note ("Last night: Focus, 21:04, 10 min.") | `$U?screen=home&hour=21` | log on, play and stop a session (as above), wait for the fade, then Prototype controls → `[t=demo-morning]` |
| This week with the sleep note under that evening's bar | as above | `[t=sleep-3]`, then `[t=nav-menu]` `[t=menu-week]` |
| Lock Screen: idle widget (Start), playing ("Playing, no timer") | `$H` | `[t=nav-menu]` `[t=menu-lock]`, then `[t=lock-start]` |
| Tuck Plus (price and trial, a Free / Plus table, your own evidence) | `$H` | `[t=nav-menu]` `[t=menu-plus]` |
| Ear check from the Menu | `$H` | `[t=nav-menu]` `[t=menu-earcheck]` |

## Simulations (Prototype controls)

On a phone-sized viewport these are in Menu → Prototype controls (`[t=nav-menu]` `[t=menu-demo]`). At 720 px and wider they sit beside the device frame, always visible. The sheet and the side panel use the same test ids, so with both on screen, scope the selector to the sheet: `[data-testid=sheet-demo] [data-testid=…]`.

| What | Control |
|---|---|
| Another app playing above Tuck (generated music, or the browser's speech voice) | `[t=other-toggle]`; the Home indicator changes to "Your audio keeps playing above", and the Lock Screen shows its player. Play a session under it for 10 minutes (Skip ahead counts) and the indicator marks the activation moment once: "Stayed under your audio for 10 min" |
| Tuck's level under it | `[t=demo-level-quiet]` / `-medium` / `-full` |
| Headphone route: speaker, one earbud, call mode, Mono, Spatial, swapped, disconnected | `<select data-testid=demo-headphone>`: use `page.selectOption`, it can't be clicked |
| Skip ahead (to just before the timer's fade, the next cycle change, or Take 5's chime) | `[t=demo-skip]` |
| Make it 21:00 / 07:00 (the status-bar and Lock Screen clocks follow, as they do for `?hour=`) | `[t=demo-evening]` / `[t=demo-morning]` |
| Run the daily schedule now | `[t=demo-schedule]` |
| Phone call / another app takes over | `[t=demo-call]` / `[t=demo-takeover]`, while playing |
| Sample week (labelled as sample data) | `[t=demo-week]` |
| Start over | `[t=demo-reset]` |

## Keyboard

Tab moves through every control, with a visible 2 px focus ring. On Home, **Enter** starts sound, **Esc** stops it, and **↑ / ↓** change the level (the selected segment carries a 2 px outline, so the change is visible). The grab handle is a focusable slider, with ↑ / ↓ to change the level and Enter to start. Sheets and pages close with **Esc**.

## Large text

Dynamic Type is approximated by raising the root font size (all text is in rem): `page.addStyleTag({ content: 'html{font-size:200% !important}' })`. The layer grows to fit its controls, its middle (felt, readout, Level, Motion) scrolls when the screen runs out, and Start sound / Stop stay pinned above the safe area. Segmented controls wrap instead of truncating.
