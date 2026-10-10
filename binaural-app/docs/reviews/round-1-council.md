# Customer council, round 1: Tuck prototype

**Date:** 10 Oct 2026
**Build:** `prototype/dist/index.html` (fresh `npm run build`, single-file, 760 kB)
**Method:** I captured every screen in `prototype/SCREENS.md` at 390x844@2x with `tools/shoot.mjs`. The timed flows (all ear-check verdicts, timer end and Take 5, 21:00 evening, phone call, app takeover, other app playing, every headphone route, keyboard) used a short Playwright script. The screenshots are in `.shots/r1-council-*.png`, and every one was viewed. No console errors or page errors appeared on any run. Six seats reviewed independently, each in their own voice, against `docs/personas.md` and `docs/brand.md`.

Scale: 10 = "I'd love this and tell friends". 8 = "good, I'd keep it". 6 = "I'd try it, but it would probably get deleted".

## Scoreboard

| Seat | Persona | Score | One-line verdict |
|---|---|---|---|
| ADHD knowledge worker | Maya | **7.0** | One tap to sound, no guilt. The copy is lovely, but Home is too wordy and the session is too static to hold me past week two. |
| Programmer in deep work | Dev | **7.5** | Finally an app that shows L/R Hz and a fade envelope. I want keyboard-first control, export and the n-of-1 mode in the free tier. |
| Autistic / sensory-sensitive | Sam | **6.5** | Sensory mode and the level ceiling are right. But warnings overlap the text, a toast covers content, and saving a layer silently re-maps "Too much". |
| Longevity / sleep optimizer | Priya | **6.5** | Evening descent is exactly my protocol, but it says "No timer" while describing a 45-minute arc. There are no schedules or Health in the free tier, and no next-day reflection. |
| Student | Leo | **7.0** | The ear check is the best I've seen and it's free. There's no Pomodoro loop, and the weekly total is buried in a menu. |
| Skeptic | Hannah | **7.5** | The "What we know" page is honest and good. The blind comparison, the thing that would win me, is "Not available". |
| **Mean** | | **7.0** | Strong foundations and an unusually trustworthy voice. Layout collisions and a few state bugs hold it below "I'd keep it". |

---

## Seat 1: Maya, ADHD knowledge worker (7.0)

> I opened it and it asked "How are you arriving?" with Scattered already picked. That's kind of perfect. I didn't have to choose anything. One big **Start sound** button and it's going. Nobody asked for an account, there was no quiz, and there was no paywall. "Nothing to keep up with" and "There are no streaks" on This week made me exhale. The "It isn't a treatment" line is fine. It doesn't make me feel broken.
>
> But the top third of Home is a paragraph about my phone not telling apps what I'm listening to. I read it on the first screen, and it was still there on every screen after that, including while playing, after stopping, and in Sensory mode. That's prime space spent on a disclaimer. Once sound is playing, the layer panel is a big empty felt rectangle with a dashed line. I want *something* slow happening there (the brand promises "motion and sound are one event"), or at least the session time big enough to glance at.
>
> Novelty: Drift is "±0.5 Hz over 10 min". I won't notice that. By week two I'll be bored of the same brown noise. "Same as last time?" is nice for a restarter, but I'd like a "surprise me within Focus" option.

**Loves**
- One tap from launch to sound, with no account, quiz or paywall.
- Arrival chips with a preselected default, so there's no decision fatigue.
- No streaks, and This week says so plainly. The copy never scolds.
- "Same as last time?" for returning, with "Arriving differently?" as an escape hatch.
- Take 5 after the timer ends: rest framed as part of the system.

**Must-fix**
1. Show the "Your phone doesn't tell apps…" explainer **once** and auto-dismiss it after the first session or first Start. Right now it persists on every Home state and crowds the hierarchy.
2. Give the playing state a focal element. The panel is roughly 40% empty felt. Show a slow, breath-paced stitch shimmer tied to the actual drift/beat (off in Sensory and Reduce Motion), and make elapsed time readable at a glance.
3. Add variety without choice: a "Vary it" option (noise colour or texture rotates between sessions within the same intent), and keep Hold for those who want sameness.
4. Session start ritual: "Pull the top edge up" is a nice idea, but it's only a hint line. Make the pull gesture visibly satisfying (the panel rises with sound) and keep the button.

---

## Seat 2: Dev, programmer in deep work (7.5)

