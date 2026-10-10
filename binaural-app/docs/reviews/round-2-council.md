# Customer council, round 2: Tuck prototype

**Date:** 10 Oct 2026
**Build:** `prototype/dist/index.html` (fresh `npm run build`, single file, 804 kB)
**Method:** One Playwright script (`.shots/r2-council-capture.mjs`) walked every flow in `prototype/SCREENS.md` at 390×844 @2x, with real waits for the timed flows. Those were the ear-check verdicts (pass, Neither, Mono, Swapped), the 9 s fade-in, the 20 s fade-out, Cycles and its break, the timer end and Take 5, the blind comparison end and reveal, the rating and morning sleep note, every headphone route and its sheet, a call and a takeover, Sensory mode, keyboard control and the 1280 px desktop frame. That produced 106 screenshots in `.shots/r2-council-*.png`, and every one was viewed (as 3-up contact sheets in `.shots/r2-council-m/`). There were no console errors and no page errors. Two clicks failed, both as designed: Full is locked under the Sensory ceiling, and the disconnected route has no idle pill. Six seats reviewed independently, each in their own voice, against `docs/personas.md` and `docs/brand.md`. Each also checked the round-1 must-fix items listed in `round-1-response.md`.

Scale: 10 = "I'd love this and tell friends". 8 = "good, I'd keep it". 6 = "I'd try it, but it would probably get deleted".

## Scoreboard

| Seat | Persona | R1 | **R2** | One-line verdict |
|---|---|---|---|---|
| ADHD knowledge worker | Maya | 7.0 | **7.5** | The felt now gives me something to look at, and Vary and "Start without opening Tuck" are what I asked for. The top half is still dead space while playing, and Take 5 confuses me. |
| Programmer in deep work | Dev | 7.5 | **8.0** | I'd keep it. Exact numbers everywhere, a real editor, export, share links. Level shows as a raw "0.28" with no dB, and the blind comparison leaks its answer. |
| Autistic / sensory-sensitive | Sam | 6.5 | **7.5** | Pinning a layer and the Sensory ceiling make this safe. Some stale lines linger in the felt, and one ear-check button is worded ambiguously. |
| Longevity / sleep optimizer | Priya | 6.5 | **7.5** | Evening descent, warm Dim wool, the morning note and a free schedule: my protocol fits. The schedule's time field is clipped, and there's no Health export in the free tier. |
| Student | Leo | 7.0 | **7.5** | Cycles 25/5 is exactly my Pomodoro. Take 5 after a timer looks broken ("Tucking in…", "Just started", "No timer"). |
| Skeptic | Hannah | 7.5 | **7.5** | The studies page and the free blind test are serious work. But the blind test unblinds itself after a session, and a legend reads like data. That stops me recommending it. |
| **Mean** | | **7.0** | **7.6** | A real step up: most round-1 must-fixes landed and the app is close to "I'd keep it". Two integrity bugs (blind leak, Take 5 state) and a few lingering lines hold it back. |

---

## Seat 1: Maya, ADHD knowledge worker (7.5)

> It's better. I open it, Scattered is already picked, I tap Start sound and the felt says "Just started" in big type. Later it says "With you for 25 min". That's the at-a-glance thing I wanted. The pull-up gesture with the lining brightening is a nice little doorway. "Start it without opening Tuck" right after my first session is clever, and the Spotify automation recipe is the feature I'd actually use. Nobody nags me, and there are no streaks anywhere. This week says "No target line." I laughed.
>
> But while it's playing, the whole top half of the screen is empty dark green with "Tucked in." and nothing else. That's a lot of nothing for a brain that goes looking for stimulation. The disclaimer about my phone not telling apps what I'm listening to is still the first thing on Home until I've started once. It's gone after that, so fine, but it's still my first impression on day one.
>
> I tapped Vary and nothing visible changed. I only learned from the docs that it applies from the next session. Take 5 after my 25-minute timer said "Tucking in…" and "Just started" as if I'd started over. That made me feel like I'd done it wrong.

**Loves**
- One tap from Home to sound. Scattered is preselected, and there's no account, quiz or paywall.
- The felt shows the elapsed time big ("Just started", "With you for 25 min").
- "Start it without opening Tuck": Control Center, the "when Spotify opens" automation, Siri, the widget.
- Vary as a third Motion mode, for novelty without choosing.
- This week: plain totals, "No target line", no streaks.

