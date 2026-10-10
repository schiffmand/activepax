# Tuck: MVP product spec and screen-by-screen UX

> **Status: definitive for the prototype (v2.0).** It replaces the round-1 Tealight spec. Companions: [`brand.md`](./brand.md) (voice, copy bank, palette, signature interaction), [`tokens.json`](./tokens.json) and [`logo.svg`](./logo.svg). Personas are from [`personas.md`](./personas.md): **Maya** (ADHD), **Dev** (programmer), **Sam** (autistic / sensory), **Priya** (sleep and longevity), **Leo** (student), **Hannah** (skeptic), plus the meditator. Written for the prototype team (`prototype/`), the core team (`core/`) and the native team (`native/`).

**The one rule: one primary action.** The app is one screen with one object, the layer. Idle, the action is **Start sound** (or pull the layer up). Playing, it's **Stop** (or set it down). Everything else is one tap away or in a sheet.

---

## 1. The product in one paragraph

Tuck plays binaural tones with a soft noise bed **underneath** whatever else is playing: Spotify, podcasts, YouTube, lectures, meditation apps. It never pauses or ducks them. On iOS it uses `AVAudioSession` category `.playback` with `.mixWithOthers` (never `.duckOthers`). On Android it never requests audio focus and runs a `mediaPlayback` foreground service. Binaural beats need stereo headphones, because the left and right tones differ by the beat frequency. So Tuck checks each ear, and when the beat can't form (phone speaker, one earbud, Mono Audio, Spatial Audio, Bluetooth call mode) it says so in one sentence and falls back to noise only.

## 2. MVP feature set (prioritised)

**P0** = the prototype must demo it. **P1** = in the prototype if possible, otherwise fully specced. **P2** = later (Tuck Plus or v1.x).

| # | Feature | Pri | Persona need it serves |
|---|---|---|---|
| 1 | **The layer**: mixes under other audio and never ducks or pauses it; every start fades in and every stop fades out | P0 | All. "Layer, never replace" is the product. |
| 2 | **Start sound / Stop**, plus pull up and set down via the handle on the layer's top edge (≥44 pt above the system gesture zone) | P0 | Maya's ritual doorway; Dev and Leo want speed; button and accessibility paths for Sam and VoiceOver users |
| 3 | **One-decision home**: "Same as last time? Focus, 14 Hz" and "Arriving differently?" | P0 | Maya (no chore), Sam (no demand), Dev (no feelings question) |
| 4 | **Arrival chips** (first run, then one tap away), with the literal mapping and the "It isn't a treatment." line | P0 | Maya (names a state, not a deficit), Hannah (not a prescription) |
| 5 | **Five intents**: Focus, Calm, Unwind, Sleep (Evening descent), Steady. Every one has a noise bed. | P0 | Intent, not frequency (all). Steady for Sam. |
| 6 | **Honest audio indicator**: "Your audio keeps playing above" / "Nothing else playing" | P0 | Hannah and Dev (trust), platform honesty |
| 7 | **Level** while playing: Quiet / Medium / Full, with a lockable ceiling | P0 | "How far under my podcast" (Maya, Leo); ceiling (Sam) |
| 8 | **Drift / Hold** | P0 | Novelty without choosing (Maya); sameness (Sam) |
| 9 | **Engraved readout** + **tap to flip to the spec card** (L/R, carrier, noise, Drift range, fades, envelope plot) | P0 | Dev, Hannah, Priya |
| 10 | **Edit a copy** (exact-frequency editor) and **Save** ("It won't change unless you change it.") | P0 | Dev (control), Sam (sameness), Priya (her protocol) |
| 11 | **Onboarding (2 screens)** with the **ear check**: Play left / Play right with Heard states, the stitch lighting per side, "Stereo confirmed." | P0 | Leo's cheap earbuds; first sound within 10 s (Maya) |
| 12 | **Headphone states**: speaker, one earbud, Bluetooth call mode, Mono Audio, Spatial Audio, swapped, disconnected | P0 | Leo, Dev; nothing silently breaks the beat |
| 13 | **Noise only** (white / pink / brown) as a first-class mode | P0 | Hannah; fallback for speaker and mono |
| 14 | **Timer**: 25 / 50 / 90 / Until I stop / Custom, with "Fades out at 50 min" and **Take 5** | P0 | Leo (pomodoro), Maya (no anxious countdown) |
| 15 | **What we know** science page | P0 | Hannah, Priya, Dev |
| 16 | **Settings** including Plain labels, Sensory mode, Still screen, Legible text, greeting, "Ask how I'm arriving", ceiling, fades, advanced tuning | P0 | Sam, Dev, Priya |
| 17 | **Mixing explainer** ("How Tuck plays under your audio") and the mixing-failure banner | P0 | Everyone's first question; Dev's platform trust |
| 18 | **Live Activity / Lock Screen** (mocked in the prototype) | P1 | Everyone starts Tuck while another app is in front |
| 19 | **Totals, not streaks** ("kept you company 3 h 40 min this week") | P1 | Maya and Leo: no guilt, progress without pressure |
| 20 | **Versioned built-ins**: "what changed" diff, reset to default | P1 | Sam (sameness), Dev (reversibility) |
| 21 | Dim wool night theme, warm (automatic from 21:00 for every layer, from 18:00 for Sleep; never a bright button at night) | P1 | Priya, meditator |
| 22 | Private log (off by default): one-tap rating after a session, a one-tap sleep note the next morning, CSV / JSON export | P1 (built, round 1) | Dev, Priya, Hannah |
| 23 | **Blind comparison** (beat vs noise only on one layer, 14 days, labelled A / B). Basic version free; Plus adds longer runs, own-layer vs own-layer, PDF | P1 free basic (built, round 1); Plus extension P2 | Hannah, Dev |
| 24 | One daily schedule (free, built in round 1); more schedules, Apple Health / Health Connect mindful minutes, sync | P1 one daily time; P2 (Plus) the rest | Priya |
| 25 | Shortcuts / App Intents ("Start Focus under my audio"), the "when Spotify opens, start Tuck" automation recipe, Control Center control, Quick Settings tile, Lock Screen widget | **P1** (round 1: starting is the ADHD job, and this is the no-streak retention loop) | Maya, Dev, Priya |
| 26 | Pomodoro-style cycles in the timer (25 on, 5 at Quiet, one chime, 4 rounds) | P1 (built, round 1) | Leo, Maya |
| 27 | Vary (Drift plus a different noise each session, chosen for you) | P1 (built, round 1) | Maya |
| 28 | Pin one layer to Home (Steady mode): no arrival question, startable from the Lock Screen | P1 (built, round 1) | Sam |
| 29 | Shareable layer card with a deep link (numbers only, no personal data) | P1 (built, round 1) | Growth: acquisition loop |
| 30 | Body doubling: opt-in "working alongside" count, or a timer shared with one friend by link | P2 experiment (round 1), to the brand §14 privacy standard | Maya, Leo |
| — | "Others tucked in right now" | **Cut from v1** | Can return only to the privacy standard in brand.md §14 |

