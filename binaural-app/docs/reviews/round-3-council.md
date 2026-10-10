# Customer council, round 3: Tuck prototype

**Date:** 10 Oct 2026
**Build:** `prototype/dist/index.html` (fresh `npm run build`, single file, 822 kB)
**Method:** Every flow in `prototype/SCREENS.md` was captured with Playwright at 390×844 @2x, with real waits for the timed flows: ear-check verdicts, fade-in and fade-out, Cycles and its break, timer end, Take 5 and Another 25 min, the blind comparison end to end, rating, the morning sleep note, every headphone route and its sheet, call and takeover, Sensory and Plain labels, keyboard, 200% text and the 1280 px desktop frame. That produced 141 screenshots in `.shots/r3-council-*.png`, all viewed as 5-up contact sheets in `.shots/r3-council-m/`. A second script (`r3-council-exp-*.png`) ran the demo **inside a sandboxed iframe without `allow-downloads`**, like the published viewer, and pressed every export and copy button. There were no console or page errors. Three clicks failed, all as designed: Full is locked under the Sensory ceiling and during a blind session, and the swapped route has no pill. Six seats scored independently against `docs/personas.md` and `docs/brand.md`, and each checked its own round-2 must-fixes against `round-2-response.md`.

Scale: 10 = "I'd love this and tell friends". 8 = "good, I'd keep it". 6 = "I'd try it, but it would probably get deleted".

## Scoreboard

| Seat | Persona | R1 | R2 | **R3** | One-line verdict |
|---|---|---|---|---|---|
| ADHD knowledge worker | Maya | 7.0 | 7.5 | **8.0** | Take 5 finally reads as a break, and "Another 25 min" is one tap. Vary talks back now. The top half while playing is still mostly empty. |
| Programmer in deep work | Dev | 7.5 | 8.0 | **8.0** | dBFS with a true minus, and shared links that play before saving. But every Export button does nothing in the viewer, with no message at all. |
| Autistic / sensory-sensitive | Sam | 6.5 | 7.5 | **8.0** | The stale lines are gone and the Mono verdict is literal now. One sheet tells me something faded out when nothing was playing. |
| Longevity / sleep optimizer | Priya | 6.5 | 7.5 | **8.0** | The sleep note names the layer and the time, notes sit under the bars, and Health is free. At 21:00 it still preselects Scattered, not Heavy-eyed. |
| Student | Leo | 7.0 | 7.5 | **8.5** | Cycles, the break status, Take 5 and Another 25 min: my whole Pomodoro loop works now. |
| Skeptic | Hannah | 7.5 | 7.5 | **8.0** | The blinding holds until the reveal, and the legend is a rule, not data. Two problems: "mostly good (1)" overclaims from n = 1, and the CSV export fails without a word. |
| **Mean** | | **7.0** | **7.6** | **8.1** | Over the "I'd keep it" line for the first time. Every round-2 integrity bug is fixed. The new blocker is the export and copy buttons, which fail without a word inside the published viewer. |

---

## Seat 1: Maya, ADHD knowledge worker (8.0)

> Okay, this one I'd keep. I hit my 25 minutes, it says "Set down after 25 min," I tap Take 5, and now it actually says **"Five minutes off."** The chip says "Break, 5 min" and the felt says "Back in 5 min." Then "Break over." and **Another 25 min**, and one tap puts me back in. That's the loop I've been failing to run with three other apps. When I tap Vary, the felt tells me "from your next session, a different noise bed each time". So I'm not left wondering if I broke it. The "phone doesn't tell apps" note now shows up after my first session instead of greeting me, which is much better.
>
> The top area while playing is better. "Started at 10:38" is genuinely useful for my time-blindness. But on a first session it's still a big empty band: "Tucked in. / Calm / Started at 10:38" and then 150 pt of dark green. The weekly line only appears once I have history. Also, "Just started" stays up for the whole first minute, even while I'm fiddling with Level. Fine, but it's the same two words every time.
>
> One small thing: the session-end screen gives me "Done" and "Start it without opening Tuck" every single time. I've seen it. Let me dismiss it for good.

**Loves**
- Take 5 that reads as a break everywhere, and **Another 25 min** as one tap.
- Vary feedback in the felt.
- "Started at 10:38 · 25 min this week", the one quiet line at the top.
- Still no streaks anywhere: "No target line", "There are no streaks".

**Must-fix**
1. Show "Start it without opening Tuck" on the session-end screen only until it's been tapped once or dismissed (or for the first three sessions), not every time.
2. On a first session with no weekly history, give the top band its one line anyway, e.g. "Started at 10:38 · fades when you stop". Don't leave it empty until next week.

---

