# Round 1: response and changes

**Date:** 10 Oct 2026 · **Build:** `prototype/dist/index.html` (single file) · **Core tests:** 168 passing (162 before, plus 6 for the new fade curve and RMS noise)
**Inputs:** `round-1-council.md` (six personas, mean 7.0) and `round-1-experts.md` (four experts, mean 6.9).
**Method:** every bug was reproduced and fixed. Every must-fix was either built, or decided against with a reason below. Every flow in `prototype/SCREENS.md`, plus the timed ones (ear-check verdicts, cycles, Take 5, the morning sleep note, the blind comparison, every headphone route), was captured with Playwright waits at 390×844 @2x and viewed. No console or page errors.

## How conflicts were resolved

Brand principles decide: simplicity, one primary action, sensory calm, honesty about the science.

| Conflict | Call | Why |
|---|---|---|
| Maya wants a focal animation while playing; brand §10 says "still by default" and "never draw the beat". | The felt now shows **the stitch, the time with you, and the timer**. The stitch's gap is the beat as a distance (wider for a faster beat), and it **glides only when Drift moves the beat** (once a minute, over 60 s). Hold is completely still. No pulsing, nothing near the beat rate. Off in Sensory mode and Reduce Motion. | Motion only when sound changes keeps "motion and sound are one event" true, and gives Maya something alive to rest on. |
| Maya's pull-up "ritual" vs brand "nothing moves on launch". | No idle nudge animation. The ritual is in the gesture itself: as you pull, the lining brightens, the stitch halves close, and the line changes to "Let go to start sound". Start sound stays. | The first motion still comes from the user. |
| Dev wants a one-tap rating; brand §7 says no rating unless opted in. | A **private log**, off by default, offered once on This week and in Settings. When on: one tap after a session (Good · Same as usual · Not for me) and a morning sleep note. CSV and JSON export. A blind comparison turns rating on for its own sessions. | Nobody is asked to rate unless they chose to. Dev and Priya find it where they look. |
| Hannah wants the blind comparison free; Growth wants it as the Plus hero. | A **basic comparison is free and works**: one layer, beat vs noise only, A/B randomised and balanced on the phone, numbers hidden, one-tap notes, a result with "n is small" and a CSV. **Plus** sells "Your own evidence": four-week runs, your own two layers against each other, sleep notes in the result, a PDF. | Trust first. The free version proves the idea, and Plus deepens it rather than gating it. |
| Priya wants schedules free; Plus needs a reason. | **One daily schedule is free.** More schedules stay in Plus. | Priya's core loop works without paying. |
| Growth wants body doubling ("working alongside"). | **Not built.** Specced as a P2 experiment (spec §2, row 30) to the brand §14 privacy standard. | A live count needs a server and a privacy design. Adding it now would be clutter and an unkept promise. |
| Banners: the brand table has one sentence plus a fix for each headphone state, but they collided with the layer. | Each state is now a **one-line pill** above the status line ("Mono Audio is on, so noise only ›"). The pill opens a Headphones sheet with the full brand sentence and its fix. "Open Settings" and "Show me how" reveal the steps inline, not as toasts. | Calm and short on Home. The literal sentence is one tap away. |
| Sam's pinned "Steady mode" vs the arrival question. | Settings → **Pin one layer to Home**. Home then shows only that layer, with no question and no chips, and the Lock Screen widget starts it. | It's a separate switch, so the default Home is unchanged. |
| Dim wool palette (brand §8) vs Priya's "warmer and darker". | Dim wool is **warmer and darker** (amber grey, bg `#15120F`). It's on from 21:00 for every layer and from 18:00 for Sleep. **The primary button is an outline at night**, never a bright fill. Contrast is 6.9:1 for ink and 3:1 or more for control edges. `brand.md` §8 and `tokens.json` are updated. | Her request fits the brand's own 40 cd/m² target. |
| Drift: the brand says "beat and noise wander", but only the beat did. | Implemented: the noise level now wanders ±1 dB on its own seed. Noise-only layers therefore have a real Drift, described on the spec card. | The code now matches the copy. A noise-only layer needs its own Drift line anyway. |
| Toasts: designer says dock them above the handle; Sam says they follow you. | Toasts now live **inside the layer's felt**, in place of the focal line, so they can never cover text. Opening any sheet, page or the spec card dismisses them. The sample-week and Settings toasts were removed (both are labelled inline now). | There's no free space above the handle at Full, but there always is in the felt. |

## Bugs (all fixed)

