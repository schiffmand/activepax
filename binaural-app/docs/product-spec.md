# Tealight: MVP product spec and screen-by-screen UX

> Companion to [`brand.md`](./brand.md) (voice, copy bank, palette, signature interaction) and [`tokens.json`](./tokens.json). It's written for the prototype team (`prototype/`) and the core team (`core/`). Personas are from [`personas.md`](./personas.md): **Maya** (ADHD), **Dev** (programmer), **Sam** (autistic / sensory), **Priya** (sleep and longevity), **Leo** (student), **Hannah** (skeptic), plus the meditator.

**The one rule: one primary action.** The app is one screen with one object. You light it, and you let it go out. Everything else is either one tap away (spec card, depth, timer) or lives in a sheet.

---

## 1. Product in one paragraph

Tealight plays binaural tones and optional soft noise **underneath** whatever else is playing: Spotify, podcasts, YouTube, lectures, meditation apps. It never pauses or ducks them. On iOS it uses `AVAudioSession` `.playback` with `.mixWithOthers` (never `.duckOthers`). On Android it never requests audio focus and runs a `mediaPlayback` foreground service. Binaural beats need stereo headphones (left and right get tones that differ by the beat frequency), so Tealight checks both ears and falls back honestly to noise only when the beat can't form (speaker, one earbud, Mono Audio, Spatial Audio).

## 2. MVP feature set (prioritised)

**P0 = the prototype must demo it. P1 = in the prototype if possible, otherwise specced. P2 = later (Plus or v1.x).**

| # | Feature | Pri | Persona need it serves |
|---|---|---|---|
| 1 | **The layer**: mix under other audio, never duck or pause; fade in and out | P0 | All. "Layer, never replace" is the product |
| 2 | **Light / let go out** (hold by default, tap option, accessibility actions) | P0 | Maya's ritual doorway; Leo and Dev want speed; Sam and VoiceOver users need a non-hold path |
| 3 | **Five intents**: Focus, Calm, Unwind, Sleep, Steady (swipe or tap row) | P0 | Intent, not frequency (all); Steady for Sam |
| 4 | **Honest audio indicator**: "Your audio is playing above" / "Nothing else playing" | P0 | Hannah and Dev trust; platform honesty |
| 5 | **Depth**: Surface / Under / Deep, plus lockable ceiling | P0 | "How far under my podcast" (Maya, Leo); ceiling (Sam) |
| 6 | **Soften** (tap a lit flame → Deep, tap again → back) | P0 | Calls, baristas, tricky paragraphs (Maya, Dev) |
| 7 | **Timer as wax pool**: 25 / 50 / 90 / until I stop, plus Break (5 min) | P0 | Pomodoro (Leo), no anxious countdown (Maya) |
| 8 | **Spec card, one tap from every state**: beat Hz hero, L/R in ear colours, carrier, noise, depth, mode | P0 | Dev, Hannah, Priya |
| 9 | **Onboarding (2 screens) with headphone L/R check** and all fallback states | P0 | Leo's cheap earbuds; first sound in 10 s (Maya) |
| 10 | **Noise-only mode** (white / pink / brown) as a first-class mode | P0 | Hannah; fallback for speaker and mono |
| 11 | **Drift / Steady** toggle | P0 | Novelty without choosing (Maya); sameness (Sam) |
| 12 | **What we know** (science) sheet | P0 | Hannah, Priya, Dev |
| 13 | **Settings**: start mode, Plain labels, Legible text, Still screen, sensory, Low glow, depth ceiling, fade lengths, haptics, theme, icon | P0 | Sam, Priya, Dev |
| 14 | **Exact-frequency editor** (beat, carrier, noise colour and level) and **Save as my sound** | P0 | Dev, Priya, Sam |
| 15 | **Totals, not streaks** ("Kept you company 3 h 40 m this week") | P1 | Maya and Leo: no guilt, progress without pressure |
| 16 | **Evening descent** program (Sleep) with Low glow | P1 | Priya, meditator |
| 17 | **Versioned presets**: "what changed" diff, reset to default | P1 | Sam (sameness), Dev (reversibility) |
| 18 | **Live Activity / Lock Screen control** spec (Warm and Minimal) | P1 (mocked in prototype) | Everyone starts this while another app is in front |
| 19 | Journeys (Arrive, Ease into Focus, Ten-Minute Reset, Long focus block, Unwind) | P1 | Priya protocols, Maya novelty |
| 20 | Post-session one-tap rating (optional, private) | P1 | Dev, Hannah (n-of-1 groundwork) |
| 21 | Blind comparison experiment (beats vs noise-only, 2 weeks) | P2 (Plus) | Hannah, Dev |
| 22 | Schedules, Apple Health / Health Connect mindful minutes, sync | P2 (Plus) | Priya |
| 23 | Shortcuts / App Intents, URL scheme, Android quick tile, widgets | P2 | Dev, Priya |
| 24 | "Other lights" (anonymous, opt-in) | **Cut from v1** (see brand.md §6) | Leo; revisit only under the privacy bar |

