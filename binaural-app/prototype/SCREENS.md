# Tuck prototype: how to reach every screen

Build once, then point `tools/shoot.mjs` at the single-file build (it works from `file://`):

```bash
cd binaural-app/prototype && npm install && npm run build
cd .. && U="file://$PWD/prototype/dist/index.html"
node tools/shoot.mjs "$U" .shots/intro                      # writes .shots/intro-0.png …
```

Every run starts with fresh storage, so it opens on onboarding. Add `?screen=home` to skip onboarding and land on the first-run Home, or `?reset=1` to clear saved data. Each extra argument is a CSS selector that `shoot.mjs` clicks, taking a screenshot after each click (`-1.png`, `-2.png` …). `shoot.mjs` waits 700 ms after each click, so fades and timers are caught mid-way. That is intended: the layer rises over 1.4 s and the sound fades in over 8 s.

All navigation controls carry a stable `data-testid`. Below, `[t=x]` is short for `[data-testid=x]`. Type it in full on the command line, for example `'[data-testid=start]'`.

## Onboarding

| Screen | URL | Click sequence |
|---|---|---|
| Onboarding 1: "Your audio stays on top." | `$U` | none |
| Ear check (start) | `$U` | `[t=onboard-check]` |
| Ear check, left tone playing (left stitch half lit) | `$U` | `[t=onboard-check]` `[t=ear-play-left]` |
| Ear check, "Where did you hear it?" | `$U` | `[t=onboard-check]` `[t=ear-play-left]` then wait about 2 s (use a second run: the tone lasts 1.5 s) |
| Stereo confirmed | `$U` | `[t=onboard-check]` `[t=ear-play-left]` (wait 2 s) `[t=ear-answer-left]` `[t=ear-play-right]` (wait 2 s) `[t=ear-answer-right]` |
| Verdicts: Mono / Spatial, One earbud, Swapped | `$U` | as above, answering `[t=ear-answer-both]` twice, or `[t=ear-answer-none]`, or `[t=ear-answer-right]` then `[t=ear-answer-left]` |
| Skip, noise only | `$U` | `[t=onboard-skip]` |

The ear-check answers appear only after the 1.5 s tone has finished, so the sequences that reach a verdict need waits. `shoot.mjs` has no wait step, so use any Playwright script for these, or click through by hand.

## Home and the layer

| Screen | URL | Click sequence |
|---|---|---|
| Home, first run ("How are you arriving?", Scattered preselected) | `$U?screen=home` | none |
| A chip picked, with the "It isn't a treatment." line | `$U?screen=home` | `[t=chip-wound-up]` |
| Playing: rising, "Tucking in…", lining brightening | `$U?screen=home` | `[t=start]` |
| Playing: level Full (detent marks at the right edge) | `$U?screen=home` | `[t=start]` `[t=level-full]` |
| Playing: Hold | `$U?screen=home` | `[t=start]` `[t=motion-hold]` |
| Spec card (the layer flips) | `$U?screen=home` | `[t=readout]` |
| Spec card while playing | `$U?screen=home` | `[t=start]` `[t=readout]` |
| Session end ("Set down after 1 min. Fading out…") | `$U?screen=home` | `[t=start]` `[t=stop]` |
| Layer picker sheet | `$U?screen=home` | `[t=start]` `[t=layer-name]` |
| Timer sheet | `$U?screen=home` | `[t=timer-chip]` |
| Timer end with Take 5 (time-lapse) | `$U?screen=home` | `[t=timer-chip]` `[t=timer-25]` `[t=start]` `[t=nav-menu]` `[t=menu-demo]` `[t=demo-skip]` `[t=sheet-close]`, then wait 25 s for the 20 s fade |
| Noise-only layer (single-colour stitch) | `$U?screen=home` | `[t=readout]` `[t=spec-noise]` `[t=spec-done]` |
| "Same as last time?" (returning) | `$U?screen=home` | `[t=nav-menu]` `[t=menu-demo]` `[t=demo-week]` `[t=sheet-close]` |
| "Arriving differently?" chips | `$U?screen=home` | `[t=nav-menu]` `[t=menu-demo]` `[t=demo-week]` `[t=sheet-close]` `[t=arriving-differently]` |
| Five-intent row ("Ask how I'm arriving" off) | `$U?screen=home` | `[t=nav-menu]` `[t=menu-settings]` `[t=set-ask]` `[t=page-back]` |