## Seat 2: Dev, programmer in deep work (8.0)

> All my round-2 nits landed. The spec card now says "Medium · beat −31 dBFS, noise −43 dBFS · ceiling Full". The noise row is "Brown · 25% · −12 dB re the beat", with a real U+2212. Noise only shows as "noise −30 dBFS, matched to the layer", which is exactly the honesty I wanted. The shared link (`?layer=10,180,pink,30,hold,1,Library`) now *is* the layer: the readout says L 175 / R 185, the button says Play it, and Save Library sits in the top text while it plays. The editor's "At Medium: beat −31 dBFS, noise −43 dBFS (RMS per ear)" is good.
>
> Then I tried to get my data out. In the published demo I turned the log on, loaded the sample week, and tapped **Export CSV**. Nothing happened. **Export JSON**: nothing. **Settings → Export my data (JSON)**: nothing. There was no toast, no error, no file. `download()` in `Pages.tsx` builds an `<a download>` and clicks it, and the sandboxed viewer silently drops that. The export is the whole "local-first, no lock-in" promise. A button that does nothing is worse than no button. Same for Share: "Copy text and link" flips to **Copied** whether or not `clipboard.writeText` succeeded (the `.catch(() => undefined)` swallows the failure). And the notes export buttons show even with zero notes, so on the real thing they'd produce an empty file.

**Loves**
- dBFS on the spec card and in the editor, from core helpers, with true minus signs.
- Shared layers that play before saving: "shared with you, not saved".
- Spec card: Beat as a row, a single Edit a copy button, Delete as a text link.
- "Saved layers are frozen… including across updates."

**Must-fix**
1. **Export must never fail silently** (bug 1). Detect when the download can't happen (sandboxed frame, or no download event) and fall back to an in-app sheet that shows the CSV/JSON in a selectable, monospace text area with "Copy all". Always say what happened: "Saved tuck-notes.csv" or "Downloads are blocked here. Copy it instead."
2. "Copied" only when the clipboard write resolves. On failure, show the text selected in place with "Copy didn't work here. Select and copy it."
3. Hide or disable the export buttons (with "Nothing to export yet") until there's at least one note.

---

## Seat 3: Sam, autistic and sensory-sensitive (8.0)

> The things that bothered me are fixed. The "It isn't a treatment" line now sits *under* the time on the first play and is gone once I stop. The Mono verdict states what happened ("Both tones came through both ears, so left and right are being merged.") with **Show me where** and **I've changed it, check again**. That's literal. In Sensory mode the status reads "Starting. Fading in over 15 seconds." and the felt shows only the Full ceiling line, so there's one time statement. Pinned Calm still says "Your layer is ready… It plays exactly as saved." There's still no red and no exclamation marks.
>
> New things I noticed. With the route set to "disconnected" while *idle*, the pill says "No headphones, so noise only". That's true. But the sheet it opens says "**Headphones disconnected, so Tuck faded out.**" Nothing was playing, so nothing faded out. That's an untrue sentence, and untrue sentences are exactly what I can't tolerate. The Spatial sheet shows two grab handles stacked (the layer's and the sheet's). At 200% text the spec card slides up under the indicator, and "Nothing else playing" is drawn over the card. In Settings the schedule's layer menu is cut off at "Evening descen".

**Loves**
- One time statement in Sensory mode, and the hatched Full ceiling.
- Literal ear-check verdicts.
- Headphone pills, one sentence each, with one fix.
- The live Reduce Motion / Reduce Transparency status in Settings.

**Must-fix**
1. The disconnected sheet needs idle copy: "No headphones connected, so Start plays noise only." Keep "faded out" for the mid-session case (bug 2).
2. At 200% text, keep the spec card below the indicator row. Nothing should be drawn over it (bug 4).
3. Fix the truncated "Evening descen" in the schedule's Play menu: let it wrap or widen it.

---

## Seat 4: Priya, longevity and sleep optimizer (8.0)

> My round-2 list landed. The schedule field now reads "09:30 PM" in full. The morning note says **"Last night: Focus, 21:41, 10 min."** On This week, the bar for that evening has "Well" under it, and the caption explains the row. **Save sessions to Health** is free (mindful minutes, nothing else), and it says plainly that it isn't wired in the prototype. The Evening descent spec card is still the best thing for me: the dashed 8 → 4 → 2 Hz over the level, "+60 s", "Ends after 45 min".
>
> Two things keep it from a 9. At 21:00 Home still preselects **Scattered**. The evening theme changes, but the suggestion doesn't. Heavy-eyed (or my pinned evening layer) should be the default after 21:00. And the Plus page says saved layers are "Synced to your other devices", right below a Settings page that says "Everything stays on this phone. No account." Which is it? Sync needs to say where my data goes before I'd pay for it.