**Must-fix**
1. When Vary is tapped mid-session, say so in the felt as a one-line toast: "Vary: from your next session, a different noise bed each time." Right now the tap does nothing visible.
2. Take 5 must read as a break, not a restart. Status "Five minutes off.", felt "Back in 5 min", and the timer chip "Break, 5 min". Not "Tucking in…" / "Just started" / "No timer".
3. Use the top half while playing. Move the focal time or the Round line up, or show the weekly line there. Anything quiet that rewards a glance.
4. On first run, show the "phone doesn't tell apps" note *after* the first session (or under the indicator as a one-time tooltip), not above the arrival question.

---

## Seat 2: Dev, programmer in deep work (8.0)

> This is the one I'd keep. The spec card is great: "14 Hz, L 200 Hz · R 214 Hz, Carrier 207 Hz: the pitch both tones sit around", fades "even in dB", "Focus · built-in v1.0 · unchanged", and the envelope drawn. The editor has a numeric field with the range and step written out, noise level in % *and* dB (25 % · −24.1 dB), and a fixed Save. Saving says "frozen... including across updates". The share card carries a `?layer=14,207,brown,25,drift,1,Focus` link with just the numbers. Enter, Esc and the arrows work, and the focus ring is visible. The private log exports CSV and JSON.
>
> Nits that matter to me. The spec card says "Level: Medium (0.28)". 0.28 of what? Give me dB like the noise row. The editor's dB uses a hyphen ("-24.1 dB"), not a minus sign. When I open a shared link, the card says "Library, 10 Hz, pink", but the readout and Start sound underneath still say Focus 14 Hz. So I can't preview the shared layer before saving it, and if I hit Start I get the wrong layer. And the blind comparison has a leak (see bugs) that makes my n-of-1 data worthless.

**Loves**
- The spec card: exact L/R, carrier explained, the fade law, version and "unchanged", the envelope.
- The editor: typed Hz with stated range and step, % and dB, an opaque header, a sticky Save.
- Share: the numbers only, with a deep link and a privacy line.
- The keyboard model and the visible focus ring. The Prototype controls sit beside the phone on desktop.
- "Saved layers are frozen."

**Must-fix**
1. Show Level in dB on the spec card (and in the editor), e.g. "Medium · −11 dB under full scale". Drop the bare 0.28.
2. Shared-link Home: make the layer panel show *and play* the shared layer (add a "Try it" / Start sound for it) before Save. Today Start plays the previous layer.
3. Fix the blind-comparison leak (bug 1). It's a trust bug, not cosmetic.
4. Use a true minus (U+2212) in dB labels.

---

## Seat 3: Sam, autistic and sensory-sensitive (7.5)

> Pin one layer to Home is the thing. I pinned Calm, and Home now says "Your layer is ready. Calm · 10 Hz. Pinned. It plays exactly as saved." There's no question and no chips. The Lock Screen widget starts it. Sensory mode is one switch: the greeting goes, the text is literal ("Starting. Fading in over 15 seconds."), Full is hatched with "Ceiling: Medium. Change it in Settings." Settings tells me my live Reduce Motion and Reduce Transparency state. Headphone problems are now one calm pill and a sheet with one sentence and one fix. Nothing collides any more. No red, no exclamation marks.
>
> Still a few things. After I stop, the felt keeps saying "This is what we play when you pick Scattered. It isn't a treatment." That's a stale line under an idle layer. It also showed up during a keyboard-started session instead of the time. In the ear check, the Mono verdict has a link that says "Mono Audio is off". Is that telling me it's off, or a button for "I've turned it off"? I need literal. In Sensory mode the felt shows "Under a minute" while the status line says "Fading in over 15 seconds", which is two time statements at once. And the "Tuck" line in place of the greeting, above "Layer: Focus", reads like a heading for nothing.

**Loves**
- Pin one layer to Home, startable from the Lock Screen.
- The Sensory ceiling with a literal explanation, and the locked option's accessible name.
- One-line headphone pills that open a sheet with one sentence and one fix. No collisions.
- The live Reduce Motion / Reduce Transparency status in Settings.
- The fade lengths are stated in words everywhere.

**Must-fix**
1. Clear the "It isn't a treatment" line from the felt when the session ends. Show it only on the first play, then replace it with the time.
2. Rename the Mono verdict link to "I've turned Mono Audio off, check again".
3. In Sensory mode, show one time statement during the fade-in, not two.
4. In Sensory / Plain mode, drop the stray "Tuck" line, or style it as the app name in the indicator row, not as a heading.

---

## Seat 4: Priya, longevity and sleep optimizer (7.5)

