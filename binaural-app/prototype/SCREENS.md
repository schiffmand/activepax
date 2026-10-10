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
| `?hour=14` | Pretend the local hour is 14:00. Use it for screenshots that shouldn't depend on the real clock: from 21:00 (and from 18:00 with Sleep) the app turns to warm Dim wool, and between 00:00 and 04:00 there is no greeting line at all. |
| `?reset=1` | Clear saved data. |
| `?debug=1` | Expose `window.__tuck` (`session`, `store`, `ui`, `setBeat`) for scripted states, e.g. `__tuck.ui.set({ headphone: 'speaker' })`. For audio checks use `__tuck.setBeat(false)` (it flips the layer as the spec card's Beat switch does); `__tuck.session.setBinaural()` alone is undone by Home, which follows the selected layer. `__tuck.session.clock.skip(ms)` time-lapses a session. |
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
| Home, first run (Scattered preselected in the day; from 21:00 Heavy-eyed / Evening descent, or the layer you last started in the evening; the "phone doesn't tell apps" note now appears after the first session, once) | `$H` | none |
| A chip picked, with the "It isn't a treatment." line | `$H` | `[t=chip-wound-up]` |
| Playing: "Tucking in…", the first-play "isn't a treatment" line under the time in the felt (cleared on Stop) | `$H` | `[t=start]` |
| Playing: the stitch is the focal object, the time with you is 20 px under it; the top shows the status, the layer name and, right under it, the glance line: "Started at 10:02 · ends at 10:27" when the session has an end (a timer, Cycles, Evening descent), else "· 1 h this week", else "· fades out when you stop". The layer sits higher (Medium 530 pt) | `$H` | `[t=start]`, wait 9 s |
| Playing: level Full / Quiet (the felt shows less at Quiet). At Full the top stays readable at default text: the layer rests no higher than leaves the status, the name and the glance line in view (`61-playing-full`); no More cue at default sizes | `$H` | `[t=start]` `[t=level-full]` or `[t=level-quiet]` |
| Playing with a headphone pill (one earbud, Mono, Spatial): the layer gives the pill room, the glance line stays visible (`62-playing-one-earbud`) | `$H&debug=1` | `[t=start]`, then `__tuck.ui.set({ headphone: 'oneEar' })` |
| Playing: Hold / Vary (Vary says in the felt that it applies from the next session) | `$H` | `[t=start]` `[t=motion-hold]` or `[t=motion-vary]` |
| Spec card (the layer flips): Beat On / Off row, Level and noise in dBFS with a true minus, one Edit a copy button | `$H` | `[t=readout]` |
| Spec card, noise only (matched to the layer's loudness) | `$H` | `[t=readout]` `[t=spec-beat-off]` |
| Session end ("Set down after under a minute.") and "Start it without opening Tuck", shown until it's tapped or Done is tapped once | `$H` | `[t=start]` `[t=stop]` |
| Layer picker (Long focus with its honest line) | `$H` | `[t=layer-name]` (while playing) |
| Timer sheet, with Cycles | `$H` | `[t=timer-chip]` |
| Cycles running: the glance line says when it ends ("Started at 10:57 · ends at 12:52": four rounds and three breaks, `63-cycles-running`); the felt says "Round 1 of 4 · break at Quiet after 25 min". Then a break at Quiet (status "Five minutes off.") | `$H` | `[t=timer-chip]` `[t=timer-cycles]` `[t=start]`, then Menu → Prototype controls → `[t=demo-skip]`, wait 4 s |
| Timer end with Take 5 (time-lapse) | `$H` | `[t=timer-chip]` `[t=timer-25]` `[t=start]` `[t=nav-menu]` `[t=menu-demo]` `[t=demo-skip]` `[t=sheet-close]`, wait 25 s |
| Take 5: "Five minutes off.", felt "5 min at Quiet" with "A soft chime, then it fades and asks if you want another round.", timer chip "Break, 5 min" | `$H` | as above, then `[t=take-five]` |
| Break over, with "Another 25 min" (one tap restarts the same timer) | `$H` | during Take 5: Prototype controls → `[t=demo-skip]`, close, wait 6 s; then `[t=another-round]` |
| "Same as last time?" (returning) | `$H` | `[t=nav-menu]` `[t=menu-demo]` `[t=demo-week]` `[t=sheet-close]` |
| "Arriving differently?" (the current layer's chip is selected) | `$H` | as above, then `[t=arriving-differently]` |
| Five-intent row ("Ask how I'm arriving" off) | `$H` | `[t=nav-menu]` `[t=menu-settings]` `[t=set-ask]` `[t=page-back]` |
| Pinned layer | `$H` | `[t=nav-menu]` `[t=menu-settings]`, choose a layer in `select[data-testid=set-pin]`, `[t=page-back]` |
| Evening (warm Dim wool, outline button), Heavy-eyed → Evening descent, "Ends after 45 min" | `$U?screen=home&hour=21` | `[t=chip-heavy-eyed]`, then `[t=readout]` for the descent drawn on the envelope |
| Evening descent playing: the readout follows the journey and stays self-consistent (R − L = the beat shown, e.g. "6.5 Hz · L 132.6 / R 139.1"); back to "8 Hz · L 136 / R 144" when idle (`66-evening-descent-playing`) | `$U?screen=home&hour=21&debug=1` | `[t=chip-heavy-eyed]` `[t=start]`, then `__tuck.session.clock.skip(600000)` |
| Shared layer: the layer *is* the shared one (readout 10 Hz · L 175 / R 185, spec card "shared with you, not saved"), the button says Play it, Save it is offered before and while it plays | `$U?hour=10&layer=10,180,pink,30,hold,1,Library` | none; then `[t=start]`, `[t=shared-save-playing]`. A recipient on their first visit (no ear check yet) sees, after a minute of sound, "The beat needs stereo headphones, one tone in each ear." with "Stop and check my headphones" (`68-shared-recipient-check`; time-lapse with `&debug=1` and `__tuck.session.clock.skip(65000)`) |
| Share sheet: optional "A word for them" (`[t=share-note]`, at most 24 characters, sent as `&note=`); **Copied** only when the copy really happened, else "Copy didn't work here" with the text selected (`[t=share-fallback]`) | `$H` | `[t=readout]` `[t=spec-share]`, then `[t=share-copy]` |
| Shared layer with the sharer's word: "Someone shared a layer, “for reading”." | `$U?hour=10&layer=10,180,pink,30,hold,1,Library&note=for%20reading` | none |
| Start without opening Tuck | `$H` | `[t=nav-menu]` `[t=menu-anywhere]` |

Headphone routes show as one-line pills above the status line; the pill opens the Headphones sheet with the full sentence and its fix. With `?debug=1`: `__tuck.ui.set({ headphone: 'speaker' })` (also `oneEar`, `callMode`, `mono`, `spatial`, `disconnected`), then `[t=banner-<route>]` for the sheet. `disconnected` shows its pill while idle too ("No headphones, so noise only"); its sheet says "No headphones connected, so Start plays noise only." while idle. A disconnect mid-session fades out over 1.5 s and Home itself says "Headphones disconnected, so Tuck faded out. Start plays noise only until they're back." in place of the pill (`64-disconnected-mid-session`); it goes when headphones return. Start plays noise only. A phone call ends the session with "Stopped for your call. Start sound when you're done." (no inline Start link: the big button is the action). The swap now follows the route mid-session too (50 ms dip). `swapped` has no pill (the swap is silent): the readout carries a swap mark and the spec card an Ears row.

Toasts never cover text: they appear in the layer's felt, in place of the focal line, and opening a sheet or page dismisses them.

## Editing and saving

| Screen | URL | Click sequence |
|---|---|---|
| Edit a copy (opaque header, Save in a fixed footer, the Hz range and step) | `$H` | `[t=readout]` `[t=spec-edit]` |
| Editor, out-of-range beat (99 Hz): the range error, and "L and R show once the beat is in range." instead of derived ear values (`67-editor-invalid-beat`) | `$H` | `[t=readout]` `[t=spec-edit]`, then fill `[t=editor-beat]` with 99 |
| Editor, advanced (scroll: the title moves into the header) | `$H` | `[t=readout]` `[t=spec-edit]` `[t=editor-more]`, then scroll |
| Save sheet ("Play this when I pick Too much" off, with what it plays now) | `$H` | `[t=readout]` `[t=spec-edit]` `[t=editor-save]` |
| Saved (the toast in the felt) | `$H` | the three clicks above, then `[t=save-confirm]` |
| Saved layer's spec card (Edit a copy; Delete is a text link) and the delete sheet | `$H` | after saving, `[t=readout]`, then `[t=spec-delete]` |

## Menu pages

| Screen | URL | Click sequence |
|---|---|---|
| Menu sheet | `$H` | `[t=nav-menu]` |
| Settings (pin, schedule with the time and a full-width Play menu, "Evening descent" in full; private log, free Save sessions to Health, Reduce Motion / Transparency status) | `$H` | `[t=nav-menu]` `[t=menu-settings]` |
| Sensory mode on (no greeting line; plain 20 px status with the one time statement; the felt uses the compact 16 px line; hatched Full with "Ceiling: Medium. Change it in Settings.") | `$H` | `[t=nav-menu]` `[t=menu-settings]` `[t=set-sensory]` `[t=page-back]` `[t=start]` |
| What we know (last-reviewed date; carrier explained) | `$H` | `[t=nav-menu]` `[t=menu-science]` |
| What we know, from the spec card (lands on the matching paragraph) | `$H` | `[t=readout]` `[t=spec-science]` |
| The studies (6), with DOI links and borderless "Finding:" tags (word plus glyph) | `$H` | `[t=nav-menu]` `[t=menu-science]` `[t=science-studies]` |
| Blind comparison: setup ("One has the beat. The other plays the same tones and noise with no beat: they're built to sound alike": the control arm is a sham, the same carrier in both ears at the same level), running (averages show "–" until both labels have a note; a scoring line, not data), result. After the reveal, Export CSV fills `arm` (beat / no beat) and `beat_hz` (14 / 0) (`71-blind-export-revealed`) | `$H` | `[t=nav-menu]` `[t=menu-blind]`, then `[t=blind-start]`, `[t=blind-play]`; `[t=blind-reveal]` for the result |
| Blind comparison, idle Home: readout "Blind comparison · Focus", neutral stitch; playing: Level and Motion locked | `$H` | after `[t=blind-start]`: `[t=page-back]`; then `[t=blind-play]` from the page |
| A blind session's end ("How was layer B?"; the readout stays "Layer B · numbers hidden") | `$H` | after `[t=blind-play]`: Prototype controls → `[t=demo-skip]`, `[t=sheet-close]`, `[t=stop]` |
| How Tuck plays under your audio | `$H` | `[t=nav-menu]` `[t=menu-mixing]` (also `[t=audio-indicator]`) |
| This week (empty, with the private-log offer) | `$H` | `[t=nav-menu]` `[t=menu-week]` |
| This week with notes: below 5 notes per group the counts, not words ("With the beat: 2 notes: 1 good, 1 same as usual"); Export CSV / JSON appear only once there's a note ("Nothing to export yet" before) |
| Export (This week Export CSV / JSON, Settings Export my data `[t=set-export]`, blind result `[t=blind-export]`): a sheet with the file in a selectable monospace field and **Copy all**. In a frame (the published viewer) it says "This viewer can't save files, so here is tuck-notes.csv to copy." and offers "Try saving it as a file anyway"; outside a frame the download starts and the sheet says it was sent | `$H` | as below with a note, then `[t=export-csv]`, `[t=export-copy]` |
| This week (sample data, labelled on the page) | `$H` | `[t=nav-menu]` `[t=menu-demo]` `[t=demo-week]` `[t=sheet-close]` `[t=nav-menu]` `[t=menu-week]` |
| Session rating ("How was that?") | `$H` | Settings → `[t=set-log]`, back, `[t=start]`, Prototype controls → `[t=demo-skip]`, close, `[t=stop]` |
| Morning sleep note ("Last night: Evening descent, 21:04, 43 min."). Minutes are counted one way everywhere: listening time up to Stop or the timer's fade, rounded down (the fade-out is reported in seconds) | `$U?screen=home&hour=21` | log on, play and stop a session (as above), wait for the fade, then Prototype controls → `[t=demo-morning]` |
| This week with the sleep note under that evening's bar, the same minutes as the morning note, and "1 sleep note, the morning after an evening session." under Your notes (no "0 noted sessions") (`70-this-week-sleep-note`) | as above | `[t=sleep-3]`, then `[t=nav-menu]` `[t=menu-week]` |
| Lock Screen: idle widget (Start), playing ("Playing, no timer") | `$H` | `[t=nav-menu]` `[t=menu-lock]`, then `[t=lock-start]` |
| Tuck Plus (price and trial, a Free / Plus table that says how sync works: your own iCloud or Google account, end-to-end encrypted, off until you turn it on; your own evidence) | `$H` | `[t=nav-menu]` `[t=menu-plus]` |
| Ear check from the Menu (Close top left; no "Skip": a set-up user is offered "Use noise only" only after a verdict that isn't OK) | `$H` | `[t=nav-menu]` `[t=menu-earcheck]` |

## Simulations (Prototype controls)

On a phone-sized viewport these are in Menu → Prototype controls (`[t=nav-menu]` `[t=menu-demo]`). At 720 px and wider they sit beside the device frame, always visible. The sheet and the side panel use the same test ids, so with both on screen, scope the selector to the sheet: `[data-testid=sheet-demo] [data-testid=…]`.

| What | Control |
|---|---|
| Another app playing above Tuck (generated music, or the browser's speech voice) | `[t=other-toggle]`; the Home indicator changes to "Your audio keeps playing above", and the Lock Screen shows its player. Play a session under it for 10 minutes (Skip ahead counts) and the indicator marks the activation moment once: "Stayed under your audio for 10 min" |
| Tuck's level under it | `[t=demo-level-quiet]` / `-medium` / `-full` |
| Show the activation moment: starts a session and the other app, and shows "Stayed under your audio for 10 min" for this session in about 5 s (`69-activation-moment`; the real first-activation date isn't written) | `[t=demo-activation]` |
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

Dynamic Type is approximated by raising the root font size (all text is in rem): `page.addStyleTag({ content: 'html{font-size:200% !important}' })`. The layer grows to fit its controls, its middle (felt, readout, Level, Motion) scrolls when the screen runs out, and Start sound / Stop stay pinned above the safe area. Segmented controls wrap instead of truncating. At these sizes the top indicator drops its icon and stays one line (capped at 22 px), the greeting is left out so the question stays in view, the idle layer shows the readout instead of the pull hint, the spec card opens below the top bar, Home's headings cap at 48 px (status lines at 38 px) so the question is never cut mid-word, and body text scales in full. When the top content runs under the layer, a **More** button (`[t=home-more]`) sits in its own reserved row below the text, never on it, and scrolls it (`65-large-text-session-end`, `72-large-text-idle-more`); it goes while a sheet or the spec card is open. The session-end "Start it without opening Tuck" suggestion waits for a default-size session (it's in the Menu too). At default text sizes the More cue never appears. Each ear's value stays with its label on the spec card ("R 214 Hz" never wraps apart).

## Sandboxed viewer

`tools/shoot-all.mjs` runs screens whose URL starts with `framed:` inside an `<iframe sandbox="allow-scripts allow-same-origin">` (no `allow-downloads`), like the published viewer: `55-export-sandboxed`, `56-export-copied`, `57-share-copy-failed` (clipboard refused), `71-blind-export-revealed`. After Copy all, "Try saving it as a file anyway" resets the button to "Copy all" under its new status. Exported times use the app's clock (the one `?hour=` shifts), with an ISO `started_at` column carrying the UTC offset; This week's CSV includes sleep notes as rows.

## Desktop

At 1180 px and wider, Prototype controls sit beside the phone; when they're taller than the window, a sticky "More controls below ↓" (`[t=controls-more]`) shows at the panel's bottom edge (`60-desktop-frame`).