> The spec card is the best thing in the app: **14 Hz**, L 200 / R 214, carrier 207, "beta range *(descriptive)*", noise brown 25%, level Medium (0.28) with ceiling Full, Drift ±0.5 Hz over 10 min, fades 8 s / 20 s, "built-in v1.0 · unchanged", plus an envelope graph. That's an honest instrument panel. "Edit a copy" with an exact-Hz field, noise dB and "Saved layers are frozen… including across updates" is exactly the versioning contract I want.
>
> Keyboard works: Enter starts, Esc stops, and arrows change the level. Good. But the arrow-key level change only shows up as floating "Full —" / "Medium —" labels on the right edge of the top area, which look like stray debug text, and the segmented control didn't visibly change while it was fading in.
>
> On a 5-second session, the playing line said "With you for 0 min" and then the stop screen said "Set down after 1 min". Small, but I notice when numbers lie. The n-of-1 / blind comparison is what would make me evangelize, and it's Plus-only and "Not available in this prototype".

**Loves**
- The spec card: exact Hz, carrier, level as a number, fade envelope, and version plus "unchanged".
- Built-ins are immutable, with "Edit a copy". Saved layers are frozen across updates.
- An exact numeric beat field plus noise level in dB.
- The plain "How Tuck plays under your audio" page, which explains what Tuck can't see.
- Keyboard shortcuts and visible focus rings.
- No account and no tracking language.

**Must-fix**
1. **Numbers must agree.** The stop summary uses `Math.max(1, minutes)` (`tuck/copy.ts:96`), so "Set down after 1 min" follows "With you for 0 min". Show seconds under a minute ("Set down after 40 s"), or use the same rounding everywhere.
2. Replace the floating "Full —" / "Medium —" detent labels with a clear state change on the segmented control. Right now they read as stray text and overlap banners (see the bugs).
3. Put a lightweight n-of-1 in the free tier: a one-tap rating after a session, with a local CSV/JSON export. The blinded A/B can stay in Plus, but it has to exist.
4. Editor polish: when "More" is expanded, the "Copy of Focus" title scrolls under the sticky header and is clipped. Show the exact-Hz range and the step size next to the field.
5. Explain or hide Drift on noise-only layers. The noise-only spec card still lists "Drift · ±0.5 Hz over 10 min", which means nothing without a beat.

---

## Seat 3: Sam, autistic / sensory-sensitive (6.5)

> Sensory mode is close to right. One switch turned on Plain labels and turned off the greeting and the arrival question. Full is hatched and locked as a ceiling, and it fades in over 15 seconds ("Starting. Fading in over 15 seconds."). Literal language. No confetti. I like that I can see the exact numbers, because that's predictability.
>
> But three things would make me uninstall:
> 1. **I saved a copy of Focus as "Desk". The "Play this when I pick Too much" box was already ticked.** Now "Too much", the thing I'd press during overload, plays a 14 Hz beta beat instead of Steady. I never chose that. That's my sound changing without me deciding.
> 2. **Things overlap.** When a headphone warning appears while playing, the "Tucking in…" heading slides under the layer panel and gets cut in half. The "Full —" label sits on top of the "Use noise only" link. On the phone-speaker idle screen, the arrival chips disappear behind the panel. The "Saved as Desk" toast sits over the "It isn't a treatment" line and follows me into the picker, covering a row. Visual collisions are exactly the chaos I'm trying to get away from.
> 3. The disclaimer card stays on Home even in Sensory mode, so there's more text than I need.

**Loves**
- Sensory mode is one switch that does the right bundle (plain labels, no greeting, no question, still screen, ceiling).
- The level ceiling is shown as a locked, hatched segment.
- A longer fade-in, literal status lines and no sound on launch.
- "It won't change unless you change it." Saved layers are frozen.
- Headphone warnings are calm, never red, with one sentence and one fix.

**Must-fix**
1. **The "Play this when I pick Too much" checkbox must default to OFF** (`screens/Sheets.tsx:209`, `useState(first)`). If it stays, show what it replaces ("Too much currently plays Steady").
2. Fix the layout collisions: make banners push content in a scrollable region rather than under the layer panel, and keep the status heading and chips fully visible. Keep toasts clear of content and dismiss them on navigation.
3. In Sensory mode, hide the "Your phone doesn't tell apps…" explainer and the floating level labels.
4. Add a "lock this layer" option that pins Home to one saved layer with no arrival question: the "Steady mode" from the personas, startable from the lock screen.
5. Respect the system Reduce Motion and Reduce Transparency settings, and say so in Settings.

