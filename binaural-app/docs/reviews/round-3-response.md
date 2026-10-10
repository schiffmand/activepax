# Round 3: response and changes

**Date:** 10 Oct 2026 · **Build:** `prototype/dist/index.html` (single file, 834 kB, `npm run build` clean) · **Core:** 181 tests passing (174 before: 5 ramp-anchor regressions in `fade.test.ts`, 2 sham-beat tests in `engine.test.ts`), typecheck clean · **Browser check:** `node tools/ramp-check.mjs` (new, 7 checks in Chromium's `OfflineAudioContext`)
**Inputs:** `round-3-council.md` (six personas, mean 8.1, min 8.0) and `round-3-experts.md` (four experts, mean 7.5; audio 6.5). Combined: average 7.85, minimum 6.5. Target for round 4: average ≥ 8.7, every reviewer ≥ 8.
**Method:** every bug in both reviews was reproduced, then fixed, and every must-fix was built or decided against below. All 60 screens in `docs/screens/` were re-captured with `tools/shoot-all.mjs` (14 new ones, three inside an `<iframe sandbox="allow-scripts allow-same-origin">` with no `allow-downloads`, like the published viewer) and viewed as contact sheets. There were no console or page errors. The built page's real output was measured again by tapping the node that feeds `AudioContext.destination` (table at the end).

## The ship-blockers

### 1. Fades and level changes that jumped (audio B1, Critical)

**Cause, confirmed.** `holdParam()` called `cancelAndHoldAtTime(now)` and stopped there. Per spec (Chromium, WebKit) that inserts a hold only when `now` cuts through a running event. Once the param's last event has finished, it inserts nothing, and the next ramp interpolates from that old event's time and value. The longer a gain sat still, the bigger the jump. The tests missed it because the mock always inserted a hold.

**Fix (core, one line in effect).** `holdParam` now always ends with `param.setValueAtTime(v, time)` using the tracked value, on both the `cancelAndHoldAtTime` and the Firefox path. The prototype and every engine path (`rampParam`, `rampFade`: Stop, Take 5, Cycles, the timer end, Evening descent's 60 s fade, level changes, the swap dip) go through it.

**Regression guards.**
- `core/test/mockAudio.ts`: `cancelAndHoldAtTime` now follows the spec. It inserts nothing past the last event, and a ramp it cuts ends at the cut with the same shape.
- `core/test/fade.test.ts`, 5 new tests: Stop after 60 s (no step at the stop, −20 dB ± 2 at stop + 10 s, silence at the end); Stop after 25 min is still a fade; Medium → Quiet after 12 s moves less than 0.3 dB in 10 ms; a ramp cut mid-way continues from where it was; the engine's own Stop after 60 s. **Four of the five fail on the old `holdParam`** (checked by reverting it).
- `tools/ramp-check.mjs` bundles core's helpers with esbuild and renders them in Chromium's `OfflineAudioContext`. On the old code it reports −34.5 dB at stop + 10 s, −39.5 dB one second into a Stop after 25 min, a 6.9 dB step on a level change, and −20 dB at the hold in the review's own repro. On the fix: −20.1 dB, −2.0 dB, −0.04 dB and 0.0 dB.
- Native: the Swift and Kotlin renderers retarget each `Ramp` from its *current* rendered value per buffer. They don't use "ramp from the last scheduled event", so the bug doesn't port. Checked by reading `ToneRenderer.kt` and `ToneRenderer.swift`.

### 2. Exports and Copy that failed without a word (council 1, 2, 5; expert B2, B3, B11)

The demo is judged inside a viewer that blocks downloads, and the export is the "your data is yours" promise. So no export may ever end in nothing.

- **Every Export opens a sheet** (`ui/exporting.ts`, `ExportSheet`): This week → Export CSV / JSON, Settings → Export my data (JSON) (`set-export`), and the blind result's Export CSV. The sheet shows the file in a selectable, monospace, unwrapped field with its name, line count and size, plus one action, **Copy all**. Its status line always says what happened:
  - Outside a frame, the download is handed to the browser at once: "Sent tuck-notes.csv to your browser's downloads. It's also here to copy."
  - In a frame (where a download can be dropped with no error and no event, so Tuck can't know): "This viewer can't save files, so here is tuck-notes.csv to copy." The text link "Try saving it as a file anyway" follows, and after it is tapped the sheet says "If no file appeared, this viewer blocks downloads. Copy it instead."
- **Copy is honest** (`copyText`): it reports success only when `navigator.clipboard.writeText` resolves (capped at 1.5 s) or `execCommand('copy')` on the selected field returns true. On failure the text stays selected and the sheet says "Copy didn't work here. The text is selected: copy it yourself." Share uses the same path: **Copied** only on success, and otherwise a selectable field (`share-fallback`) with the same sentence. That was verified with the clipboard refused inside the sandboxed frame (`57-share-copy-failed`).
- **No empty exports.** Export CSV / JSON appear only once there's a note: "Nothing to export yet. Export CSV and JSON appear here with your first note."
- Not chosen: routing exports through the artifact viewer's file-save capability. The prototype is one self-contained HTML file that has to work from `file://` and in any host, so the copyable sheet is the fallback that always works. If the host later grants downloads, the same sheet still confirms them.

### 3. A blind comparison you could tell apart by ear (expert B4; growth 2)

Arm B was noise only, so arm A's 200/214 Hz hum gave it away. **The control arm is now a sham**: the same layer with the same carrier in both ears (207 / 207 Hz, a 0 Hz beat), the same tone level, and the same noise, held still. The arms differ only in the beat.
- Core: `SHAM_BEAT_HZ = 0` is accepted by the engine (`sanitizeTone` keeps exactly 0; anything between 0 and 0.5 still clamps to 0.5). Saved layers and presets still validate to 0.5 Hz. Test: the sham plays 207 / 207 Hz at the same tone gain as the 200 / 214 Hz arm.
- Prototype: `shamOf(layer)` in `tuck/layers.ts`; `startSound` plays it for the non-beat label. Verified in the built page: beat arm 200 / 214 Hz, sham 207 / 207 Hz, both at volume 0.28 with the beat path on.
- Copy, everywhere: "One has the beat. The other plays the same tones and noise with no beat, so they sound alike." The result reads "Layer B played the same tones with no beat", the labels read "beat / no beat", and the Plus table reads "Two weeks, beat or no beat, CSV".
- Native: the native apps don't run the comparison yet; when they do, `Model.swift` / `Model.kt` need the same 0 Hz exception. Logged as a follow-up.

## How conflicts were resolved

Brand principles decide: simplicity, one primary action, sensory calm, honesty.

| Conflict | Call | Why |
|---|---|---|
| Dev wants an export that just saves a file; the viewer can't save, and Tuck can't detect a dropped download. | One sheet for every export: the file itself, **Copy all** as the only button, an honest status line, and "Try saving it as a file anyway" as a text link. | Brand: honesty over polish. A button that says what happened beats a button that might have worked. One primary action. |
| Accessibility wants "More ↓" cues at 200%; the designer wants less on screen. | The cue appears **only while** the top region really has content below its edge (at default sizes it never shows). At accessibility sizes the indicator drops its icon and stays one line (capped at 22 px), the greeting is left out, and the idle layer shows the readout instead of the pull hint. | It removes clutter at the size where room is scarcest, and adds one control only when something is hidden. |
| Maya: "Start it without opening Tuck" every session is nagging. Growth: it's the retention mechanic. | Shown at each session end **until it's tapped, or until Done is tapped while it's showing**. Then never again. The same option stays in the Menu. | It's a suggestion, not a nag (brand: nothing to keep up with). One dismissal is enough to say "seen it". |
| Maya wants the playing top band used; the designer wants it quieter. | The one quiet line is anchored **under the layer name** (12 px), and the layer rests 50 to 60 pt higher (Quiet 450, Medium 530, Full 580; `tokens.json`). On a first session the line still has its second half: "Started at 10:25 · fades out when you stop", or "· ends at 10:50" with a timer or Evening descent. With weekly history it's "· 25 min this week". | No new control, and the dead band is gone without adding content. |
| Growth: a word of context on shared links. Privacy line: numbers only. | **Optional** "A word for them", at most 24 characters (letters, digits, spaces, apostrophes, hyphens), sent as `&note=`. The recipient sees "Someone shared a layer, “for reading”." The share sheet says the link "carries the numbers, and your word if you add one". | It's opt-in, typed by the sharer, and sanitised on both ends. It is still no name, no account and no usage data. |
| The designer: call notice says "Paused" but the session ended; keep it paused, or say so? | **"Stopped for your call. Start sound when you're done."** The inline Start link is gone from every notice (call, takeover, blocked). The big button is the action. | Literal (Sam), and one primary action. A true pause and resume would need the native audio session; the prototype doesn't pretend to have it. |
| Priya: say how sync works, or drop it. Settings says "Everything stays on this phone." | Plus row: "Also on your other devices, via your own iCloud or Google account, end-to-end encrypted. No Tuck server, no account. Off until you turn it on." Settings → Privacy adds the same in one parenthetical sentence. | The truthful design (no Tuck server) keeps the privacy line true. It's still marked UI-only in the final report. |
| Hannah: no summary words under about 5 notes; Dev wants the numbers. | Below 5 notes per group, the counts only ("With the beat: 2 notes: 1 good, 1 same as usual"). From 5 up, the words plus the counts ("mostly good (7 notes: 5 good, 2 same as usual)"). | Brand: never overclaim. The counts are the data. |
| Leo: "Back in 5 min … then it fades out" reads as a contradiction. | Felt "**5 min at Quiet**", with "A soft chime, then it fades and asks if you want another round." (Plain: "Break, 5 min" / "Level Quiet. One chime, then it fades out and offers another round."). | It says what happens, in order. |
| Priya: at 21:00 Home preselects Scattered. | From 21:00 to 05:00 the idle preselection is **the layer you last started in the evening, or Evening descent** (Heavy-eyed is the selected chip). In the day it never preselects Evening descent. A pin, a shared link, a picked chip, a running session or a blind comparison is never overridden. | The evening theme and the evening default now agree. |

## Bugs

| Bug | Fix |
|---|---|
| **B1 Critical** ramp anchor (audio) | See above. Core `holdParam`; mock, tests and the browser check. |
| **High** exports fail silently (council 1, expert B2) | Export sheet (above). |
| **Medium** "Copied" when the copy failed (council 2, expert B3) | `copyText` with a real result, plus a selectable fallback. |
| **Medium** disconnected sheet says "faded out" while idle (council 3, expert B6) | Idle: "No headphones connected, so Start plays noise only. Connect headphones to hear the beat." "Headphones disconnected, so Tuck faded out." is used only when a session really faded out (`notice === 'disconnected'`). |
| **Medium** 200% text: indicator over the spec card, clipped subline and question, ghost readout (council 4, expert B5) | The spec card opens below the top bar, which grows with the text (`specTop()`). The indicator is one line. The greeting is left out at accessibility sizes, so "How are you arriving?" leads. The idle layer shows the readout instead of the pull hint (no more "1 4 H z" fragments). A **More** cue appears whenever the top content runs under the layer. Playing, the layer is capped at 58% of the screen (was 64%), so the status and name have room. |
| **Medium** blind arms distinguishable (expert B4) | Sham arm (above). |
| Low: exports with zero notes (council 5, expert B11) | Hidden until there's a note, with "Nothing to export yet". |
| Low: "mostly good (1)" (council 6) | Counts below 5 notes. |
| Low: evening preselects Scattered (council 7) | `preselectForHour()` at boot and whenever the simulated hour crosses 21:00. |
| Low: schedule Play menu cut to "Evening descen" (council 8, expert B9) | The At / Play row wraps: the time keeps 9.5 rem and Play takes the rest of the row (at least 12.5 rem), so "Evening descent" fits at 390 px. |
| Low: two grab handles stacked (council 9) | The layer's handle bar fades out while any sheet is open. |
| Low: Plus sync contradicts Privacy (council 10) | See conflicts. |
| Low (prototype): desktop controls cut off (council 11) | A sticky "More controls below ↓" button at the panel's bottom edge while it has more to scroll (`60-desktop-frame`). |
| Low: call notice "Paused" with a duplicate Start link (expert B7) | See conflicts. |
| Low: "Sleep" as a layer name (expert B8) | "Breathing layer: Calm, Unwind and Evening descent"; "Auto: warm and dim from 21:00 for every layer, and from 18:00 for Evening descent"; the warning reads "Don't use Tuck while driving, least of all Evening descent." The same edits are in `brand.md` and `tokens.json`. |
| Low: Beat On ↔ Off dips 2.1 dB (expert B10) | An equal-power crossfade. The beat's amplitude share follows a quarter cosine and the noise takes the power it gives up (noise² = v² + 1 − c²), drawn as 8 linear segments (error under 0.1 dB). Measured: −30.8 ± 0.3 dBFS throughout. |
| Audio must-fix 4: the mid-session swap was never reached | Confirmed: `setSwap` ran only at Start. The swap now follows the setting **and** the route at any time (`wantSwap()` in `ui/state.ts`, subscribed to both stores), with the 25 / 25 ms dip. With B1 fixed, `routerIn.gain`'s first ramp is anchored at its current value, not at t = 0. |

## Must-fixes

| Reviewer | Item | Status |
|---|---|---|
| Maya | Start tip only until tapped or dismissed | **Built** (Done counts as dismissal) |
| Maya | Top line on a first session | **Built** ("Started at 10:25 · fades out when you stop" / "· ends at …") |
| Dev | Export never silent; fallback sheet; always report the outcome | **Built** |
| Dev | Copied only on success; selectable text on failure | **Built** |
| Dev | Hide export with zero notes | **Built** |
| Sam | Idle disconnected copy | **Built** |
| Sam | 200% overlap and clipping | **Built** (see bugs) |
| Sam | Schedule Play menu truncated | **Built** |
| Priya | Heavy-eyed / last evening layer after 21:00 | **Built** |
| Priya | Explain sync or drop it | **Built** (explained) |
| Leo | Take 5 felt wording | **Built** |
| Hannah | No summary words under 5 notes | **Built** |
| Hannah | Blind Export CSV must save or show | **Built** |
| Designer | Call notice; drop the duplicate Start link | **Built** ("Stopped for your call.") |
| Designer | Disconnected sheet while idle | **Built** |
| Designer | Ear check: bottom 45% empty | **Built.** The stitch diagram (now 320 px at a 5 px stroke) takes the free space between the intro and the buttons, up to 230 px, so the block sits centred in every state (`02` to `06`). |
| Designer | Home playing dead band; raise the layer about 60 pt at Medium | **Built** (Medium 470 → 530; the line sits under the name) |
| Designer | Schedule Play select | **Built** |
| Accessibility | Silent exports; disable when empty | **Built** |
| Accessibility | Honest Copied | **Built** |
| Accessibility | 200% top region | **Built** |
| Accessibility | Sleep naming | **Built** |
| Accessibility | Fade jumps as a startle hazard | **Built** (B1) |
| Audio | B1 fix | **Built** |
| Audio | Spec-faithful mock and a real-browser OfflineAudioContext test; re-measure | **Built**: mock plus 5 tests plus `tools/ramp-check.mjs`. Stop, level change and Beat On ↔ Off were re-measured in the built page (table). Take 5, the Cycles break, the timer end and Evening descent use the same `rampParam` / `rampFade` paths now covered by the tests. They were not re-captured at full length (a 45 min descent). |
| Audio | Sham arm | **Built** |
| Audio | Equal-power Beat On ↔ Off | **Built** |
| Audio | Confirm the mid-session swap | **Fixed** (it wasn't reached; it is now) |
| Growth | Export fallback in the viewer | **Built** |
| Growth | Sham arm before marketing the comparison | **Built** |
| Growth | B1 before any listening test | **Built** |
| Growth | Optional one-word note on shares | **Built** |
| Growth | Instrument the funnel in the spec | **Specified** in `product-spec.md` → "Funnel events". It is not wired: the prototype sends nothing anywhere, and that stays true. |

## Measured in the built page after the fixes

Chromium, a `ScriptProcessor` tap on the node feeding the destination, 2048-sample blocks (about 46 ms), RMS averaged over both ears. Script: `scratchpad/meas.mjs` (not committed).

| Check | Round 3 | Now |
|---|---|---|
| Stop after a still period (20 s here) | −6.7 dB instant step after 12 s; about −27 dB within 1 s after 49 s | −30.8 → −30.9 dBFS in the first 50 ms, −34.1 at +1.5 s, −40.8 at +5 s, about −51 at +10 s (−20 dB re start) |
| Medium → Quiet after 12 s | −8.6 dB inside 10 ms (a click) | a glide from −31.0 to −40.5 dBFS over about 1.2 s, at most about 1 dB per 46 ms block, no sample step |
| Beat On → Off (4 s) | −30.3 → −32.4 → −30.8 dBFS | −30.8 ± 0.3 dBFS throughout |
| Blind arms | A 200 / 214 Hz plus noise; B noise only | beat arm 200 / 214 Hz, sham arm 207 / 207 Hz, same tone volume (0.28) and noise |
| `ramp-check.mjs` (OfflineAudioContext) | 4 of 7 fail on the old code | 7 of 7 pass |

## Screens added in `docs/screens/`

`47-large-text-idle`, `48-large-text-spec-card`, `49-playing-first-session`, `50-evening-home`, `51-take-five-running`, `52-call-stopped`, `53-headphones-disconnected-idle`, `54-this-week-few-notes`, `55-export-sandboxed`, `56-export-copied`, `57-share-copy-failed`, `58-shared-with-note`, `59-schedule`, `60-desktop-frame`. Screens `55` to `57` run inside a sandboxed iframe with no `allow-downloads`. `prototype/SCREENS.md` documents each one, plus the `framed:` mode in `tools/shoot-all.mjs`.

## Not done, and why

- **True pause and resume for calls.** This needs the native audio session's interruption-ended event. The copy now says what the prototype really does (it stops).
- **Wiring the funnel events.** They are specified, not wired: no analytics code goes in a demo that promises nothing leaves the phone.
- **Sham beat in the native models.** The native apps don't run the comparison yet. Follow-up: allow exactly 0 Hz in `Model.swift` / `Model.kt` for the control arm.
