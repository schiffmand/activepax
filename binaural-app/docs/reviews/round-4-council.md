# Customer council, round 4: Tuck prototype

**Date:** 10 Oct 2026 · **Build:** `prototype/dist/index.html` (`npm run build` clean, 834 kB)
**Method:** I rebuilt the prototype, then captured all 60 SCREENS.md flows with `tools/shoot-all.mjs` into `.shots/r4-council-NN-*.png`. A second script (`.shots/r4-council-extra.mjs`, 31 flows, `.shots/r4-council-x-*`) covered what the standard set skips: onboarding skip, the swapped verdict, Cycles through a break, Break over → Another 25 min, rating, the blind comparison end to end (session, rating, reveal, export), every export **inside a sandboxed iframe without `allow-downloads`** (This week CSV/JSON, Settings → Export my data, blind CSV, "Try saving it as a file anyway", clipboard refused), the unframed download, every headphone route and its sheet, disconnect mid-session, takeover, other audio for 10 min, pinned layer, five-intent row, delete, editor validation, keyboard, 200% text (idle, session end, timer sheet, Sensory), schedule, and a 22:00 session. A third script (`r4-council-y-*`) ran the full evening → morning sleep-note flow with a real 65 s fade-out, and a mid-session disconnect from the Prototype controls select. A one-off `shoot.mjs` run (`r4-council-full-*`) checked the Full level. Every image was viewed, as 4-up contact sheets in `.shots/r4c-m/`, `r4c-x/`, `r4c-y/` and `r4c-f/`. There were no page errors. Two step failures were my own selectors, and both flows were re-run correctly.

Each seat scored on its own against `personas.md`, and checked its round-3 must-fixes against `round-3-response.md`.

## Scoreboard

| Seat | Persona | R2 | R3 | **R4** | One line |
|---|---|---|---|---|---|
| ADHD knowledge worker | Maya | 7.5 | 8.0 | **8.5** | The top band finally says something on my first session. Then I tap Full and it gets cut off under a "More" bubble. |
| Programmer in deep work | Dev | 8.0 | 8.0 | **8.5** | Export is honest now, and so is Copy. Evening descent's readout says "7.8 Hz · L 136 / R 144", and those numbers don't add up. |
| Autistic / sensory-sensitive | Sam | 7.5 | 8.0 | **8.0** | The literal copy is right everywhere I checked. At 200% a floating "More" pill sits on top of words. |
| Longevity / sleep optimizer | Priya | 7.5 | 8.0 | **8.5** | 21:00 gives me Heavy-eyed and the sleep note works for real. "43 min" in the morning, "44" on This week. |
| Student | Leo | 7.5 | 8.5 | **9.0** | Cycles, the break, Take 5, Another 25 min: it all just works. I'd tell my study group. |
| Skeptic | Hannah | 7.5 | 8.0 | **8.5** | The sham arm and the no-summary-under-5 rule are what I asked for. Export works even in this viewer. |

**Mean 8.5, min 8.0** (round 3: 8.1 / 8.0). The target was mean ≥ 8.7 with every seat ≥ 8. The floor holds, but the mean misses. The gap is almost all layout: the new **More** pill and the Full-level layer height. Plus one honesty bug in the readout numbers.

---

## Seat 1: Maya, ADHD knowledge worker (8.5)

> My round-3 ask landed. On my very first session the top now reads "Tucking in… / Focus / Started at 10:31 · fades out when you stop" (`r4-council-09`). That's the time-blindness anchor I wanted, and it doesn't nag. "Start it without opening Tuck" sits next to Done, which I can live with since one Done kills it. Take 5 → Break over → **Another 25 min** is one tap and comes back at Medium with "Fades out at 25 min" (`x-another-a/b`). When I put music on, the indicator says "Your audio keeps playing above", and after ten minutes "Stayed under your audio for 10 min" (`x-other-a/b`). It's a quiet little win, not a badge.
>
> But I like it loud. When I tap **Full** (or press ↑), the layer rises and covers my top line: "Started at 10:46 · fades out when you s…", with a "More ⌄" bubble on top of it (`r4-council-full-2`, `x-kbd-a`). Tap More and "Tucking in…" scrolls half off the top (`full-3`). On a normal-size phone, at normal text size, the thing you fixed for me disappears the moment I turn it up. And a "More" button while I'm trying to focus is one more thing to look at.