---

## Seat 4: Priya, longevity / sleep optimizer (6.5)

> The aesthetic is right. It feels like Aesop or Oura, not a 2012 meditation app: dark loden, serif headline, apricot lining. At 21:00 "Heavy-eyed" gave me **Evening descent**: "8 Hz easing to 2 Hz over 30 minutes, then 15 quiet minutes and silence." That's my protocol, and the UI dims the Start button for night.
>
> But the timer chip right under it says **"No timer"**. Which is true? If it ends after 45 minutes, show "Ends at 21:45". The night UI is only slightly dimmer. I want warmer and darker, with the numbers still readable. Schedules, Health mindful minutes and sync are all Plus, and all "Not available". For me the schedule *is* the product. I'd pay, but I need to see it work. The lock screen mock shows "Your audio · Paused" next to Tuck playing, which made me think Tuck had paused my audiobook.

**Loves**
- Evening descent as a real arc (8 → 2 Hz, then quiet, then silence), offered automatically in the evening.
- Timer sheet with 25/50/90/custom, a 20-second fade-out, "no countdown", and remembered per layer.
- The Live Activity / Lock Screen card with big Hz and Stop.
- An honest science page, which is a premium signal.
- Tuck Plus terms: "remind you 3 days before any charge, cancel in two taps".

**Must-fix**
1. Layers that have a built-in end must show it: replace "No timer" with "Ends after 45 min" and draw the descent on the spec card envelope.
2. Make the night UI properly dim and warm after a set hour (and in the Sleep layers). Never put a bright cream primary button on screen at night.
3. Ship at least the schedule preview: let me set one daily time in free, or show a working Plus flow in the prototype.
4. Lock screen: don't show "Your audio · Paused" unless something is actually paused. It contradicts "Your audio stays on top".
5. Add a morning reflection: one tap for "How did you sleep?" the next day, kept local, set against last night's layer.

---

## Seat 5: Leo, student (7.0)

> The ear check is sick. Play left, then "Where did you hear it?", Left/Right/Both/Neither, then "Stereo confirmed." "That gap in the stitch is where the beat lives" actually taught me something. "Swapped" says Tuck will fix it for me, and "Both, Both" correctly tells me Mono Audio is on. My cheap earbuds finally get diagnosed.
>
> The free tier is the whole layer. No ads. Love it. But I study in 25/5 Pomodoros, and here the timer only fades out once and offers "Take 5". I want it to loop: 25 on, 5 at Quiet, chime, back up. The weekly total ("Tuck kept you company for 3 h 35 min") is nice, but it's hidden behind Menu → This week, and the Settings toggle "Show weekly total on Home" mostly showed up under a toast in my run. Also "Long focus · 40 Hz" is under More layers. That's the thing I searched YouTube for, so put it somewhere I can find it.

**Loves**
- The ear check flow and its verdicts (stereo, swapped, mono, one side), and that it's re-runnable from Menu.
- Noise-only fallback when skipping or on the phone speaker, explained plainly.
- The free core and no ads. Plus pricing is fair and transparent.
- "Take 5" after the timer.
- The weekly total in hours with no target line.

**Must-fix**
1. Add a Pomodoro loop option to the timer (work/break cycles, the break at Quiet, one chime, and an optional count of cycles).
2. "Neither" on the left tone currently shows only "Not heard" with no verdict or next step. Give the one-earbud / "check connection" sentence and a fix immediately.
3. Make the weekly total visible on Home by default when the toggle is on, and make sure toasts don't cover it.
4. Surface "Long focus (40 Hz)" in search or in the picker header, with honest copy about 40 Hz.

---

## Seat 6: Hannah, skeptic (7.5)

> "What we know, and what we don't." Three plain sections: what's established (the perceptual beat), what isn't (effects on focus, sleep and "syncing"), and that the steadiest evidence is for noise, which is why every layer has a noise bed. "The studies (6)" lists Nigg 2024 with g≈0.25, Garcia-Argibay 2019, Ingendoh 2023 (EEG, null), and labels each one Benefit, Mixed or None. "Each line says what was found, not what we hoped." I could show this to colleagues without embarrassment. "Not a medical device", seizure caution, no "unlock", no "brainwave". Chip copy only describes the design ("a 14 Hz beat over soft brown noise").
>
> What would make me an advocate is the blind comparison, and it's listed as Plus and "Not available in this prototype". Also, "beta range *(descriptive)*" on the spec card is fine, but "Carrier 207 Hz" isn't explained anywhere I could find.