> Now we're talking. At 21:00 the UI turns warm and dark, and the Start button is an outline, not a white slab in my face. Heavy-eyed shows "Evening descent: 8 Hz easing to 2 Hz over 30 minutes, then 15 quiet minutes and silence", and the chip says "Ends after 45 min". The spec card draws the descent dashed over the level and fades out over 60 s. While it's playing, the status reads "Evening descent 8 Hz · Easing". One daily schedule is free. With the log on, the next morning asks "How did you sleep? Last night: Focus. One tap, kept on this phone." That's my N-of-1 loop, without a wearable.
>
> But the schedule's time field is clipped ("09:30 PI"), which looks cheap in exactly the screen I'd set once and trust. Health (mindful minutes) is Plus-only. I'd pay, but it's the integration that proves the app belongs in my stack. The morning note asked about "Focus" because I'd played Focus at 21:00. I'd want it only after Sleep-type layers, or to say which layer and when. And I can't see my sleep notes next to the layer in This week's chart.

**Loves**
- Warm, darker Dim wool, with an outline primary at night.
- Evening descent: drawn, timed, honest copy.
- One free daily schedule.
- The morning sleep note, opt-in and local.
- The Plus page is upfront: reminder 3 days before charge, cancel in two taps.

**Must-fix**
1. Fix the clipped time input in Settings → Schedule (bug 6).
2. Morning note: show the layer *and* the time ("Last night: Evening descent, 21:30, 45 min"), and only ask after sessions that started after 18:00.
3. On This week, put sleep notes beside the evening sessions (Well · OK · Poorly per night).
4. Consider one free Health write (mindful minutes) and keep the history and analysis in Plus. Integration is a trust signal, not just a feature.

---

## Seat 5: Leo, student (7.5)

> Cycles: 25 on, 5 off. That's my Pomodoro, built in and free. During the break the felt says "With you for 25 min · Round 1 of 4 · break, back to Medium after 5 min", and the level visibly drops to Quiet. The ear check is still the best one I've seen. "Neither" gives me real help ("Check the left earbud is in… Play it a little louder"). Swapped gets fixed for me. Long focus says "At 40 Hz the beat is faint. Most of what you hear is texture", which is honest about the 40 Hz gamma thing every YouTube video sells me. The weekly total sits on Home ("Tuck kept you company for 10 min this week").
>
> Two things. During a Cycles break the big status still says "Tucked in.", which should say break. And after a plain 25-minute timer, Take 5 put me back in what looks like a fresh session: "Tucking in…", "Just started · Five minutes off…" and "No timer". I couldn't tell if my break would end. I'd also like a "keep going" option after Take 5 that restarts the same timer in one tap.

**Loves**
- Cycles 25/5 with Quiet breaks and one chime, drawn on the envelope.
- The ear check: Neither guidance, louder replay, the swap fix.
- Honest 40 Hz copy.
- Weekly total on Home, no streaks.
- Free covers everything I need.

**Must-fix**
1. Fix the Take 5 state (bug 2).
2. During a Cycles break the status line should read "Break, 5 min" ("Five minutes off." in warm copy), not "Tucked in."
3. After Take 5's chime, offer "Another 25 min" as one tap.

---

## Seat 6: Hannah, the skeptic (7.5)

> The "What we know" page is still the best thing in this category. "Evidence last reviewed 10 October 2026." Each study card says what it found, not what they hoped, with Benefit, No effect, Negative and Mixed tags and DOI links, including the Klichowski result that beats made a task worse. "What does this do?" lands on the matching paragraph. The carrier is explained in one line. The blind comparison is free now, and "n is small and one good day can tip it. Treat it as a hint, not a finding" is exactly right.
>
> And then it breaks the blinding. I ran layer B, stopped, and the "How was layer B?" screen showed the idle layer panel with "Noise only · brown 25%" and an all-grey stitch. So I know B was noise only *before* I rate it. That's the one thing a blind test must never do. Also, the comparison page says "Average of your taps: 3 good, 2 same as usual, 1 not for me." above "0 notes, 0 plays". I read that as data. It's actually the scoring legend. In a self-experiment tool, a legend that looks like results is a serious problem. Fix those two and I'd move to 8.5 and tell my colleagues.

**Loves**
- "What we know": dated, plain, with null and negative results, and the medical disclaimer in the right place.
- The six studies with direction tags and live DOIs.
- The free blind comparison, with an honest small-n caveat and CSV export.
- "Noise only" on every layer, and the spec card for noise only ("No beat is playing").
- Banned words respected everywhere I looked. No "boost", no "unlock".