| # | Bug | Fix |
|---|---|---|
| 1 | Stop summary rounded up ("0 min" then "1 min") | `elapsedWords()` never rounds up: "Set down after under a minute." While fading in, the felt says "Just started". (`tuck/copy.ts`) |
| 2 | Save sheet pre-ticked "Play this when I pick Too much" | Defaults to off and shows what Too much plays now ("Too much plays Steady now."). (`screens/Sheets.tsx`) |
| 3, 4 | Headphone and call banners pushed the heading and chips under the layer | One-line pills plus a sheet. If idle content still needs room (a notice plus the chips), the idle layer sits lower: a ResizeObserver measures it, so nothing is ever cut off. (`screens/Home.tsx`) |
| 5, 18 | Toasts covered text and followed you into sheets | In the felt; dismissed by any sheet or page (`ui/state.ts`). |
| 6, 29 | Floating "Full —" / "Medium —" labels; ArrowUp seemed to do nothing | Labels removed. The selected segment has a 2 px ink outline and bold text, so ↑ / ↓ visibly move it. |
| 7 | Evening descent said "No timer" | The timer chip says "Ends after 45 min", and the Timer sheet explains the arc. The spec card draws the beat's 8 → 4 → 2 Hz descent (dashed) over the level. |
| 8 | Drift on noise only was meaningless | Noise-level wander (±1 dB), described as such. |
| 9 | Ear check "Neither" showed only "Not heard" | Immediate guidance ("Nothing on the left. Check the left earbud…"), plus **Play it a little louder** and Use noise only. |
| 10, 20 | Lock Screen "Your audio · Paused" when nothing was paused | The other app's player only appears when it's playing. Tuck's card says "Playing, no timer", or "Playing under your audio" when something is above it. When idle, a widget starts the pinned or last layer. |
| 11 | "Arriving differently?" showed no selected chip but a Focus line | The chip for the current layer is selected, and the line always describes what will actually play. Chip hover is a fill, not an outline that looks selected. |
| 12, 19 | Editor title clipped under a transparent header; Save below the fold | `PageShell` has an opaque header. On scroll, the title moves into it with a hairline (on every page). Save is a fixed footer. |
| 13 | First-view explainer never went away | Dismissed on the first Start. Never shown while playing, at session end, or in Sensory mode. |
| 14 | Swapped route still showed L 200 / R 214 with no sign | A swap mark on the readout, an accessible name ("channels swapped for your headphones"), and a line in the Headphones sheet. |
| 15 | Skip → noise only, but the line claimed a beat | `playsLine()` describes the layer as it will play: "That's Focus, as noise only: soft brown noise, no beat." |
| 16 | A passing ear check never cleared `swapChannels` | `ok` sets `swapChannels: false`. A comment explains that the check deliberately bypasses the swap router. |
| 17 | The prototype's noise gain was linear | `noiseGain()` = `volumeToGain(v) × NOISE_HEADROOM`, as in core and native. The editor's label uses the same law (25 % = −24.1 dB). |
| 21, 22 | "0 min" during fade-in; "1 min" after 1 s | See 1. |
| 23 | Sample week not labelled on the page | A "Sample data, from Prototype controls" pill under the heading, and "Sample data." on Home's weekly line. |
| 24 | "Evening." at 00:39 | No greeting from 00:00 to 04:00 (the line reads "Tuck"). |
| 25 | Take 5 chime fixed at −24 dBFS | Scaled to the level (about 6 dB above the tones; about −32 dBFS at Quiet), with a 40 ms attack. Cycles use the same chime. |
| 26 | Ear-check tone at about −16 dBFS | Now about −24 dBFS (volume 0.355). "Louder" is about −19 dBFS. |
| 27 | Noise colours peak-normalised (about 5 dB apart) | Core `generateNoise` has an `rms` option. The prototype sets per-colour RMS targets measured with BS.1770 K-weighting (white 0.105, pink 0.157, brown 0.18), so the colours are about equally loud. The native streams are scaled to the same RMS. |
| 28 | Linear-amplitude fades | Core `rampFade` and the engine option `fadeCurve: 'perceptual'`: linear in dB from −40 dB, with a ≤ 50 ms linear step from silence. The prototype tones and noise both use it. The native renderers map their fade ramp the same way (`perceptualFade`). The lining's opacity follows a matching ease-in or ease-out curve. |
| 30 | Band names on the spec card | Removed. The carrier is explained instead: "Carrier 207 Hz: the pitch both tones sit around." |
| 31 | Native namespace still `app.tealight` / `Tealight` | Renamed to `app.tuck.layer` and `native/ios/Tuck`. No references remain. |
| 32 | Drift moved only the beat | See "Drift" above. |
| — | Found while testing: the session-end view crashed when it animated out after the end line had cleared | It keeps the last ending through the exit animation. |
| — | Found while testing: the noise loop was 8 s | Now 30 s, with a 0.5 s equal-power loop crossfade. A 2 h session repeats each grain about 240 times instead of 900. |

## Must-fix items, by reviewer

**Maya (ADHD).** The explainer is shown once ✓. The focal felt shows elapsed time big at a glance ✓ ("Just started", then "12 min"; compact at Quiet). **Vary** is a third Motion option: Drift plus a different noise bed each session, chosen within the layer's character, with "Vary: pink noise today." under the name ✓. Hold remains for sameness. The pull ritual gives live feedback ✓. Starting without opening the app: the Menu has a **Start without opening Tuck** sheet (Control Center / Quick Settings, a "when Spotify opens, start Focus" automation, Siri, the Lock Screen widget), and it's suggested once after the first session ✓.