**Must-fix**
1. At Full, keep the status, layer name and "Started at…" line fully visible at 390×844 with default text. Cap the layer lower, or drop the felt's spare space, but never show More at 100% text.
2. (Nice) The pull hint changes wording between first run ("Pull the top edge up, or tap Start sound.") and later ("Pull up, or tap Start sound."). Pick one.

## Seat 2: Dev, programmer in deep work (8.5)

> Round 3 was my export rant, and it's fixed properly. In the sandboxed frame, **Export CSV** opens a sheet that says "This viewer can't save files, so here is tuck-notes.csv to copy", with the file in a monospace field and its line and byte count (`r4-council-55`). Copy all says **Copied 3 lines** only when it did (`56`). With the clipboard refused, it says "Copy didn't work here. The text is selected: copy it yourself" and actually selects it (`x-expfail-a`). "Try saving it as a file anyway" is followed by "If no file appeared, this viewer blocks downloads", which is the honest answer when you can't detect a dropped download (`x-setexp-c`). Unframed, the download really fires and the sheet says so (`x-expunframed-a`, Playwright saw `tuck-notes.csv`). With zero notes it says "Nothing to export yet" (`x-sleep-d` area). Share copy fails honestly too (`57`). That's exactly what I asked for.
>
> New gripe: the readout lies a little on journeys. While Evening descent plays it shows "**7.8 Hz · L 136 / R 144**" (`x-schedule-a`), and after the session "**2 Hz · L 136 / R 144**" (`y-sleep-b/c`). 144 − 136 = 8. The beat value is live, but the ear frequencies are the layer's static start values (`Home.tsx:858` uses `s.beatNow` and `e.left` / `e.right` from the layer). For an app whose whole pitch is "exact numbers", the one line of numbers on the screen has to be self-consistent. Smaller: the editor shows "L 157.5 Hz R 256.5 Hz" next to "Beat frequency must be between 0.5 and 45 Hz" when I type 99 (`x-editerr-a`). Don't render derived values from an invalid input.

**Must-fix**
1. Journey readout: derive L / R from the live beat (or show the start values with the start beat). After a session ends, return to the layer's start values.
2. Editor: hide or dim L / R while the beat field is invalid.
3. (Prototype) Export timestamps use the real clock (CSV "03:43") while the app runs on `?hour=10` ("Started at 10:42"). Fine for a demo, but use the same clock so a reviewer doesn't think the export is wrong.

## Seat 3: Sam, autistic and sensory-sensitive (8.0)

> My round-3 items are done. The idle disconnected sheet now says "No headphones connected, so Start plays noise only. Connect headphones to hear the beat" (`53`). The schedule's Play menu reads "Evening descent" in full (`59`). Every route sheet is literal: call mode "will switch back to binaural when the call ends", Mono "merges left and right, so the beat can't form", one earbud "Only one side is connected" (`x-route-*`). Takeover: "Another app took over the sound, so your layer stopped. Your audio wasn't changed" (`x-takeover-a`). Sensory mode: "Starting. Fading in over 15 seconds." and "Ceiling: Medium. Change it in Settings." on hatched Full (`31`). Good.
>
> 200% text is still not safe. The fix added a **More** pill that floats over content instead of beside it. On idle Home it covers the end of "How are you arrivin[g?]" and the chips are off-screen until I tap it (`47`). After that it sits on the "Wound up" chip (`x-bigidle-more-a`). On session end it covers "Fading out ove[r 20 seconds]" (`x-bigend-a`). In Sensory mode at 200% it sits beside "Starting. Fading in over 15 seconds." (`x-sensory-big-a`). An overlay that hides words is exactly the unpredictable-UI thing I'm sensitive to. Separately, when my headphones disconnect mid-session, Home just goes back to idle with the generic pill "No headphones, so noise only" (`y-disc-a`). The "Headphones disconnected, so Tuck faded out" sentence exists, but only inside the sheet. I'd be left wondering whether it stopped or switched to noise.

