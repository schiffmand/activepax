# Goal tracks

Eight ready-made journeys named by what you want to do, so nobody has to pick a frequency. They live in
`core/src/tracks.ts` (`GOAL_TRACKS`, plain `Program` data, tested in `core/test/tracks.test.ts`) and appear in the
prototype as **Pick a goal** on Home and a **Goals** section in the layer picker.

| Goal | Length | What plays |
|---|---|---|
| Meditate | 20 min | 10 Hz easing to 6 Hz over 8 min, held, lifting to 8 Hz for the last 2. Pink noise. |
| Focus | 50 min | 10 Hz rising to 14 Hz over 5 min, then held. Brown noise. |
| Relax | 30 min | 10 Hz easing to 8 Hz over 10 min. Pink noise. |
| Unwind | 30 min | 12 Hz slowing to 7 Hz over 15 min, then softer. Pink noise. |
| Ease anxious energy | 15 min | Starts at 12 Hz, slows to 8 Hz while the sound swells and falls six times a minute (a breathing pace). Brown noise. |
| Get ready for sleep | 45 min | 8 Hz slowing to 3 Hz over 30 min, then quieter, then a 60 s fade. Brown noise. |
| Deep sleep | all night | 4 Hz slowing to 2 Hz over 20 min, then the tones sink under steady brown noise until stopped. |
| Wake up & make coffee | 12 min | Starts soft at 6 Hz and climbs to 16 Hz, louder and brighter. Pink noise. |

The goal names say what the listener wants to do; the descriptions say only what plays (no outcome claims, as
in `docs/brand.md`). "Release anxiety" was renamed **Ease anxious energy** for that reason; rename freely.

## Audio files

`docs/tracks/*-preview.m4a`: about 2 minutes each, four real-time 30 s excerpts (start, 30%, 62%, the end)
joined with short crossfades, so you hear the arc at its true speed. Headphones on.

Full-length renders are produced on demand (about 230 MB for all eight, so they aren't committed):

```bash
node tracks/curves.mjs /tmp/curves.json 60          # samples core's programs (deep sleep rendered as 60 min)
python3 tracks/synth.py /tmp/curves.json /tmp/tracks preview
python3 tracks/synth.py /tmp/curves.json /tmp/tracks full
```

`curves.mjs` bundles `core` with esbuild and samples each program with core's own `sampleProgram`, so the files
follow exactly what the app's engine plays. Files are mastered with the beat at −20 dBFS RMS per ear, louder
than the in-app Medium level, because nothing else plays on top of them.