**Out of scope for v1:** accounts, social, AI-generated music, ads, any health claim, reading other apps' now-playing info, and any visualisation of the beat.

---

## 3. Intents and presets (UI ↔ core mapping)

Values come from `core/src/presets.ts`. L/R = carrier ∓ beat/2. Depth sets the engine volume (`tokens.json → depth`).

| UI intent | Core id | Beat | Carrier | L / R | Noise | Default mode | Silhouette |
|---|---|---|---|---|---|---|---|
| **Focus** | `focus` | 16 Hz | 200 Hz | 192 / 208 | off (pink 25% available) | Drift | tall, narrow |
| ↳ *Long focus* (variant on the Focus spec card) | `deep-work` | 40 Hz | 220 Hz | 200 / 240 | pink 20% | Drift | tall, narrow |
| **Calm** | `calm` | 10 Hz | 180 Hz | 175 / 185 | off | Drift | rounded |
| **Unwind** | `wind-down` | 6 Hz | 160 Hz | 157 / 163 | pink 25% | Drift | low lean |
| **Sleep** | `sleep` | 2 Hz | 120 Hz | 119 / 121 | brown 35% | Steady | low ember |
| **Steady** | `steady` *(new, see §9)* | 10 Hz | 180 Hz | 175 / 185 | brown 35% | Steady (locked), 15 s fade | still teardrop |

- **Naming collisions avoided.** "Deep Work" becomes **Long focus** in the UI (Deep is a Depth position). "Wind Down" becomes **Unwind**. "Sleep Descent" becomes **Evening descent**.
- The intent row shows only the five intents. Variants, journeys and saved sounds live in the **More** sheet (§5.6). That keeps the main screen to one row.

---

## 4. App structure

```
Launch
 ├─ first run → Onboarding 1 (layer) → Onboarding 2 (headphone check) → Main (Focus ready)
 └─ returning → Main (last intent ready; "Hello again." if away > 7 days)

Main (the layer screen) ─┬─ Spec card sheet (tap spec chip / ⓘ / long-press intent)
                         │    └─ Edit sound (exact-frequency editor) → Save as my sound
                         ├─ Timer sheet (tap wax pool / time chip)
                         ├─ More sheet (variants, journeys, saved sounds, Evening descent)
                         ├─ Headphone state banner → Headphone sheet
                         ├─ Session-end line (inline, no modal)
                         └─ Menu (top-right ≡) → Settings · What we know · This week · Plus
```

No tab bar. No modals during a session. Sheets are bottom sheets (radius 28) and dismiss with a swipe, a Close button, or Escape.

---

## 5. Screen-by-screen

### 5.1 Onboarding 1: "Keep listening"