**Out of scope for v1:** accounts, social feeds, AI-generated music, ads, any health claim, reading other apps' now-playing information, and any visualisation of the beat.

---

## 3. Intents and layers (UI ↔ core mapping)

L/R = carrier ∓ beat/2. Every built-in has a noise bed (brand.md §6: "the steadiest evidence is for noise"). Level values are in `tokens.json → level`.

| UI name | Core id | Beat | Carrier | L / R | Noise bed | Motion | Fade in | Notes |
|---|---|---|---|---|---|---|---|---|
| **Focus** | `focus` | **14 Hz** | **207 Hz** | 200 / 214 | brown 25% | Drift ±0.5 Hz / 10 min | 8 s | **Core change:** 16→14 Hz, 200→207 Hz, noise off→brown 25% |
| **Calm** | `calm` | 10 Hz | 180 Hz | 175 / 185 | pink 20% | Drift | 8 s | **Core change:** noise off→pink 20% |
| **Unwind** | `wind-down` | 6 Hz | 160 Hz | 157 / 163 | pink 25% | Drift | 8 s | Display name "Unwind" |
| **Sleep** | `sleep-descent` (program) | 8→4→2 Hz over 30 min, then 15 min low | 140→130→120 Hz | 136 / 144 → 119 / 121 | brown 35% | Hold | 8 s | Display name "Evening descent". Ends with a 60 s fade to silence. The step titles drop "Asleep" (an outcome) for "Low". |
| **Steady** | `steady` **(new)** | 10 Hz | 180 Hz | 175 / 185 | brown 35% | **Hold (locked)** | **15 s** | Ceiling respected. No drift, ever. |
| *Long focus* (in "More layers") | `deep-work` | 40 Hz | 220 Hz | 200 / 240 | pink 20% | Drift | 8 s | Not one of the five. Leo's "40 Hz". |

- **Drift / Hold** is a per-layer toggle. It's never called "Steady", because Steady is an intent (must-change 5).
- **Arrival mapping** (UI only; it never shows a reason):

| Chip | Plays | Line under the chip |
|---|---|---|
| Scattered | Focus | That's Focus: a 14 Hz beat over soft brown noise. |
| Wound up | Calm | That's Calm: a 10 Hz beat over soft pink noise. |
| Too much | The user's **Too-much layer** if set, otherwise Steady | That's your layer "Desk", exactly as you saved it. / That's Steady: a 10 Hz beat over brown noise. It stays the same and fades in over 15 seconds. |
| Heavy-eyed | From 18:00 local: Evening descent. Before 18:00: Unwind. | That's Evening descent: 8 Hz easing to 2 Hz over 30 minutes, then 15 quiet minutes and silence. / That's Unwind: a 6 Hz beat over soft pink noise. |
| Just working | Focus with Hold, at Quiet | That's Focus, held still and quieter. |

