# Tooling: wireframing, prototyping and the path to native

> Goal: get from brand to a convincing, interactive phone demo quickly, then to a real native app, while keeping a UI-independent core (`core/`) that survives every redesign.

## What's installed for this project (Oct 2026)

| Tool | Where | Why |
|---|---|---|
| **anthropics/skills: `frontend-design`** | `.claude/skills/frontend-design` | Pushes away from templated "AI default" UI (Inter, purple gradients, card soup) toward an intentional aesthetic direction: typography, color, motion. Use it before every UI pass. |
| **`web-artifacts-builder`** | `.claude/skills/web-artifacts-builder` | React + Tailwind + shadcn/ui scaffold and a bundling-to-single-HTML workflow. Good for shareable one-file demos. |
| **`theme-factory`** | `.claude/skills/theme-factory` | Generates coherent theme token sets (color plus font pairings) to explore brand directions side by side. |
| **`canvas-design`** | `.claude/skills/canvas-design` | Static brand art (posters, app-icon explorations, mood boards) as PNG/PDF from a written design philosophy. |
| **`webapp-testing`** | `.claude/skills/webapp-testing` | Playwright-driven local app testing: screenshots, console logs, interaction scripts. |
| **Playwright screenshot helper** | `tools/shoot.mjs` | `node tools/shoot.mjs <url> <outPrefix> [selector...]` captures 390×844 @2x frames after clicks. This closes the design loop: the agent *sees* the UI it built and critiques it. |
| **Prototype stack** | `prototype/` | **React + Vite + Tailwind + `motion`** (Framer Motion). Real **Web Audio** synthesis of binaural tones plus noise, so the demo actually *sounds* right on headphones. It isn't a mock. |
| **Core engine** | `core/` | TypeScript, framework-free, **vitest**-tested. Owns presets, programs (frequency ramps), mixer math, session state machine, headphone-check logic, and the self-experiment stats. The prototype and native apps both consume it (or port it). |

Note: the claude.ai **Figma** connector exists, but it failed to connect in this cloud session (proxy 403). The workflow below doesn't require it.

## Landscape: what's best for each job

### 1. Exploring the design (concepts and brand)
- **Claude Code + `frontend-design` plus a screenshot loop (chosen).** Writing code *is* the wireframe. Iterating on real React with real motion and real audio beats static frames for a sound product. The critique loop (build → `shoot.mjs` → Read PNG → critique → fix) is fast and fully autonomous.
- **Figma + Figma MCP server** (remote endpoint `https://mcp.figma.com/mcp`). Bidirectional since Feb 2026: *design → code* (agents read layers, variables and Code Connect mappings) and *code → canvas* (push rendered browser UI into Figma as editable frames). **Recommended next** once a human designer joins: push the prototype screens into Figma for hand refinement, then use Code Connect so agents reuse real components instead of regenerating them.
- **Claude Design / Claude artifacts.** Fast shareable HTML mockups for stakeholder review. Good for "here's three directions."
- **v0 (Vercel), Lovable, Bolt, Magic Patterns.** Prompt-to-UI generators. Good for quick throwaway exploration, but output trends generic and adds lock-in. Use only to brainstorm layouts.
- **Framer.** Best for the **marketing site** and high-fidelity motion prototypes that a non-engineer can tweak. Recommended for the launch landing page.
- **Adobe Express / Firefly (MCP available here).** Brand assets, social graphics, App Store screenshots later.

### 2. Components and styling
- **Tailwind CSS plus design tokens as CSS variables** (chosen). Tokens map one-to-one to native (SwiftUI `Color` asset catalog, Compose `MaterialTheme`) later.
- **shadcn/ui (Radix primitives).** Accessible primitives (sliders, sheets, dialogs, switches). Use them for behaviour and restyle completely. Accessibility matters for our neurodivergent audience: focus management, reduced motion, screen readers.
- **`motion` (Framer Motion).** Breath-paced, spring-based animation. Respects `prefers-reduced-motion` through `useReducedMotion`.

### 3. Motion and illustrative animation
- **Rive.** *Recommended next* for the hero "pulse/orb" visual. It has a state machine, so the visual can respond to live parameters (beat Hz, volume, drift) at tiny file size, and the same `.riv` runs on web, iOS (RiveRuntime), Android and React Native. Better than Lottie for interactive, data-driven animation.
- **Lottie.** Fine for one-shot illustrations (onboarding headphone check, success ticks). Keep any looping animation subtle and optional.
- **Canvas/WebGL shaders.** For a calm generative background. Must have a static fallback for Reduce Motion users and to save battery.

