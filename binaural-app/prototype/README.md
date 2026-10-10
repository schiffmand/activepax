# Tuck prototype

The interactive phone demo for Tuck (brand: `../docs/brand.md`, spec: `../docs/product-spec.md`). It plays real binaural beats in the browser through the core engine (`../core/src`, imported with the Vite alias `@core`), under a simulated "other app" so you can hear how the layer sits beneath your audio. Use stereo headphones.

```bash
npm install
npm run dev      # http://localhost:5173 (?screen=home skips onboarding, ?reset=1 clears data)
npm run build    # typecheck, then ONE self-contained dist/index.html (fonts, JS and CSS inlined; works from file://)
```

- Stack: Vite 7, React 19, TypeScript, Tailwind 4, motion. `vite-plugin-singlefile` does the inlining.
- Audio: `src/audio/layerEngine.ts` puts core's `BinauralEngine` (the tones) and a noise bed (built with core's `generateNoise`) behind one `EngineLike`, which core's `ProgramPlayer` drives. Splitting them lets the beat glide away and back (noise only, call mode) while the noise keeps playing. `src/audio/hub.ts` holds the shared AudioContext and the left/right swap router. `src/audio/warpClock.ts` is the time-lapse clock.
- State: core's `createStore` with `localStorageAdapter` holds saved layers, history, last played and the core settings. Tuck-only settings from spec §5.9 sit beside it in `tuck/prefs`, until core's schema v3 lands.
- Layer model: `src/tuck/layers.ts` holds the five intents with the spec §3 numbers (Focus 14 Hz / 207 Hz, Steady, noise beds, Drift / Hold). `src/tuck/copy.ts` holds the arrival mapping and the copy bank, warm and plain.
- How to reach every screen: [`SCREENS.md`](./SCREENS.md).