- **The Too-much layer:** the first time someone saves a layer, the Save sheet shows a checkbox, **"Play this when I pick Too much"**, ticked by default. For later saves it's unticked. It can be changed in Settings → Arriving.

---

## 4. App structure

```
Launch
 ├─ first run → 1 "Your audio stays on top" → 2 Ear check → Home (first-run variant, Focus ready)
 └─ returning → Home ("Same as last time?" · last layer ready; "Hello again." if away > 14 days)

Home (the layer screen)
 ├─ Arriving differently? → chips inline (no sheet)
 ├─ Layer name / "Pick a layer" → Layer picker sheet (five intents · Your layers · More layers)
 ├─ Readout tap → Spec card (the layer flips) → Edit a copy (editor) → Save
 ├─ Timer chip → Timer sheet
 ├─ Headphone banner → Ear check sheet / state sheet
 ├─ Session-end line (inline, 8 s, no modal)
 └─ Menu ≡ → Settings · What we know · How Tuck plays under your audio · This week · Tuck Plus
```

No tab bar. No modals during a session. Sheets are bottom sheets (radius 28) that dismiss with a swipe down, a Close button or Escape. **The sheet grabber is at the sheet's top, never at the screen's bottom edge.**

---

## 5. Screen by screen

All sizes are for a 390 × 844 pt frame (iPhone 14/15) with 20 pt gutters. Safe areas: 47 pt top, 34 pt bottom (home indicator). On Android, use the gesture-nav inset.

### 5.1 Onboarding 1: "Your audio stays on top"

- **Content:** the mark (64 pt). Headline (Literata 31): **"Your audio stays on top."** Body (Atkinson 16/24): "Tuck plays a soft layer of tones and noise under your podcast, music or videos. It never pauses them." A two-band diagram: a Loden band labelled *Your audio* above a Felt band with the lining edge labelled *Tuck*. It's static.
- **Primary:** [Check my headphones]. **Secondary link:** *Skip, use noise only for now* (sets `noiseOnly`, skips the ear check and goes to Home).
- **Never here:** an account, a quiz, a notifications prompt, a paywall, sound on launch, motion on launch.
- Serves: Maya (2 screens maximum), Hannah (no claims), Sam (nothing moves, nothing sounds).

### 5.2 Onboarding 2: the ear check (must-change 9, grafts 4 and 5)

```
   Quick ear check.
   The beat only forms when each ear gets
   its own tone, so it needs stereo headphones.

        ╌╌╌╌╌╌╌╌ ╌╌╌╌╌╌╌╌        ← the stitch, large (240 pt wide)
        (Heather)  (Lichen)          left half lights while left plays

   [  Play left  ]   [  Play right ]    ← real buttons, 56 pt
     ✓ Left heard        —              ← Heard state replaces the hint

   Skip, use noise only
```

- **Flow** (core `planStereoCheck` / `runStereoCheck` / `interpretStereoCheck`):
  1. Tap **Play left**. A 1.5 s, 200 Hz tone with 300 ms ramps plays in the left ear only. **The left half of the stitch lights in Heather** for exactly as long as the tone plays. Four answer buttons appear: "Where did you hear it?" **[Left] [Right] [Both] [Neither]**.
  2. The answer becomes the button's **Heard state**: "✓ Left heard" (or "Heard on the right", "Heard in both", "Not heard"). **Play right** is now the focused button.
  3. **Play right** does the same at 214 Hz. **The right half lights in Lichen.**
  4. Verdict:
     - **ok:** the two halves slide together to meet in the middle (600 ms; instant under Reduce Motion). **"Stereo confirmed."** [Start sound] goes to Home and starts Focus. First sound is under 10 s from launch.
     - **mono** (both answers "Both"): Mono Audio state. If Mono Audio is off, the Spatial Audio state.
     - **one-ear** (one side "Neither"): One-earbud state.
     - **swapped:** "Your left and right seem swapped. Tuck will swap them for you." Sets `swapChannels`.
     - **unsure:** "No problem. Let's try that once more." Replays.
  - Either button can be replayed at any time. The check can be rerun from Settings → Headphones.
- **System-detected states** (native route detection; the prototype mocks each one with a dev toggle):

| State | Detected by | Copy | Actions | Stitch |
|---|---|---|---|---|
| Phone speaker | route = built-in speaker | brand.md §6 | [Use noise only] | single colour (Thread) |
| One earbud | AirPods in-ear state / route + user check | "Only one side is connected…" | [Check again] [Use noise only] | the missing half dimmed |
| **Bluetooth call mode** | route is HFP / `.bluetoothHFP`; Android SCO on | "Your headphones are in call mode, which is mono. Tuck is playing noise only and will switch back to binaural when the call ends." | none; **switches back automatically** when the route returns to A2DP, with a 4 s glide | single colour |
| Mono Audio | `UIAccessibility.isMonoAudioEnabled` / Android `master_mono` | "Mono Audio is on…" | [Open Settings] [Use noise only] | single colour |
| Spatial Audio | spatial / head-tracking on the route (best effort; otherwise inferred from a "Both" answer) | "Spatial Audio seems to be on…" | [Show me how] [Use noise only] | both halves, with an info dot |
| Disconnected mid-session | route change | "Headphones disconnected, so Tuck faded out." | [Start sound] | dims |