**Loves**
- The "What we know" page, including the null and negative findings.
- Effect sizes and study type on each study card.
- Noise only as a first-class option on every layer ("Add beat" / "Noise only").
- Banned-word discipline throughout. "It isn't a treatment" sits under the chips.
- Honest platform statements ("we only say whether something is playing").

**Must-fix**
1. Make a basic blind comparison free, or at least working in the prototype: A/B sessions randomized locally, a one-tap rating, and a result with an honest "n is small" caveat.
2. Link "What does this do?" on the spec card straight to the matching study paragraph. Explain "carrier" in one line.
3. Make the study links live, with DOIs, and show when the evidence page was last reviewed.
4. Show the same "It isn't a treatment" line the first time the *preselected* Scattered/Focus plays. Right now it only appears when a chip is tapped.

---

## Cross-seat priorities (in order)

1. **Layout collisions:** banners and toasts overlap the status heading, the chips, detent labels and sheet rows. (Sam, Dev and Maya would all bounce.)
2. **Save sheet auto-maps "Too much"** to the new layer. Default it to off. (Sam is a deal-breaker case.)
3. **The audio-indicator explainer persists everywhere.** Show it once.
4. **Numbers that disagree:** "0 min" vs "1 min", "No timer" on Evening descent, Drift listed on noise only.
5. **A working n-of-1 / blind comparison and schedules**, even as a minimal free slice. Hannah, Dev and Priya will pay for these.
6. **A Pomodoro loop** (Leo, Maya) and **variety within an intent** (Maya).
7. **Night mode:** properly dim and warm (Priya).

## Functional bugs found

1. **Stop summary rounds up:** a 2–5 second session shows "With you for 0 min" while playing, then "Set down after 1 min" (`tuck/copy.ts:96`, `Math.max(1, …)`). Repro: `?screen=home`, `[t=start]`, `[t=stop]`.
2. **Save sheet pre-ticks "Play this when I pick Too much"** for the first saved layer (`screens/Sheets.tsx:209`). Saving a copy of Focus makes "Too much" play a 14 Hz beat instead of Steady.
3. **Headphone and call banners push the status heading under the layer panel.** "Tucking in…" is clipped (mono case), the "With you for…" line is hidden (call mode), and the floating "Full —" label overlaps the banner's "Use noise only" / "Open Settings" links (Mono, One earbud, Spatial, Speaker, Swapped, Call mode).
4. **Phone-speaker banner at idle hides the arrival chips:** Heavy-eyed and Just working disappear behind the layer panel.
5. **Toasts overlap content and persist across navigation.** "Saved as 'Desk'…" covers the "It isn't a treatment" line on Home, then follows into the playing state and the layer picker (covering the Evening descent row). "Added an illustrative week of sessions" covers the weekly-total line on Home, the This week chart's day labels and the Menu's Lock Screen row.
6. **The floating level labels "Full —" / "Medium —"** appear in the top area during fade-in or level changes and look like stray text. With ArrowUp during fade-in, the segmented control didn't visibly change.
7. **Evening descent shows "No timer"** while its description says it ends after 30 + 15 minutes.
8. **The noise-only spec card lists "Motion: Drift · ±0.5 Hz over 10 min"**, which is meaningless without a beat.
9. **The ear check "Neither" answer** (left tone) shows only "Not heard", with no verdict sentence, no one-earbud guidance and no fix.
10. **The lock screen mock shows "Your audio · Paused"** while Home says "Nothing else playing". This implies Tuck paused the user's audio, contradicting the brand promise.
11. **"Arriving differently?"** reveals chips with none selected, but the line still says "That's Focus…". The selection state and the description disagree. In the run, Heavy-eyed also showed an outline that looked selected.
12. **The editor's expanded "More" view** scrolls the "Copy of Focus" title under the sticky Cancel header, so it's clipped.
13. **The audio-indicator first-view explainer** ("Your phone doesn't tell apps…") never auto-dismisses. It stays on Home in every state, including while playing and in Sensory mode, where the brand spec says first view only.
14. **Swapped route:** after "Tuck will swap them for you", the readout still shows L 200 / R 214, with no indication that the channels are swapped.

No console errors or page errors were logged on any captured flow.