**Must-fix**
1. 200%: More must never cover text. Put it in the flow (a row under the content, or inline at the top band's bottom edge with the content padded to clear it), or reserve its space.
2. Mid-session disconnect: show the literal notice on Home itself, the way the call and takeover notices do ("Headphones disconnected, so Tuck faded out. Start plays noise only.").

## Seat 4: Priya, longevity and sleep optimizer (8.5)

> At 21:00 Home now offers Heavy-eyed → Evening descent, "Ends after 45 min", dim and warm (`50`, `21`). The full loop works: it plays "Evening descent · Easing → Low", the top line reads "Started at 21:47 · ends at 22:32", the stop sets it down over 60 s, and in the morning: "How did you sleep? Last night: Evening descent, 21:47, 43 min." One tap, and "Well" sits under Saturday's bar with "The last row is how you slept after that evening's session" (`y-sleep-a..d`). Sync on Plus is now explained in one honest sentence, and Settings → Privacy repeats it (`41`, `x-setexp-a`). That's my round-3 list, done.
>
> Precision nits, because I compare numbers: the morning note says **43 min** and This week says **44** for the same session (`y-sleep-c` vs `y-sleep-d`), presumably one including the fade and the other not. This week also says "0 noted sessions" directly below a sleep note I just gave. And the evening readout after the session shows "2 Hz · L 136 / R 144" (Dev's bug). It makes the descent look broken the next evening.

**Must-fix**
1. One minute count per session everywhere (say which: with or without the fade).
2. Count sleep notes in "Your notes" (for example "1 sleep note: well"), or label the line "session notes".
3. Dev's readout fix, so the idle evening readout shows 8 Hz again.

## Seat 5: Leo, student (9.0)

> Everything I care about works and reads right. Cycles shows "Round 1 of 4 · break at Quiet after 25 min", the break says "Five minutes off. / 25 min / Round 1 of 4 · break, back to Medium after 5 min", and round 2 comes back at Medium (`x-cycles-a..c`). Take 5 says "5 min at Quiet. A soft chime, then it fades and asks if you want another round", which is what happens (`51`). "Another 25 min" is one tap (`x-another`). The ear check found my swapped earbuds and said "Tuck will swap them for you" (`x-swapped-a`). "Skip, use noise only" lands on a clear "Noise only for now. You can run the ear check any time in Settings" (`x-skip-a`). It's free, with no ads.
>
> One thing: during Cycles the top line still says "Started at 10:40 · **fades out when you stop**" (`x-cycles-a`). With Cycles it actually ends after round 4, about 2 h. Say "· 4 rounds, ends about 12:40".

**Must-fix**
1. Cycles top line: state when it ends, like the timer does.

## Seat 6: Hannah, the skeptic (8.5)

> Both my round-3 items are fixed. This week with 2 notes says "With the beat: 2 notes: 1 good, 1 same as usual" and adds "These are your notes, not a test. For a fair answer, run a blind comparison" (`54`). That's the right humility. The blind result's **Export CSV** works in the sandboxed viewer and shows `tuck-blind.csv` to copy (`x-blindexp-a`). The control arm is a sham with the same tones and no beat, and the setup copy says so plainly (`34`). With one note on one arm, the reveal refuses to compare: "There aren't notes for both layers, so there's no comparison to make" (`x-blind-e`). Studies list the null and negative findings with DOIs (`33`). What we know has a review date.
>
> What keeps me off 9: the readout inconsistency Dev found is the kind of thing that makes me distrust the rest of the numbers. And on the blind setup, "they sound alike" is a claim. Say "they're built to sound alike" unless you've tested it. Minor: in the blind CSV the `beat_hz` column is blank for the arm, even after the reveal. After the reveal it should say 14 / 0 so the file stands on its own.

**Must-fix**
1. Readout consistency (Dev 1).
2. Blind setup: "built to sound alike", not "sound alike".
3. Blind CSV after the reveal: fill `beat_hz` (14 or 0) and an `arm` column of beat / no beat.

---

## Functional bugs

| # | Sev | Bug | Repro / evidence |
|---|---|---|---|
| 1 | **Medium** | **At Full level, the playing layer covers the top line at default text size.** "Started at … · fades out when you s…" is clipped, a More pill appears over it, and tapping More scrolls the status half off-screen. | 390×844, `?screen=home&hour=10`, Start → Full (or ↑ on the keyboard). `r4-council-full-2`, `full-3`, `x-kbd-a` |
| 2 | **Medium** | **At 200% text, the floating More pill covers content**: the end of the arrival question, the "Wound up" chip after scrolling, the session-end subline, and the Sensory status. | `r4-council-47`, `x-bigidle-more-a`, `x-bigend-a`, `x-sensory-big-a` |
| 3 | **Medium** | **Journey readout mixes the live beat with static ear frequencies** ("7.8 Hz · L 136 / R 144", and "2 Hz · L 136 / R 144" idle after the session). `Home.tsx:858` uses `s.beatNow`, while `e.left` / `e.right` come from the layer. The live beat also persists into the idle state after the session. | Evening descent via the schedule, or Heavy-eyed at 21:00 → Skip ahead → Stop. `x-schedule-a`, `y-sleep-b`, `y-sleep-c` |
| 4 | Low | **Mid-session disconnect shows no notice on Home.** It returns to idle with the generic "No headphones, so noise only" pill, and the "faded out" sentence appears only inside the sheet. | Start, then Prototype controls → Headphone route → Disconnected. `y-disc-a` |
| 5 | Low | **Cycles top line says "fades out when you stop"**, but Cycles ends after 4 rounds. | Timer → Cycles → Start. `x-cycles-a` |
| 6 | Low | **The editor renders L / R for an invalid beat** (99 Hz → "L 157.5 / R 256.5") beside the range error. | Spec card → Edit a copy → type 99. `x-editerr-a` |
| 7 | Low | **Session minutes disagree**: the morning note says 43 min and This week says 44 for the same session. This week also says "0 noted sessions" under a recorded sleep note. | `y-sleep-c`, `y-sleep-d` |
| 8 | Low (prototype) | **Export timestamps use the real clock**, not the simulated `?hour=` clock (CSV 03:43 vs "Started at 10:42"). | `x-blindexp-a`, `55` |
| 9 | Cosmetic | **The pull hint wording varies**: "Pull the top edge up, or tap Start sound." vs "Pull up, or tap Start sound." | `07` vs `15` |

No silent failures were found. Every export and copy path, framed and unframed, reports what happened.

## Round-3 must-fixes: verified in this build

| Item | Status |
|---|---|
| Maya: Start tip only until tapped or dismissed | **Fixed** (Done shown next to it; I did not run a second session to confirm it stays gone) |
| Maya: Top line on a first session | **Fixed** at Medium and Quiet; **regresses at Full** (bug 1) |
| Dev: Export never silent | **Fixed**, framed and unframed (`55`, `56`, `x-setexp-*`, `x-expfail-a`, `x-expunframed-a`) |
| Dev: Copied only on success | **Fixed** (`57`, `x-expfail-a`) |
| Dev: Export hidden with zero notes | **Fixed** ("Nothing to export yet") |
| Sam: Idle disconnected copy | **Fixed** (`53`) |
| Sam: 200% overlap and clipping | **Partly.** The indicator and spec card no longer overlap (`48`), but the new More pill covers text (bug 2) |
| Sam: Schedule Play menu truncated | **Fixed** (`59`) |
| Priya: Heavy-eyed after 21:00 | **Fixed** (`50`) |
| Priya: Sync explained | **Fixed** (`41`, Settings → Privacy) |
| Leo: Take 5 felt wording | **Fixed** (`51`) |
| Hannah: No summary words under 5 notes | **Fixed** (`54`, `x-rating-c`) |
| Hannah: Blind Export CSV must save or show | **Fixed** (`x-blindexp-a`) |

## What would move the mean to 9

1. **Layout, once:** the top band must never be covered at 100% text (Full level), and More must never sit on top of words at 200%. This is two seats' worth of points (Maya, Sam).
2. **Make the numbers agree** on the readout (journeys), between the morning note and This week, and in the editor. Dev, Priya and Hannah all docked for this.
3. A visible notice on Home when a disconnect stops the session, and an end time on the Cycles top line.