- States show as a **Seam banner with an icon**: never red, never a modal, never a metaphor. Every state offers the noise-only path. In noise-only mode the readout says "Noise only · brown 25%" and the stitch is a single colour.

### 5.3 Home: the layer screen (the only screen most people use)

**Idle layout, top to bottom:**

1. **Top bar** (56 pt): the audio indicator pill on the left (an icon and "Your audio keeps playing above" / "Nothing else playing", Thread 16). iOS: `isOtherAudioPlaying` / `secondaryAudioShouldBeSilencedHint`. Android: `AudioManager.isMusicActive`. **Never a name.** The first time it appears, one line sits under it: "Your phone doesn't tell apps what you're listening to, so we only say whether something is playing." [×]. Menu **≡** is on the right (48 pt target).
2. **Home line** (Literata 31):
   - **Greeting** (optional, Literata 25, Thread): "Evening." When off, or in Plain labels / Sensory mode, the fixed line is **"Tuck"**.
   - **First run:** "How are you arriving?" with the five chips visible and **Scattered → Focus preselected**.
   - **After the first session:** **"Same as last time?"** with the engraved line beneath: "**Focus** · 14 Hz" (Focus in Atkinson 20 ink, "14 Hz" in Thread 16 tabular). Below that, a text button: **"Arriving differently?"**. Tapping it reveals the chips inline (200 ms cross-fade). Picking a chip collapses them again.
   - **"Ask how I'm arriving" off** (and by default in Plain labels / Sensory mode): the line reads "**Last layer:** Focus · 14 Hz". Below it, the five intent names sit in one row of chips (Focus · Calm · Unwind · Sleep · Steady), with the current one selected. No feelings words.
   - Under a chosen chip: the literal line (§3), and on the first pick of each chip, **"This is what we play when you pick Scattered. It isn't a treatment."**
3. **The layer** (Felt, radius 28 top corners, bleeding off the bottom; resting height 300 pt above the bottom safe area):
   - **Lining strip** (10 pt, apricot at 45% brightness when idle) with the **grab handle** (40 × 5 pt, Thread) centred on it. **The handle's hit area is the full layer width × 48 pt, starting at least 44 pt above the system gesture zone.**
   - **The stitch** (Heather left half | Lichen right half), 2 pt, with twill texture (off in Plain / Sensory / Increase Contrast / Reduce Transparency).
   - **Readout row** (engraved, Thread 16 tabular, 48 pt target): "14 Hz · L 200 / R 214 ›", with L in Heather and R in Lichen. **Tap → the spec card.** In noise only: "Noise only · brown 25% ›".
   - **Timer chip:** "No timer ›" or "50 min ›". **Tap → the timer sheet.**
   - **[Start sound]**: full width, 56 pt, Fleece fill with a Loden label (Day: Loden fill, Muslin label). **Always visible when idle.**
   - First idle view only: a hint line, "Pull the top edge up, or tap Start sound." It disappears after the first start.
4. **Weekly total** (P1, Thread 16): hidden until the first session ends, and switchable off.

**Playing layout:**
- The layer rises to its level height (Quiet 360 / Medium 430 / Full 500 pt) in **1.4 s**. The lining brightens from 45% to 100% **linearly across the full fade-in** (8 s, or 15 s for Steady).
- The home line area shows the one metaphor line: **"Tucked in."** (Plain: "Sound on."). Under it, in Thread: "With you for 24 min · Fades out at 50 min" (Plain: "Playing for 24 min · Fades out at 50 min").
- Inside the layer: the readout row, then **Level** as a three-segment control **Quiet · Medium · Full** (48 pt; segments above the ceiling are hatched and show a lock), then **Drift / Hold** as a two-segment control, then the timer chip, then **[Stop]** (full width, 56 pt, outline style).
- **Drag the handle** up or down to change level. It snaps to a detent in 140 ms, and the sound glides over 1.2 s. **Drag below Quiet's height:** the hint reads "Let go to set it down." Letting go there stops; dragging back up cancels.
- **Stop / set down:** the layer sinks to idle height in 2 s. Sound fades over 20 s (60 s for Sleep), and the lining dims across the same 20 s. While fading, the button reads **"Start sound"** again, and tapping it fades back in from the current level. The session-end line ("Set down after 52 min. Faded out over 20 seconds.") shows for 8 s.

**Interactions:**