### 4. Testing the design
- **Playwright** (installed) for screenshots and flows. Add **visual regression** (`toHaveScreenshot`) once the design stabilises.
- **axe-core / @axe-core/playwright** (recommended next) for automated accessibility checks: contrast, labels, focus order.
- **Storybook** (optional) once components stabilise, for review by persona-council agents.

### 5. Audio prototyping
- **Web Audio API** (chosen for the demo): two `OscillatorNode`s → `ChannelMergerNode` (L/R) plus a noise `AudioBufferSourceNode` (brown/pink generated procedurally) → gain with exponential ramps for click-free fades. Note that a browser demo *cannot* demonstrate mixing with Spotify the way a native app does, but it can show the experience over any other tab's audio.
- **Tone.js** is an optional convenience. Plain Web Audio is enough and keeps the dependency count low.

## Path to a real native app

The hard part is the **audio session**: mixing with other apps, background persistence, interruptions and route changes (headphones unplugged, Bluetooth). Everything else is ordinary app UI.

### Option A: Native Swift (SwiftUI + AVAudioEngine) and Kotlin (Compose + AudioTrack/Oboe). **Recommended for v1 audio quality.**
- iOS: `AVAudioSession.setCategory(.playback, options: [.mixWithOthers])`, `UIBackgroundModes: audio`, `AVAudioSourceNode` rendering sine L/R plus noise sample-accurately. Handle `interruptionNotification`, `routeChangeNotification` (detect headphone vs. speaker vs. Bluetooth HFP), and `AVAudioSession.currentRoute` to drive the headphone check. Since a mixing app can't own Now Playing, controls go through **Live Activity (ActivityKit), WidgetKit, Control Center controls (iOS 18+), App Intents/Shortcuts, watchOS**.
- Android: no `requestAudioFocus` (so we never pause Spotify), `AudioTrack` (or Oboe/AAudio for low latency) rendering stereo PCM, a `mediaPlayback` foreground service with a notification carrying controls, Quick Settings tile, Glance widget, `AudioDeviceCallback` for route detection.
- Pros: best audio fidelity, battery and platform integration (Live Activities, Control Center, Watch). Cons: two codebases.

### Option B: Expo / React Native with a custom native audio module. **Recommended if speed and a single team matter more.**
- UI in React Native (much of the prototype's component thinking and `core/` TypeScript reused directly).
- **Don't** rely on `expo-audio` alone. It supports `interruptionMode: 'mixWithOthers'`, but lock-screen controls require `doNotMix`, there are open Android `interruptionMode` issues (expo/expo#34025), and file-based playback can't do real-time parameter drift. Instead, write an **Expo Module** (Swift + Kotlin) that wraps the same AVAudioEngine / AudioTrack synth as Option A and exposes `start(params)`, `setParams`, `fadeOut`, plus route and interruption events to JS.
- Live Activities and widgets still need native Swift targets (supported through Expo config plugins and `expo-apple-targets`).
- `react-native-audio-api` (Software Mansion's Web-Audio-compatible API) is worth evaluating, since it could let the prototype's Web Audio graph port almost verbatim. **(verify maturity and mixWithOthers support)**

### Recommendation
1. **Now:** web prototype (done in this repo) plus a TypeScript `core/` with tests, plus `native/` reference engines (Swift `AVAudioSourceNode`, Kotlin `AudioTrack`) that prove the mixing behaviour.
2. **Next 4–6 weeks:** **Expo + custom native audio module** for an internal TestFlight / Play internal track. Keep the native synth small and well-tested so it can move to fully native later at no cost.
3. **Later:** go fully native on iOS if the Watch app, Live Activity polish or audio quality demand it. The native audio module already is the hard part.

## Recommended next installs (priority order)
1. **Figma MCP (remote)** once someone has a Figma seat: code → canvas handoff for human designers, then Code Connect.
2. **@axe-core/playwright** for accessibility checks in CI (an essential quality bar for this audience).
3. **Rive** runtime plus editor for the interactive pulse visual.
4. **Expo SDK + EAS Build** and **expo-apple-targets** for the native path.
5. **Playwright visual regression** baselines when the design is stable.
6. **Framer** for the marketing site and waitlist.