**Loves**
- The morning note with layer, time and length, and the sleep row on This week.
- Free Health write, scoped to mindful minutes.
- Evening descent: drawn, timed, with a 60 s fade.
- Warm Dim wool and the outline Start button at night.

**Must-fix**
1. After 21:00 (or 18:00 with Sleep), preselect Heavy-eyed, or the last evening layer, instead of Scattered.
2. On the Plus page, say how sync works ("end-to-end encrypted through your iCloud / Google account; we never see it", or whatever is true), or drop it until it's designed.

---

## Seat 5: Leo, student (8.5)

> This is the version I'd tell my study group about. Cycles shows "Round 1 of 4 · break at Quiet after 25 min" from the first second. During the break the big status says **"Five minutes off."**, the level visibly drops to Quiet, and the chip says Cycles 25 + 5. A plain 25-minute timer ends with Take 5. Take 5 ends with "Break over." and **Another 25 min**, and that one tap brings me back at Medium, not stuck at Quiet. The weekly line, "Started at 10:45 · 30 min this week", is quietly motivating without being a streak. The ear check still has the most useful Neither guidance I've seen.
>
> Nits. The Take 5 felt says "Back in 5 min · At Quiet. One soft chime at the end, then it fades out." "Back in" followed by "fades out" made me hesitate. Does it come back or stop? (It stops, then offers Another 25 min.) Also, on the timer sheet, "Until I stop" is ticked by default and there's a custom "40 min" slider, but nothing tells me Cycles is free (I checked Plus, and it is).

**Loves**
- The full Pomodoro loop: Cycles, break status, Take 5, Another 25 min.
- The break returns to my level, not Quiet.
- The ear check and the honest 40 Hz copy.
- Everything I need is free.

**Must-fix**
1. Reword the Take 5 felt so it can't read as "it comes back by itself": "5 min at Quiet. A soft chime, then it fades and asks if you want another round."

---

## Seat 6: Hannah, the skeptic (8.0)

> The blind comparison is fixed, and fixed properly. During and after a session the readout says "Layer B · numbers hidden" with a neutral stitch. The idle Home says "Blind comparison · Focus", and the arrival line says "in your blind comparison: A or B". Level and Motion are visibly locked during the session, and the felt says "Level and motion stay fixed during the comparison". The setup page tells me up front that both arms are loudness-matched, at Medium, held still. The averages show "–" until both layers have a note, under a line that's clearly a rule: "How the average is scored: Good = 3…". The reveal gives each mean with its n and keeps "a hint, not a finding". That was my bar for recommending it, and it's met.
>
> Two things stop me going higher. This week's "Your notes" says "With the beat: **mostly good (1)**". "Mostly" from a single note is precisely the overclaiming this app otherwise avoids, so below about 5 notes say "1 note: good". Second, the result screen's **Export CSV** is the deliverable of a self-experiment, and in the published viewer it does nothing at all. If I can't take my data out, I can't check the arithmetic, and I'm being asked to trust a button that lied to me by staying silent.

**Loves**
- Blinding held from start to reveal, with arms matched and controls locked.
- The scoring rule, "–" until both arms have notes, and n beside every mean.
- "What we know": dated, with null and negative findings and borderless "Finding:" tags.
- "These are your notes, not a test. For a fair answer, run a blind comparison."

**Must-fix**
1. No summary words ("mostly…") under 5 notes. Show the counts: "1 note: good." (bug 6).
2. Blind result Export CSV: same fix as Dev's (bug 1). It must either save the file or show the CSV to copy, never nothing.

---

## Functional bugs