| Input | Idle | Playing |
|---|---|---|
| Tap **Start sound** / pull the handle up / Enter | Start (fade in) | — |
| Tap **Stop** / drag below Quiet and release / Esc | — | Set down (fade out) |
| Level segments / drag the handle | — | Change level (1.2 s glide) |
| Tap the readout | Spec card | Spec card |
| Tap the timer chip | Timer sheet | Timer sheet |
| Tap the layer name / a chip / an intent | Select (no sound) | Glide to the new layer over 4 s (8 s if either layer is Hold) |
| VoiceOver / TalkBack | "Start sound" | Actions: "Stop", "Level: Quiet / Medium / Full", "Take 5". The handle is an adjustable element: "Level, Medium". |
| Headphones unplugged | — | 1.5 s fade, then the banner |
| Phone call | — | Fade out, "Paused for your call. [Start sound]". No auto-resume. |

**Never on Home:** streaks, badges, a notifications prompt, an upsell, other apps' names, a beat visualisation, a second accent colour, sound or motion on launch.

### 5.4 Layer picker (sheet)

- Opened by tapping the layer name (or "Pick a layer" in Plain labels).
- **The five intents** as rows: the name (Atkinson 20) and an engraved line ("14 Hz · brown noise · Drift"). The current one is selected.
- **Your layers** (saved): name, engraved line and "Saved 3 Oct". Swipe or long-press for Rename / Delete (delete asks once, in plain words). If one is the Too-much layer, it says so.
- **More layers:** Long focus (40 Hz), and a noise-only version of each intent.
- Choosing a row selects it and closes the sheet. **It never starts sound on its own**, unless sound is already playing, in which case it glides.

### 5.5 Spec card (the back of the layer)

Tap the readout from any state, including idle and noise only. The layer flips (360 ms rotate; a 600 ms cross-fade under Reduce Motion). Tap "Done" or the readout again to flip back.

```
                 14 Hz                 ← Atkinson 61, tabular (the only big number)
        L 200 Hz   ·   R 214 Hz        ← Heather / Lichen, Atkinson 20 medium
        Carrier 207 Hz · beta range (descriptive)
   ───────────────────────────────────
   Noise     brown · 25%
   Level     Medium (0.28) · ceiling Full
   Motion    Drift · ±0.5 Hz over 10 min
   Fades     in 8 s · out 20 s
   Layer     Focus · built-in v1.0 · unchanged
   ───────────────────────────────────
     ▁▁╱‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾╲▁    ← session envelope: level over time
     0      8 s           50 min   +20 s   fade-in, plateau (Drift band tinted), fade-out
   ───────────────────────────────────
   [ Edit a copy ]  [ Save ]  [ Noise only ]
```

- **The envelope plot** is the only wave in the product. It's drawn in Thread at 1.5 pt, with the Drift band as a 12% Heather/Lichen tint. Axes are labelled in plain units. It reflects the real timer and fades. With no timer, it ends in "…".
- The band name is labelled *descriptive*. No outcome language.
- **Built-ins** show "Built-in layers stay as they are." above **[Edit a copy]**. **Saved layers** show [Edit] instead.
- **What changed** (P1): if a built-in has been updated, the Layer row says "Focus · built-in v1.3 · [See what changed]". The diff reads, for example, "carrier 207 → 210 Hz; noise brown 25% → 20%", with [Keep using v1.0] [Use v1.3]. **Nothing changes silently.**

### 5.6 Edit a copy: the exact-frequency editor (Dev, Priya)

- The title reads "Copy of Focus". The original is untouched.
- **Basic (always shown):**
  - **Beat:** a numeric field (decimal keyboard, 0.5–45 Hz, step 0.1) **and** a slider. Live L/R update underneath in ear colours.
  - **Noise:** Off / White / Pink / Brown, plus a level slider (0–100%, with dB shown).
  - **Level:** Quiet / Medium / Full.
  - **Motion:** Drift / Hold.
- **More (disclosure; open by default when Settings → "Show advanced tuning" is on):**
  - **Carrier:** numeric field + log slider, 40–1000 Hz, step 1. Shows a note when L or R would fall below 60 Hz ("Very low tones can be hard to hear on earbuds.").
  - **Drift range:** ±0–2 Hz, period 5–20 min (Drift only).
  - **Fade in** 2–20 s, **fade out** 10–120 s.
- Validation comes from core `validateTone` / `validatePreset`. Errors are plain words on a Seam row with an icon, for example "Beat must be lower than the carrier." Never red.
- While sound is playing, changes preview live with a 1 s glide.
- **[Save]** opens a small sheet: Name (≤40 chars), the "Play this when I pick Too much" checkbox (§3), and [Save]. Confirmation: **'Saved as "Desk". It won't change unless you change it.'** Saved layers are frozen and versioned.

### 5.7 Timer and Take 5