**Must-fix**
1. Keep the blinding until the reveal (bug 1). After a blind session, the idle readout and stitch must show something neutral, like "Blind comparison · Focus", not the condition.
2. Rewrite the legend so it can't read as data: "Scoring: Good = 3, Same as usual = 2, Not for me = 1." Show "Average: –" until there are notes.
3. Show the per-layer averages and n in the result only once both layers have at least one note. Keep the "hint, not a finding" line.

---

## Functional bugs

| # | Severity | Bug | Where / repro |
|---|---|---|---|
| 1 | **High** | **The blind comparison unblinds itself after a session.** After stopping a blind session, the idle layer panel shows the condition ("Noise only · brown 25%" and a mono stitch), on the same screen as "How was layer B?". Home also stays in noise-only state for the next normal start. | Menu → Blind comparison → Start → Start Focus → Skip ahead → Stop (`r2-council-blind-03-blind-end.png`) |
| 2 | **High** | **Take 5 looks like a new session.** The status says "Tucking in…", the felt says "Just started · Five minutes off…", and the timer chip says "No timer" during a 5-minute break. | Timer 25 → Start → Skip ahead → wait for end → Take 5 (`r2-council-take5-01-take5.png`) |
| 3 | Medium | **The blind-comparison legend reads as data.** "Average of your taps: 3 good, 2 same as usual, 1 not for me." is shown with 0 notes, 0 plays. | `Pages.tsx:770`; `r2-council-blind-01`, `-04`, `-05` |
| 4 | Medium | **The shared-layer card doesn't drive the layer panel.** The card shows "Library, 10 Hz, pink", but the readout and Start sound underneath are the previous layer (Focus 14 Hz). There's no way to hear it before saving. | `?layer=10,180,pink,30,hold,1,Library` (`r2-council-sharedcard-00-shared.png`) |
| 5 | Medium | **A stale "It isn't a treatment" line stays in the felt after Stop** (idle), and it replaces the elapsed time in a keyboard-started session. | Enter to start, Esc to stop (`r2-council-kbd-03-esc-stop.png`) |
| 6 | Low | **The schedule time input is clipped** ("09:30 PI"). | Settings → Schedule (`r2-council-rating-00-log-on.png`) |
| 7 | Low | **A Cycles break still says "Tucked in."** in the status line. Only the felt mentions the break. | `r2-council-timer-05-break.png` |
| 8 | Low | **Vary gives no feedback** when tapped mid-session (it applies next session, silently). | `r2-council-home-06-vary.png` |
| 9 | Low | **The swapped headphone route shows no swap mark on the readout.** The mark only appears for `prefs.swapChannels` from the ear check, but the Headphones sheet says "Tuck swaps them for you". | `__tuck.ui.set({headphone:'swapped'})` (`r2-council-route-swapped-00-idle.png`) |
| 10 | Low | **Ambiguous Mono verdict link** "Mono Audio is off": its action is unclear. | Ear check, Both / Both (`r2-council-onbmono-00-mono-verdict.png`) |
| 11 | Low | **The spec card's Level shows a raw gain** ("Medium (0.28)") with no unit. The editor uses a hyphen-minus in "-24.1 dB". | Spec card, editor |
| 12 | Low (prototype) | **The simulated clocks ignore `?hour=`.** The Lock Screen and desktop status bar show the real time (01:36) while Home says "Morning.". | Menu → Lock Screen at `hour=10` |
| 13 | Low | **Two time statements in Sensory mode during the fade-in** ("Starting. Fading in over 15 seconds." and "Under a minute"). | `r2-council-sensory-02-sensory-playing.png` |

## Round-1 must-fixes: verified in this build

Verified as fixed in the screenshots: toasts sit in the felt, the headphone pills no longer collide, Too much defaults off, Evening descent shows "Ends after 45 min" with the descent drawn, Cycles, the Neither guidance and Louder, the swap verdict, Long focus copy, the free blind comparison, the studies with DOIs, the editor's opaque header and sticky Save, "under a minute", the sample-data label, Pin to Home, the Sensory ceiling copy, Lock Screen "Playing, no timer", the morning sleep note, one free schedule, and share links. Not verified here: audio-level behaviour (dB fades, loudness-matched colours, chime level), which needs listening, not screenshots.

## What would move the mean to 8.5+

1. Fix bugs 1–4. The blind leak and Take 5 are the two that cost trust.
2. Give the playing state's top half a quiet job (Maya), and make breaks read as breaks everywhere (Leo, Maya).
3. Level in dB, and shared links that play before saving (Dev).
4. One free Health write and sleep notes beside evening sessions on This week (Priya).