| # | Severity | Bug | Where / repro |
|---|---|---|---|
| 1 | **High** | **Every export fails silently in the published viewer.** `download()` (`prototype/src/screens/Pages.tsx:69`) clicks an `<a download>` built from a blob URL. Inside a sandbox without `allow-downloads`, the browser drops it: no file, no error, no UI change. This affects This week → Export CSV / Export JSON (`export-csv`, `export-json`), Settings → Export my data (JSON), and the blind result's Export CSV (`blind-export`). | Sandboxed iframe, log on, sample week, This week → Export CSV (`r3-council-exp-00` → `-01`: identical screens). Unsandboxed, the download does fire. |
| 2 | Medium | **"Copied" shows even when the copy failed.** `Sheets.tsx:471` swallows the `clipboard.writeText` rejection, then sets Copied. | Spec card → Share → Copy text and link inside the sandboxed viewer (`r3-council-exp-04`). |
| 3 | Medium | **The disconnected sheet says "Tuck faded out" while idle.** `Sheets.tsx:373` has a single string for both the idle and mid-session cases. | `?debug=1`, `__tuck.ui.set({headphone:'disconnected'})`, tap the pill (`r3-council-route-disconnected-01-sheet.png`). |
| 4 | Medium | **At 200% text, the top indicator ("Nothing else playing") is drawn over the open spec card.** Also at 200%: the session-end subline is clipped ("Fading out over 20"), the arrival question is cut at "How are you" with the chips below the fold, and the idle readout is half hidden under the fade. | `r3-council-bigtext2-04-spec.png`, `bigtext-03-stopped`, `bigtext-00-idle` |
| 5 | Low | **Export buttons show with zero notes** (they'd export an empty file). | This week with the log on and no notes (`r3-council-exp-00`). |
| 6 | Low | **"mostly good (1)" summarises a single note.** `Pages.tsx:708` applies "mostly" at any n. | This week after one rated session (`r3-council-sleepweek-01`). |
| 7 | Low | **Evening Home preselects Scattered**, not Heavy-eyed. | `?screen=home&hour=21` (`r3-council-evening-00`). |
| 8 | Low | **The schedule's Play menu is truncated** ("Evening descen"). | Settings → Schedule (`r3-council-rating-00-log-on.png`). |
| 9 | Low | **Two grab handles are stacked** when the Spatial / Mono / One-earbud sheet opens over the idle layer. | `r3-council-route-spatial-01-sheet.png` |
| 10 | Low | **Plus promises "Synced to your other devices"**, which contradicts "Everything stays on this phone. No account.", with no explanation. | `r3-council-plus-00` vs Settings → Privacy |
| 11 | Low (prototype) | **On desktop, the Prototype controls panel is cut off at the bottom** ("Run the…") with no visible scroll cue. | 1280×860 (`r3-council-wide-00-desktop.png`) |

## Round-2 must-fixes: verified in this build

| Round-2 item | Status |
|---|---|
| Blind comparison unblinds after a session (Hannah, Dev) | **Fixed.** "Layer B · numbers hidden", neutral stitch, "Blind comparison · Focus" while idle |
| Legend reads as data; averages before notes (Hannah) | **Fixed.** A scoring rule; "–" until both layers have a note; n beside each mean |
| Take 5 looks like a restart (Maya, Leo) | **Fixed.** "Five minutes off.", "Back in 5 min", "Break, 5 min", Break over → Another 25 min |
| Cycles break says "Tucked in." (Leo) | **Fixed.** "Five minutes off." |
| Vary gives no feedback (Maya) | **Fixed.** A felt toast |
| "Phone doesn't tell apps" note before the first session (Maya) | **Fixed.** Shown after the first session |
| Top half dead while playing (Maya) | **Partly.** "Started at · this week" line, but empty on a first session |
| Level as raw 0.28; hyphen-minus (Dev) | **Fixed.** dBFS with U+2212 |
| Shared link doesn't drive the layer (Dev) | **Fixed.** Play it, then Save |
| Stale "isn't a treatment" line (Sam) | **Fixed.** Under the time, cleared on Stop |
| Mono verdict link ambiguous (Sam) | **Fixed.** |
| Two time statements in Sensory mode (Sam) | **Fixed.** |
| Stray "Tuck" heading (Sam) | **Fixed.** "Layer: Focus · 14 Hz" in Sensory |
| Schedule time clipped (Priya) | **Fixed.** "09:30 PM" (but the Play menu now truncates, bug 8) |
| Morning note names layer and time (Priya) | **Fixed.** "Last night: Focus, 21:41, 10 min." |
| Sleep notes on This week (Priya) | **Fixed.** "Well" under the bar |
| Free Health write (Priya) | **Fixed.** Described, not wired, and it says so |
| Another 25 min (Leo) | **Fixed.** Returns at Medium |
| Swapped route shows no mark | **Fixed.** ⇄ on the readout and an Ears row on the spec card |
| Clocks ignore `?hour=` | **Fixed.** The Lock Screen shows 10:4x at `hour=10` |

Not verified here: audio levels (the dBFS labels come from core helpers; confirming them takes listening or the measurement script, not screenshots).

## What would move the mean to 9

1. **Make every export and copy honest in the sandboxed viewer** (bugs 1, 2, 5). This is the one item every data-minded seat raised, and the demo is judged inside that viewer.
2. Fix the untrue disconnected sentence and the 200% text overlap (bugs 3, 4). Sam's trust rests on literal copy.
3. Don't summarise small n (bug 6) and explain sync (bug 10). Hannah's and Priya's trust rests on not overclaiming.
4. Give Maya's first session its top line, and make the evening default match the evening.