- **Sheet options:** 25 min · 50 min · 90 min · **Until I stop** (default for first use) · Custom (5–240 min wheel). It remembers the last choice per intent (Leo 25, Dev 90).
- **While playing:** "Fades out at 50 min". **Never a ticking seconds countdown.** The accessibility value is "Time left: 26 minutes".
- **At the end:** a 20 s fade (60 s for Sleep). The session-end line then offers **[Take 5]** for 30 s.
- **Take 5:** sound continues at **Quiet** for 5 minutes ("Five minutes off."). One soft chime (−24 dBFS, 1.5 s) marks the end, then the layer fades out. The next block does **not** start on its own, unless *Auto-continue* is on (Settings, off by default). A Take 5 button is also available from the playing layer's VoiceOver actions.

### 5.8 How Tuck plays under your audio (mixing explainer)

Shown from Menu → "How Tuck plays under your audio", from the first-view note on the audio indicator, and from the mixing-failure banner. No metaphor.

- **What happens:** "Start your music, podcast or video in any app, then start Tuck, or the other way round. Both keep playing. Use Level to set how far under your audio Tuck sits."
- **Volume:** "Your phone's volume buttons change everything together. Level changes only Tuck."
- **What we can't see:** "Your phone doesn't tell us what's playing, so we only say whether something is."
- **When it can't mix:** "Some apps, mostly calls and a few video apps, take over the sound and stop everything else. That's their choice, not ours. Tuck will tell you when it happens, and your audio is never changed."
- **Lock Screen:** "Your other app keeps the main lock-screen player. Tuck shows its own small control with the time left and Stop."
- **Headphones:** "The beat needs stereo headphones. On the phone speaker, Tuck plays noise only." [Run the ear check]
- **Mixing-failure banner:** "Another app took over the sound, so your layer stopped. Your audio wasn't changed. [Start sound]". Native: re-activate the session with `.mixWithOthers`. If *we* ever interrupted *them* (detected via an interruption notification or focus loss), show "Your other audio stopped when Tuck started. That shouldn't happen. [Fix audio settings]" and log locally.

### 5.9 Settings (a plain tool screen, no metaphor)

A grouped list. Every row says exactly what it does.

**Home and arriving**
- **Ask how I'm arriving:** on (default) / off. "Off shows the five layer names instead." **Once turned off, it stays off**, even if Plain labels or Sensory mode are switched later.
- **Greeting:** on (default) / off. "Off shows the word Tuck instead of Morning, Afternoon or Evening."
- **When I pick Too much, play:** Steady (default) / any saved layer.
- Show weekly total on Home: on / off.

**Sound**
- **Level ceiling:** Quiet / Medium / Full (default), plus **Lock ceiling**. "Nothing in the app can go louder than this."
- **Fade in:** 8 s (2–20). **Fade out:** 20 s (10–120).
- Default motion for new layers: Drift / Hold.
- Swap left and right.
- **Noise only** (no beats, everywhere).
- **Show advanced tuning** (carrier, Drift range, fades in the editor): off / on. *For power users.*
- Headphones: Run the ear check again · Spatial Audio help.
- Take 5 chime: on / off. Auto-continue after Take 5: off / on.