## Editing and saving

| Screen | URL | Click sequence |
|---|---|---|
| Edit a copy (exact-frequency editor) | `$U?screen=home` | `[t=readout]` `[t=spec-edit]` |
| Editor, advanced (carrier, Drift range, fades) | `$U?screen=home` | `[t=readout]` `[t=spec-edit]` `[t=editor-more]` |
| Save sheet | `$U?screen=home` | `[t=readout]` `[t=spec-edit]` `[t=editor-save]` |
| Saved ("It won't change unless you change it.") | `$U?screen=home` | `[t=readout]` `[t=spec-edit]` `[t=editor-save]` `[t=save-confirm]` |
| Too much plays your saved layer | `$U?screen=home` | the four clicks above, then `[t=chip-too-much]` |
| Your layers, in the picker | `$U?screen=home` | the four clicks above, then `[t=start]` `[t=layer-name]` |

## Menu pages

| Screen | URL | Click sequence |
|---|---|---|
| Menu sheet | `$U?screen=home` | `[t=nav-menu]` |
| Settings | `$U?screen=home` | `[t=nav-menu]` `[t=menu-settings]` |
| Sensory mode on (plain labels, intent row, still screen, ceiling Medium locked) | `$U?screen=home` | `[t=nav-menu]` `[t=menu-settings]` `[t=set-sensory]` `[t=page-back]` `[t=start]` |
| What we know | `$U?screen=home` | `[t=nav-menu]` `[t=menu-science]` |
| The studies (6) | `$U?screen=home` | `[t=nav-menu]` `[t=menu-science]` `[t=science-studies]` |
| How Tuck plays under your audio | `$U?screen=home` | `[t=nav-menu]` `[t=menu-mixing]` (also `[t=audio-indicator]`) |
| This week (empty) | `$U?screen=home` | `[t=nav-menu]` `[t=menu-week]` |
| This week (sample data, labelled illustrative) | `$U?screen=home` | `[t=nav-menu]` `[t=menu-demo]` `[t=demo-week]` `[t=sheet-close]` `[t=nav-menu]` `[t=menu-week]` |
| Lock Screen and Live Activity | `$U?screen=home` | `[t=start]` `[t=nav-menu]` `[t=menu-lock]` |
| Tuck Plus | `$U?screen=home` | `[t=nav-menu]` `[t=menu-plus]` |
| Ear check from Settings | `$U?screen=home` | `[t=nav-menu]` `[t=menu-earcheck]` |

## Simulations (Prototype controls)

On a phone-sized viewport these are in Menu → Prototype controls (`[t=nav-menu]` `[t=menu-demo]`). At 720 px and wider they sit beside the device frame, always visible. The sheet and the side panel use the same test ids, so with both on screen, scope the selector to the sheet: `[data-testid=sheet-demo] [data-testid=…]`.

| What | Control |
|---|---|
| Another app playing above Tuck (generated music, or the browser's speech voice) | `[t=other-toggle]`; the Home indicator changes to "Your audio keeps playing above" |
| Tuck's level under it | `[t=demo-level-quiet]` / `-medium` / `-full` |
| Headphone route: speaker, one earbud, call mode, Mono, Spatial, swapped, disconnected | `<select data-testid=demo-headphone>`: use `page.selectOption`, it can't be clicked |
| Skip ahead (time-lapse to just before the fade) | `[t=demo-skip]` |
| Make it 21:00 (Heavy-eyed → Evening descent, Dim wool) | `[t=demo-evening]` then `[t=chip-heavy-eyed]` |
| Phone call / another app takes over | `[t=demo-call]` / `[t=demo-takeover]`, while playing |
| Sample week (illustrative) | `[t=demo-week]` |
| Start over | `[t=demo-reset]` |

## Keyboard

Tab moves through every control, with a visible 2 px focus ring. On Home, **Enter** starts sound, **Esc** stops it, and **↑ / ↓** change the level. The grab handle is a focusable slider, with ↑ / ↓ to change the level and Enter to start. Sheets and pages close with **Esc**.
