# Tuck: Sound Under Your Audio

*Tuck a little sound under whatever you're playing.*

Tuck is a phone app that plays binaural beats and gentle noise **underneath** whatever you already listen to (Spotify, podcasts, lectures, YouTube) as a persistent background layer. It never pauses or ducks your audio. Binaural beats need stereo headphones, so Tuck checks your ears and falls back to loudness-matched noise when the beat can't form (speaker, Mono Audio, one earbud). It makes no medical claims: the science is mixed, and the app says so.

It is incubating inside `activepax` and will move to its own repo.

**Start here:** [`docs/final-report.md`](docs/final-report.md) covers positioning, personas, decisions, council scores, what's real vs mocked, the native plan and business notes. Every screen is in [`docs/screens/`](docs/screens/).

## Layout

| Path | What |
|---|---|
| `docs/` | Research ([`competitors.md`](docs/competitors.md)), [`personas.md`](docs/personas.md), brand ([`brand.md`](docs/brand.md), [`tokens.json`](docs/tokens.json), [`logo.svg`](docs/logo.svg)), [`product-spec.md`](docs/product-spec.md), council and expert reviews ([`reviews/`](docs/reviews/)), [`screens/`](docs/screens/) (46 PNGs, 390×844 @2x) |
| `core/` | `@binaural/core`: the UI-independent TypeScript engine (Web Audio binaural + noise, programs, scheduler, store, insights, stereo check). 174 vitest tests. [README](core/README.md) |
| `native/` | iOS (Swift, `AVAudioSession .playback + .mixWithOthers`) and Android (Kotlin, no audio focus, `mediaPlayback` foreground service) reference engines. These have not been compiled yet. [README](native/README.md) |
| `prototype/` | Interactive React demo that plays real beats under a simulated "other app". It builds to one self-contained `dist/index.html`. [README](prototype/README.md), [SCREENS.md](prototype/SCREENS.md) |
| `tools/` | Playwright helpers: `shoot.mjs` (one flow) and `shoot-all.mjs` (every screen to `docs/screens/`) |

## Run it

```bash
cd core && npm install && npm test && npm run typecheck
cd ../prototype && npm install && npm run build   # → prototype/dist/index.html (open it directly; use stereo headphones)
npm run dev                                       # http://localhost:5173  (?screen=home skips onboarding)
cd ../tools && npm install && node shoot-all.mjs  # re-capture every screen into docs/screens/
```

## Status

The prototype and core are complete. The next step is a native iOS TestFlight MVP (a 6-week plan is in the final report, §7). Launch gates: trademark clearance for "Tuck" (the fallback is "Lining"), and confirming that the layer plays under other apps on real devices.