**Senses and motion**
- **Sensory mode** (one switch). It sets: Plain labels on, greeting off, Ask how I'm arriving off, texture off, Still screen on, default motion Hold, fades 15 s / 30 s, ceiling Medium locked, haptics off, chime off, breathing layer off. "You can still change each one."
- **Plain labels:** literal words everywhere ("Sound on", "Playing for 24 min", "Stopped after 52 min"). It also turns off the greeting, the arrival question (unless you turn it back on) and the texture.
- **Still screen:** follows the system Reduce Motion setting automatically, and can be forced on. Every movement becomes a 600 ms cross-fade.
- **Texture on the layer:** on / off (it's also off automatically with Increase Contrast or Reduce Transparency).
- **Breathing layer** (Calm, Unwind, Sleep; one slow rise and fall every 10 s): off (default) / on.
- Haptics: off (default) / a soft tick at each level detent and when sound has fully started.

**Display**
- Theme: Night (default) / Day / Match system.
- **Dim at night:** automatic for Sleep and Heavy-eyed after local sunset (default) / always after sunset / off. "Keeps the screen under about 40 cd/m² and removes most blue."
- **Text:** Standard / Legible (Atkinson Hyperlegible throughout). Follows Dynamic Type.
- App icon: Tuck / Plain.
- Live Activity style: Standard / Minimal.

**Privacy:** "Everything stays on this phone. No account. No trackers." [Export my data (JSON)] [Delete all data].
**About:** What we know · How Tuck plays under your audio · Version and layer changelog · Licences.

### 5.10 What we know (science page, no metaphor)

- The verbatim copy from brand.md §6, in the three-part structure: **this part is well established** (the perceptual beat) / **this part isn't** (outcomes) / **the steadiest evidence is for noise** (why every layer has a noise bed). Atkinson 16/24, ≤60 characters per line, headings in Literata 25.
- **Read the studies (6):** a plain citation list. Each entry has a one-line summary and the direction of the finding (benefit / no effect / negative). It must include the Nigg et al. 2024 noise meta-analysis, the Ingendoh et al. 2023 systematic review and the negative-finding study. The exact list is owned in `docs/`.
- **Safety:** not a medical device; the epilepsy and seizure note; don't use Sleep while driving; keep the volume moderate, with a link to the OS headphone-level setting.
- **[Try a blind comparison]:** opens the Blind comparison page (free basic version, built in round 1).
- Reachable from the Menu, from onboarding (a link on screen 1 is optional), and from the spec card ("What does this do? → What we know").

### 5.11 This week (totals, P1)

- "Tuck kept you company for **3 h 40 min** this week, across 6 sessions." (Plain: "Total this week: 3 h 40 min, 6 sessions.") A simple bar per day in Thread, with **no target line** and a breakdown by layer.
- **No streaks, and no better/worse comparisons.** The core `compareRanges` copy stays neutral ("a little more than last week").
- Optional per-session rating (off by default): "How did that feel?" 1–5, skippable, never asked twice in a row.

### 5.12 Live Activity and Lock Screen (P1, mocked in the prototype)

- **Standard:** mark (20 pt), intent name, **"Playing under your audio, 27 min left"** (or "Playing under your audio, no timer"), **14 Hz** in Atkinson 34 tabular with "L 200 / R 214" in ear colours beneath, and **[Stop]**.
- **Minimal:** "Focus · 14 Hz · 27 min" and [Stop]. No mark, no colour.
- **Dynamic Island:** compact shows the stitch glyph and "27m". Expanded matches Standard.
- Dim wool applies after sunset for Sleep.
- **Android:** an ongoing `mediaPlayback` notification with the same content and a Stop action. It must not become the active media session that takes hardware play/pause from the user's other app.

### 5.13 Tuck Plus (P2, only from the Menu)

- Plain copy from the copy bank. It lists exactly what Plus adds: schedules, the blind comparison, Health / Health Connect, sync. A reminder 3 days before any charge. Cancel in two taps.
- **Never shown before the first sound, never during a session, never as a modal.**

---

## 6. State model (for the prototype and core)

```
idle ──Start sound / pull up / a11y──► fadingIn (8 s | 15 s) ──► playing
  ▲                                                               │
  │   ◄── fade complete ── fadingOut (20 s | 60 s) ◄── Stop / set down / timer end
  │                                                               │
  │                         takeFive (Quiet, 5 min) ─► chime ─► fadingOut
  └── paused (call / route lost, 1.5 s fade) ◄──────────────────────┘ ─[Start sound]─► fadingIn

Orthogonal:
  output   ∈ {binaural, noiseOnly}           (forced noiseOnly by speaker | mono | callMode | oneEar unless overridden)
  motion   ∈ {drift, hold}
  level    ∈ quiet | medium | full (≤ ceiling)
  labels   ∈ {warm, plain}
  home     ∈ {firstRun, sameAsLast, intentRow}   (intentRow when askArrival = false)
  theme    ∈ {night, day, dim}
  headphone∈ {stereoOk, speaker, oneEar, callMode, mono, spatial, swapped, disconnected, unknown}
  otherAudio ∈ {playing, none, unknown}        (never a name)
```

Starting from `fadingOut` fades back in from the current gain, without a click.

## 7. Accessibility acceptance criteria

- Every control has a literal accessibility label equal to its Plain-labels text. Controls never carry the metaphor.
- All targets are ≥ 48 pt. The primary button is 56 pt tall and full width. **The handle's hit area is ≥ 48 pt tall and its lowest point is ≥ 44 pt above the system gesture zone.**
- Contrast: body text ≥ 7:1 in Night and Day. Secondary text ≥ 4.5:1. Controls and meaningful graphics ≥ 3:1. Dim is ≥ 4.5:1 throughout. Day ear colours are only used within their swatch limits.
- **Colour never stands alone.** Every ear colour is paired with L/R text and a position.
- Reduce Motion or Still screen means zero movement (cross-fades only). Nothing flashes more than 3 times per second, ever. The beat is never visualised. Nothing ambient cycles faster than once per 6 s.
- The web prototype is fully keyboard operable: Enter = Start sound, Esc = Stop, arrows = Level, with a visible 2 pt focus ring offset 2 pt.
- Dynamic Type up to AX3 with no clipped primary action. The home line wraps.
- No sound, haptic or motion happens without a user action. The ear-check tones only play from a tap.

## 8. Prototype demo script (what the final demo must show)

1. **First launch:** Onboarding 1 → ear check: Play left (left stitch half lights Heather) → "Left" → ✓ Left heard → Play right (Lichen) → ✓ Right heard → halves meet → **"Stereo confirmed."** → Start sound. That's under 10 s to sound.
2. **First-run home:** "How are you arriving?" → pick **Scattered** → "That's Focus: a 14 Hz beat over soft brown noise." + "This is what we play when you pick Scattered. It isn't a treatment."
3. **Pull up from the lining edge** (not the screen bottom): the layer rises in 1.4 s, and the lining brightens over 8 s. "Tucked in." / "With you for 0 min · No timer". A toggle simulates "Your audio keeps playing above".
4. Level Medium → Quiet → Full (with the ceiling lock shown). Drift → Hold.
5. **Tap the readout** → the layer flips to the spec card (14 Hz, L 200 / R 214, envelope plot) → **Edit a copy** → beat 12 Hz (live glide) → Save as "Desk" → "It won't change unless you change it."
6. Timer 25 min, time-lapsed with `createManualClock` → "Fades out at 25 min" → 20 s fade, lining dims → "Set down after 25 min…" → **Take 5**.
7. **Returning home:** "Same as last time? Desk · 12 Hz" → "Arriving differently?" → **Too much** → plays "Desk" (the Too-much layer).
8. **Headphone states** (dev toggle): speaker, one earbud, **call mode → auto switch back**, Mono Audio, Spatial Audio → Seam banner → noise only (single-colour stitch).
9. **Settings:** Sensory mode on → the greeting is replaced by "Tuck", the intent row replaces the question, Plain labels ("Sound on", "Playing for 3 min"), texture off, still screen. Then turn "Ask how I'm arriving" off, toggle Sensory mode off, and show that it stays off.
10. **Heavy-eyed after 18:00** → Evening descent in Dim wool. Then the What we know page.

## 9. Core gaps for the backend team (UI-independent work for `core/`)

1. **Presets:** Focus → 14 Hz / 207 Hz / brown 25%. Calm → noise pink 20%. Add **`steady`** (10 Hz / 180 Hz, brown 35%, fade-in 15 s, `motion: 'hold'`, frozen). Add a `version` field to every built-in.
2. **Motion: `'drift' | 'hold'`** (never "steady"). Drift is a seeded, bounded, slow random walk on the beat (± range Hz, period ≥ 5 min) and on the noise level (± 2 dB), deterministic per session seed. Hold must be **bit-for-bit identical** parameters.
3. **Level:** map quiet / medium / full ↔ volume (`tokens.json → level`), with `levelCeiling` and `ceilingLocked`. Clamp in one place in the engine.
4. **Arrival:** `arrivalFor(chip, localTime, settings, savedLayers)` → `{ layerId, line }`. The 18:00 rule for Heavy-eyed. Too-much → `settings.tooMuchLayerId ?? 'steady'`. A pure function, unit-tested, with no outcome strings.
5. **Edit a copy:** `copyBuiltIn(id)` → an unsaved custom draft. `updateCustomPreset` already blocks built-ins. Add `diffPresets(a, b)` returning human-readable changes, and "reset to default".
6. **Settings (schema v3 + migration):** `askArrival` (with a `askArrivalUserSet` flag so it's remembered when turned off), `greeting`, `plainLabels`, `sensoryMode`, `stillScreen`, `texture`, `breathingLayer`, `legibleText`, `levelCeiling`, `ceilingLocked`, `fadeInSec`, `fadeOutSec`, `defaultMotion`, `swapChannels`, `noiseOnly`, `advancedTuning`, `takeFiveChime`, `autoContinue`, `dimAtNight`, `appIcon`, `liveActivityStyle`, `showWeeklyTotal`, `tooMuchLayerId`. Sensory mode applies its bundle once and records which values the user has since overridden.
7. **Headphone-state model:** `stereoOk | speaker | oneEar | callMode | mono | spatial | swapped | disconnected | unknown`. It combines `interpretStereoCheck` with platform route flags, and `callMode → stereoOk` triggers an automatic switch back to binaural with a 4 s glide.
8. **Session envelope:** `envelopeFor(layer, timer, fades)` → points for the spec-card plot (fade-in, plateau with drift band, fade-out).
9. **Copy helpers:** session-end and status lines in warm and plain variants, always with explicit units ("Fades out at 50 min").
10. **Program labels:** rename the `sleep-descent` step label 'Asleep' to 'Low' (no outcome words in UI-visible strings).
11. **Take 5:** a player action that sets level Quiet for N minutes, then a chime, then fade out (or the next block if auto-continue is on).

## Activation and the north star (added after round 1)

Tuck measures nothing it doesn't need, and nothing leaves the phone without consent. These are the product's own definitions, computed on device for the user's own This week page and, only if they opt in to anonymous diagnostics, counted in aggregate:

- **Activation:** first sound within 10 seconds of first launch (onboarding skip or ear check, then Start sound).
- **North-star input:** the share of sessions with "Your audio keeps playing above" true for at least half the session. That number is the proof of the wedge: Tuck under something else, not instead of it.
- **Retention without streaks:** the share of sessions started without opening the app (Control Center, Shortcuts automation, Lock Screen widget, schedule). It replaces any streak mechanic.