- **Content:** small mark, heading (Young Serif 31) **"Keep listening to whatever you like."**, body: "Tealight plays a soft layer of tones and noise underneath it. It never pauses your audio." A simple diagram: a dim bar labelled *Your audio* above, the small split flame below labelled *Tealight*.
- **Primary:** [Continue]. **Secondary link:** *Skip, use noise only* (this sets `noiseOnly`, skips the check, and goes to Main).
- **No:** account, quiz, notifications prompt, paywall, sound on launch, motion on launch.
- Personas: Maya (≤2 screens), Hannah (no claims), Sam (nothing moves).

### 5.2 Onboarding 2: headphone check

- Heading **"Both ears, please."** Body: "Binaural beats need a slightly different tone in each ear, so they work with stereo headphones. We'll play a soft tone on the left, then on the right."
- **Flow** (core `planStereoCheck` / `runStereoCheck` / `interpretStereoCheck`):
  1. [Play left]. A soft 1.5 s tone with a 300 ms fade plays in the left ear only, and the left (wick-blue) half of the flame glows. Then a question: "Heard it on the left?" [Yes, left] [Not on the left] [Heard both sides].
  2. [Play right]. Same for the right, with the saffron half.
  3. Verdict:
     - **Stereo OK** → the halves slide together (600 ms, or instant under Reduce Motion): **"Heard both. You're set."** [Start] goes to Main with Focus selected. Sound is reachable in under 10 s total.
     - **Mono / both sides** → Mono Audio state.
     - **Only one side** → One-earbud state.
     - **Swapped** (heard left in the right ear) → "Your left and right seem swapped. Tealight will swap them for you." Sets `swapChannels`.
- **System-detected states** (native route detection; the prototype mocks them with a dev toggle):

| State | Detected by | Copy (see brand.md) | Actions | Flame |
|---|---|---|---|---|
| Phone speaker | route = built-in speaker | "Your phone speaker mixes both tones together…" | [Use noise only] | whole, saffron |
| One earbud | route + user check | "Only one side came through…" | [Check again] [Use noise only] | whole, saffron |
| Mono Audio | `UIAccessibility.isMonoAudioEnabled` / Android `master_mono` | "Mono Audio is on…" | [How to turn it off] [Use noise only] | whole, saffron |
| Spatial Audio / head tracking | iOS spatial / head-tracking enabled on route (best effort; otherwise ask once) | "Spatial Audio moves sound around your head…" | [How] [Keep going anyway] | split, with a saffron info dot |
| Headphones disconnected mid-session | route change | "Headphones disconnected. Tealight paused…" | [Resume as noise on speaker] | dims to idle |

- Warnings use a **saffron banner with an icon** (ⓘ in a circle), never red and never metaphor. Every state offers the noise-only path. A check can be rerun any time from Settings → Headphones.

### 5.3 Main: the layer screen (the only screen most people use)

**Layout (390 × 844, top to bottom), 20 px gutters:**

1. **Audio indicator** (top, `waxDim`, 13–16 px): a short bar glyph + **"Your audio is playing above"** or **"Nothing else playing"** (iOS `secondaryAudioShouldBeSilencedHint` / `isOtherAudioPlaying`; Android `AudioManager.isMusicActive`). The first time it shows, a one-line note appears beneath it: "Your phone doesn't tell apps what you're listening to, and we won't pretend it does." Dismiss with ×. **We never show names.** Menu ≡ is top-right (48 px target).
2. **Intent word** (Young Serif 56, `wax`): "Focus". With Plain labels on, a literal subline appears below it: "Beat 16 Hz · tones + no noise".
3. **Intent row**: Calm · Unwind · Sleep · Steady (and Focus when another is selected), 16 px, `waxDim`. Tap or swipe horizontally. While lit, changing intent glides the sound over 4 s (2 s in Drift, 8 s in Steady). It never cuts.
4. **The flame in its cup** (centre, about 180 px tall, hit target ≥ 160 × 200):
   - *Idle:* the flame is an outline in `waxDim` with a faint fill. The wax pool is full. No glow.
   - *Lighting:* the wick catches, the halves fill wick-blue | saffron, and the glow rises. All of it is bound to the 8 s audio fade (15 s Steady).
   - *Lit:* full split flame, glow on, Drift sway if enabled.
   - *Softened:* the flame is 60% height and the glow is halved. The label reads "Cupped".
   - *Noise only:* the flame is whole and saffron.
   - *Low glow:* a single ember colour, no blue.