**Dev (programmer).** The numbers agree ✓. The detent labels are gone ✓. The private log with CSV/JSON export works ✓. The editor has an opaque header, a sticky Save, and "0.5–45 Hz on the slider, steps of 0.1 Hz. Type any value from 0.5 to 45 Hz." ✓. Drift on noise only ✓. The **Share** card shows exact numbers and has a deep link ✓.

**Sam (sensory).** Too much defaults off ✓. No collisions: pills, the felt for toasts, and a self-shortening idle layer ✓. The explainer and floating labels are gone in Sensory mode ✓. **Pin one layer to Home**, startable from the Lock Screen ✓. Settings states the live Reduce Motion and Reduce Transparency status, and Reduce Transparency removes the texture, the blur and the see-through scrims ✓. The Sensory status line is 20 px sans ✓. Hatched Full says "Ceiling: Medium. Change it in Settings." in the felt, with an accessible name that matches ✓.

**Priya (sleep).** "Ends after 45 min", with the descent drawn ✓. Warm Dim wool with an outline button ✓. **One daily schedule** (Settings → Schedule: time and layer, "Next: today at 21:30, Evening descent"). It fires while the prototype is open, and "Run the schedule" is in Prototype controls ✓. Lock Screen fixed ✓. **Morning sleep note** (log on): "How did you sleep?" Well · OK · Poorly · Skip, the morning after an evening session, listed on This week ✓.

**Leo (student).** The timer has **Cycles: 25 on, 5 off**: 4 rounds, breaks at Quiet, one soft chime back. It's drawn on the envelope, shown as "Round 2 of 4" in the felt and on the Lock Screen, and Skip ahead jumps to the next change ✓. "Neither" gives guidance immediately ✓. The weekly total stays on Home, and toasts can't cover it ✓. **Long focus** sits in the main picker list with "At 40 Hz the beat is faint. Most of what you hear is texture." ✓.

**Hannah (skeptic).** The blind comparison works ✓. "What does this do?" opens What we know at the matching paragraph (beat or noise) and highlights it ✓. The carrier is explained in one line, on the card and on the page ✓. All six studies have live DOI links (each checked against the publisher or PubMed). The Prasad and Elnazer entries were corrected to match the papers (Prasad compared music with a sedative, not with silence; Elnazer is a single-author 2026 review). "Last reviewed 10 October 2026" ✓. "It isn't a treatment" now appears on the first play of the preselected layer, not only when a chip is tapped ✓.

**Designer.** The empty felt now holds the stitch, the time and the timer, and the lining fade has a matching curve ✓. The detent labels are gone ✓. Toasts are in the felt ✓. The editor header and footer are fixed ✓. The explainer goes after the first Start ✓. "Just started" ✓. "Under a minute" ✓. The Settings, This week, Plus, mixing and editor headings are 31 px weight 500 ✓.

**Accessibility.** Ear check at −24 dBFS, with Louder ✓. The ceiling is explained, and the locked option reads "Full, unavailable, ceiling is Medium" ✓. The Sensory status is 20 px sans ✓. The skip line and the Lock Screen are fixed ✓. The selected segment has a 2 px ink outline. Chip and track borders use a new `edge` token (night 3.9:1 on Loden and 3.3:1 on Felt, day 3.3:1, dim 3.5:1) ✓. The sample-data label is on the page ✓. Delete moved from the picker to the saved layer's spec card ✓.

**Audio engineer.** The noise gain law ✓, loudness-matched colours ✓, dB fades in core, prototype and native ✓, the swap reset ✓, a 30 s loop ✓, the scaled chime ✓, no band labels, and honest 40 Hz copy ✓. Also: the noise wanders under Drift ✓, and the native rename ✓.

**Growth.** Onboarding 1 now lists what Background Sounds doesn't do ("Binaural beats with exact numbers, or noise only. Layers for focus, calm and sleep, with timers that fade out. The same on iPhone and Android.") ✓. Shortcuts / App Intents, the automation recipe, the Control Center / Quick Settings tile and the Lock Screen widget moved from P2 to **P1** in `product-spec.md` (row 25), with the in-app sheet and the post-session suggestion ✓. Body doubling is a P2 experiment (see above). The Plus hero is "Your own evidence" ✓. The shareable layer card has a `?layer=` deep link, carrying the numbers only ✓. Activation and north-star definitions are in `product-spec.md` ("Activation and the north star") ✓.

## Still open (deliberately)

- The in-prototype schedule fires only while the page is open. On a phone it's an OS notification or automation. The free basic comparison stores its state in local storage only.
- Native engines: the renames, the dB fade mapping and the loudness-matched noise are written but not compiled (the native folder is reference code). The prototype's noise wander and Vary have no native port yet.
- Core's `fadeCurve` defaults to `'linear'` so existing callers and tests keep their behaviour. The prototype and native use the perceptual curve. Making it the core default is a one-line change once the native ports are compiled and listened to.