5. **Primary label** under the cup (16 px, semibold): "Hold to light" / "Tap to light" → "Lit for 14 min" → after going out, "It went out after 52 minutes." (shown for 8 s, then back to idle copy). With Plain labels: "Start sound" / "Playing · 14 min" / "Stopped after 52 minutes".
6. **Depth track**: three labelled detents **Surface · Under · Deep**, plus fine drag between them, 48 px tall. The current detent is in `wax` and the others in `waxDim`. Above the ceiling, the track is hatched with a small lock icon. The accessibility element is an adjustable: "Depth, Under. Swipe up or down to adjust."
7. **Spec chip** (one line, Lexend 13–16 tabular): `16 Hz · Drift · 50 min ⓘ`. Tap it to open the Spec card. It's visible in **every state, including idle and noise-only** (`Noise only · brown · Steady`).
8. **Totals line** (bottom, `waxFaint`, 13 px): "Kept you company 3 h 40 m this week". Hidden until the first session ends, and hideable in Settings.

**Interactions**

| Input | Idle | Lit |
|---|---|---|
| Hold flame 1.2 s (Hold mode) | Light (fade in) | Let it go out (30 s fade, or the user's stop fade) |
| Tap flame (Hold mode) | Hint: "Keep holding…" | Soften ↔ restore |
| Tap flame (Tap mode) | Light | Soften ↔ restore |
| Stop button (Tap mode only, small text button under the label) | — | Let it go out |
| Tap wax pool / time | Timer sheet | Timer sheet |
| Tap spec chip / ⓘ, long-press intent word | Spec card | Spec card |
| VoiceOver / TalkBack actions | "Start sound" | "Stop sound", "Soften", "Restore", "Take a break" |
| Keyboard / Switch | Space / Enter = start | Space = soften, Shift+Space or Esc = stop |
| Headphones unplugged | — | Pause with a 1.5 s fade, plus banner |

**Hold ring:** while holding, a 2 px `wick` → `flame` ring draws around the cup over 1.2 s. Release early and it retracts in 200 ms with no sound. Under Reduce Motion, the ring is replaced by the label counting "Starting…".

**Never on Main:** streaks, badges, notifications prompts, upsell, other apps' names, beat visualisation, more than one glow.

### 5.4 Timer (wax pool) sheet

- Options: **25 min · 50 min · 90 min · Until I stop · Custom** (picker, 5–240 min). The default is the last used (Leo 25, Dev 90).
- **Break** (shown when a timed session ends, or from the sheet): "Five minutes off." The layer rises to **Surface** while you rest and one soft chime (−24 dBFS, 1.5 s) marks the end. The next block does **not** start automatically, unless you turn on *Auto-continue* (off by default).
- **End fade:** 30 s by default (10–120 s, set in Settings). Sleep and Evening descent end with 60 s.
- Visual: the wax pool ellipse shrinks linearly. The exact time is in the spec chip and the accessibility value ("Time left: 36 minutes"). No ticking seconds anywhere.

### 5.5 Spec card (sheet, reachable from every state)

```
            16 Hz                    ← Lexend 300, 56px, tabular. "beat"
   L 192 Hz   ·   R 208 Hz           ← wick-blue / saffron, Lexend 500 20px
   Carrier 200 Hz · Beta band (descriptive)
   Noise    off  ▸ pink 25%
   Depth    Under (volume 0.28) · ceiling Surface 🔒
   Mode     Drift (±0.5 Hz over 10 min)  |  Steady
   Preset   Focus v1.2 · unchanged   [What changed]
   [Edit sound]   [Save as my sound]   [Noise only]
```

- Copy rules: the band name is labelled *descriptive*. No claims. All numbers are tabular.
- **Edit sound** (exact-frequency editor for Dev and Priya):
  - **Beat** 0.5–45 Hz, step 0.1. There's a numeric field (keyboard) **and** a slider. **Carrier** 40–1000 Hz, step 1, with the slider log-scaled. Validation comes from core `validateTone` (beat < carrier). Errors are shown in saffron plain words, e.g. "Beat must be lower than the carrier."
  - **Noise**: Off / White / Pink / Brown, and a level 0–100% shown with a dB readout.
  - **Drift range** (Drift only): ±0 to ±2 Hz around the beat, over 5–20 min.
  - **Fade in** 2–20 s, **fade out** 10–120 s.
  - Changes preview live, gliding 1 s while lit. [Reset to default] shows a diff first.
  - [Save as my sound] names it and stores it versioned and frozen: "It stays exactly the same, update after update."
- **What changed** (versioned presets): a diff table, e.g. "Focus v1.2 → v1.3: carrier 200 → 210 Hz; noise off → pink 15%". Actions: [Keep mine] [Use new] [Reset to default]. Built-in presets the user hasn't saved update only on an explicit accept. **Sam's rule: nothing changes silently.**

### 5.6 More sheet (variants, journeys, saved)

- **Saved sounds** first ("Your sounds"). The empty state comes from the copy bank.
- **Journeys** (core programs): *Arrive* (8 min settle), *Ease into Focus*, *Long focus block* (5 + 40 + 5), *Ten-Minute Reset*, *Unwind*, **Evening descent** (core `sleep-descent`: 8 → 4 → 2 Hz over 30 min, then 15 min low, then 60 s fade to silence). Each row shows name, one plain line and duration. The spec card for a journey shows its step list with Hz ("Settling 14 → 10 Hz, 8 min").
- **Variants:** Long focus (40 Hz), plus noise-only versions of each intent.
- Choosing an item makes it the current intent ("Evening descent" replaces the intent word) and returns to Main. **It never starts sound on its own.** The primary action is still the user's.

### 5.7 Mixing with other audio (explainer)

Shown from: the Menu → "How mixing works", the first-run note on the audio indicator, and the mixing-failure banner.

- **What happens:** "Tealight plays alongside your other audio. Start your music, podcast or video in any app, then light Tealight (or the other way round). Both keep playing. Set how far under with Depth."
- **Volume:** "Your phone's volume buttons change everything together. Depth changes only Tealight."
- **What we can't do:** "Your phone doesn't tell us what's playing, so we just say whether something is. Some apps (a few video and call apps) take over audio and stop others. That's their choice, not ours, and Tealight will say when it happens."
- **Lock screen:** "Your other app keeps the main lock-screen player. Tealight shows its own small control (a Live Activity on iPhone, a notification on Android) with time left and Stop."
- **Mixing-failure banner** (another app interrupted us, or ours paused theirs, detected via interruption or focus loss): "Your other audio stopped when Tealight started. That shouldn't happen. [Fix audio settings]". The fix re-activates the session with `.mixWithOthers`, and the banner offers [Tell us] (a local log, sent only if the user taps).
- **Calls:** Tealight fades out on a phone or VoIP call interruption and does **not** auto-resume. It shows "Paused for your call. [Resume]".

### 5.8 Live Activity / Lock Screen (spec, mocked in the prototype)

- **Warm:** split flame, intent, "36 min left", wax-pool progress bar, [Stop] and [Depth ▾] (cycles Surface → Under → Deep, respecting the ceiling).
- **Minimal (screen-share-safe):** "Focus · 36 min · Under" and [Stop], with no flame and graphite styling.
- Dynamic Island: compact = flame dot + "36m". Minimal = "Focus 36m".
- Android: an ongoing `mediaPlayback` notification with the same content. It must not register as the media session that steals the hardware play/pause keys from the user's other app.
- The Low glow palette applies after sunset when the intent is Sleep or Unwind.

### 5.9 Settings (no metaphor, plain tool screen)

Grouped list. Every row says exactly what it does.

**Sound**
- Starting: **Hold to start** (default) / **Tap to start**
- Fade in: 8 s (2–20). Fade out: 30 s (10–120)
- **Depth ceiling**: Off / Surface / Under, plus a **Lock ceiling** toggle. "Nothing in the app can go louder than this."
- Default mode: Drift / Steady
- Swap left and right
- Noise only (no beats)
- Headphones: Run the check again · Spatial Audio help

**Senses and motion**
- **Still screen** (no animation; follows the OS Reduce Motion setting automatically and can be forced on)
- **Sensory mode**: one switch that sets 15 s fades, ceiling Under (locked), Steady, Still screen, haptics off and no chimes. "You can still change each one."
- **Plain labels**: show literal labels on screen ("Start sound", "Time left", "Stopped after 52 minutes")
- Haptics: off (default) / a soft tick on start and stop
- Break chime: on / off

**Display**
- Theme: Evening (default) / Daylight / Match system
- **Low glow**: Automatic after sunset for Sleep and Unwind (default) / Always at night / Off. "Keeps the screen under about 40 cd/m² and removes blue."
- **Text**: Standard / Legible: Lexend / Legible: Atkinson Hyperlegible Next. Follows Dynamic Type.
- App icon: Tealight / Plain
- Live Activity style: Warm / Minimal
- Show weekly total on the main screen: on / off

**Privacy:** "Everything stays on this phone. No account. No trackers." Export my data (JSON) · Delete all data.
**About:** What we know · How mixing works · Version and preset changelog · Licences.

### 5.10 What we know (science page, no metaphor)

- The verbatim copy from brand.md §5 (≤ 60 ch lines, Lexend 16/26).
- **Read the studies (6):** a plain citation list, each with a one-line plain summary and the direction of the finding (benefit / no effect / negative). It must include the Nigg et al. 2024 noise meta-analysis, the Ingendoh et al. 2023 systematic review, and the negative-finding study. The core team owns the exact citation list in `docs/`.
- **Safety:** not a medical device; epilepsy and seizure note; don't use Sleep while driving; keep volume low (with a link to the OS headphone-safety setting).
- [Try a blind comparison] (P2: shows the Plus explainer, honest about what it does).

### 5.11 This week (totals)

- "Kept you company **3 h 40 m** this week · 6 sessions." There's a simple bar per day in `waxDim` with no target line. Breakdown by intent. **No streaks, no comparisons framed as better or worse** (core `compareRanges` copy is neutral: "a little more than last week").
- Optional per-session 1-tap rating ("How did that feel?" 1–5, skippable, never asked twice in a row).

### 5.12 Plus (P2, shown only from the Menu)

- Plain copy from the copy bank. Lists exactly what Plus adds (schedules, experiments, Health, sync). Reminder 3 days before any charge. Cancel in two taps. No metaphor and no countdown timers. **Never shown before the first sound, and never interrupts a session.**

---

## 6. State model (for prototype and core)

```
idle ──hold/tap/a11y──► lighting (fadeIn) ──► lit ◄──tap──► softened (Deep)
  ▲                                            │  └─ timer ends ─► goingOut (fadeOut) ─► ended ("It went out…") ─8s─► idle
  │                                            ├─ hold / Stop ──► goingOut
  │                                            ├─ break ──► break (Surface, 5 min) ─► chime ─► idle (or next block if auto-continue)
  └──────────── route lost / call ◄────────────┴─ paused (1.5 s fade) ─[Resume]─► lit
Orthogonal: mode ∈ {binaural, noiseOnly}; motion ∈ {drift, steady}; theme ∈ {evening, daylight, lowGlow}; labels ∈ {warm, plain}
```

## 7. Accessibility acceptance criteria

- Every control has a literal accessibility label. The flame exposes custom actions (Start, Stop, Soften, Restore, Break).
- All targets are ≥ 48 px. The primary flame target is ≥ 160 px.
- Text contrast: body ≥ 7:1 on Evening and Daylight. Low glow body ~6:1 (an intentional night exception). Controls ≥ 3:1.
- Reduce Motion means zero ambient animation. No content flashes more than 3 times per second, ever. The beat is never visualised.
- Everything can be operated by keyboard in the web prototype, with a visible `wick` focus ring (2 px, 2 px offset).
- Dynamic Type up to AX3 without clipping the primary action.

## 8. Prototype demo script (what the final demo must show)

1. First launch → Onboarding 1 → headphone check passes → halves join → Main (Focus).
2. Hold to light → 8 s fade-in, with "Your audio is playing above" shown (a toggle simulates other audio).
3. Change Depth Under → Deep. Tap the flame to soften, tap again to restore.
4. Open the spec card from idle *and* from lit: 16 Hz, L 192 / R 208. Edit the beat to 14 Hz, see a live glide, then Save as my sound.
5. Set a 25 min timer and time-lapse it (`createManualClock`) → wax pool → 30 s go-out → "It went out after 25 minutes." → Break.
6. Switch to Steady (still flame, locked) and Sleep after sunset (Low glow, Evening descent).
7. Headphone states: speaker, mono, Spatial Audio (dev toggle) → saffron banner → noise only (whole flame).
8. Settings: Tap to start, Plain labels on (labels change on Main), Legible text, Still screen.
9. What we know sheet.

## 9. Core gaps for the backend team (UI-independent work)

These don't depend on visual design and should land in `core/`:

1. **`steady` built-in preset** (10 Hz / 180 Hz, brown 35%, 15 s fade-in, Drift off, frozen).
2. **Drift**: a seeded, bounded, slow random walk on the beat (±range Hz, ≥5 min period) and on noise level (±2 dB), deterministic per session seed. Must be exactly off in Steady (bit-for-bit identical parameters).
3. **Depth**: map Surface / Under / Deep ↔ volume (`tokens.json → depth`), with fine values between, plus `depthCeiling` and `ceilingLocked` in Settings. The engine clamps volume to the ceiling in one place.
4. **Soften / restore and Break** as player actions (Soften → Deep over 1.2 s; Break → Surface for N min, then chime, then stop).
5. **Preset versioning**: `version` on built-ins, frozen user copies, a `diffPresets(a, b)` that returns human-readable changes, and reset to default.
6. **Settings additions**: `startMode: 'hold' | 'tap'`, `plainLabels`, `legibleFont: 'none' | 'lexend' | 'atkinson'`, `lowGlow: 'auto' | 'always' | 'off'`, `swapChannels`, `noiseOnly`, `fadeInSec`, `fadeOutSec`, `motion: 'drift' | 'steady'`, `stillScreen`, `liveActivityStyle`, `appIcon`, `breakChime`, `autoContinue`, `showWeeklyTotal`. Each with a migration.
7. **UI naming**: display names Unwind, Long focus and Evening descent (keep the ids stable).
8. **Headphone-state model**: `speaker | oneEar | mono | spatial | stereoOk | swapped | disconnected`. It combines `interpretStereoCheck` with platform route flags, and the native engines feed it.
9. **Audio-indicator model**: `otherAudio: 'playing' | 'none' | 'unknown'`, never a name.
10. **Session-end copy helpers** with neutral, no-guilt phrasing, and a literal variant for Plain labels.
