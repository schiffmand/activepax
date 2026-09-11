# workout_audio

Turns a structured workout (`workout.yaml`) into a single polished,
Peloton/SoulCycle-style audio file: continuous music underneath, coaching
voice ducking in and out on cue, timed transitions, safety reminders,
warm-up to finish — no interaction required once you hit play.

## One-command build

```bash
pip install -r requirements.txt
sudo apt-get install -y ffmpeg espeak-ng mbrola mbrola-us3   # Linux; see below for macOS
python build.py workout.yaml
```

Optional flags:

```bash
python build.py workout.yaml --voice male --music-dir audio/music
```

Output lands in `output/`:

- `<base_name>.mp3` / `.m4a` — the finished workout
- `timeline.txt` — human-readable schedule of every segment and spoken cue
- `build_log.txt` — TTS engine used, music source, validation results, timings

## How it works

```
workout.yaml  →  src/timeline.py   (parse + schedule cues using real TTS durations)
              →  src/tts.py        (synthesize each line of narration)
              →  src/music.py      (build the continuous music bed)
              →  src/renderer.py   (duck music under narration, mix, normalize, export)
              →  src/validation.py (automated checks, before and after rendering)
```

Everything is deterministic: the same `workout.yaml` + same TTS engine
always produces the same timeline and the same mix.

### Music

`src/music.py` first checks `audio/music/` for user-supplied tracks. If
you have properly licensed royalty-free/CC0/public-domain instrumental
electronic tracks, drop them there (any of `.mp3 .wav .m4a .flac .aac
.ogg`) and the build will loop and crossfade them to fill the workout
instead of generating anything.

If that directory is empty, the build **procedurally synthesizes an
original instrumental house-music bed** (kick, sidechained bass, pads,
arpeggiated lead) matched to each section's target BPM/energy — no
external download involved, so there is no licensing question at all.
This is the fallback because every royalty-free music host this
environment tried (Mixkit, Pixabay, Free Music Archive, Incompetech,
Freesound, freepd, archive.org, Wikimedia Commons) was unreachable from
its network sandbox. If you'd rather have real needle-drop tracks, supply
your own in `audio/music/` — see the BPM/energy targets per section in
`workout.yaml` (`music_bpm` / `music_energy` on each section) as a guide.

### Narration / TTS

`src/tts.py` tries, in order:

1. **ElevenLabs** — if `ELEVENLABS_API_KEY` is set (`ELEVENLABS_VOICE_ID` optional)
2. **OpenAI TTS** — if `OPENAI_API_KEY` is set (`OPENAI_TTS_VOICE` optional, default `onyx`)
3. **macOS `say`** — if running on macOS
4. **espeak-ng** (mbrola `mb-us3` diphone voice) — always available offline, and the current fallback in this environment since neither API key is configured and Piper's neural voice models are hosted on Hugging Face, which this sandbox's network policy blocks.

Install for espeak-ng path (Debian/Ubuntu):

```bash
apt-get install -y espeak-ng mbrola mbrola-us3
```

Drop in a real ElevenLabs or OpenAI key any time and the next build will
automatically use it — no code changes needed.

### Mixing and loudness

- Narration ducks the music bed by `audio.narration_duck_db` (workout.yaml,
  default -11 dB) with a fast duck-in and a smooth ~700ms recovery.
- Final master is loudness-normalized via ffmpeg two-pass `loudnorm` to the
  `audio.final_lufs` / `audio.true_peak_db` targets in `workout.yaml`
  (default -15 LUFS integrated, -1 dBTP).
- A soft-clip safety net (tanh) sits before export as a last line of
  defense against transient overs.

## Project layout

```
workout_audio/
  README.md
  requirements.txt
  build.py
  config.yaml         # voice/paths/output defaults
  workout.yaml         # today's workout spec (edit this to change the workout)
  audio/
    music/             # drop your own licensed tracks here (optional)
    voice/generated/    # cached TTS renders (safe to delete, will regenerate)
  src/
    timeline.py
    tts.py
    music.py
    renderer.py
    validation.py
  output/
    <base_name>.mp3
    <base_name>.m4a
    timeline.txt
    build_log.txt
```

## Editing the workout

Each section in `workout.yaml` has `start`/`end` timecodes and a list of
`blocks`, each with its own `start`/`end` and a `lines` list of narration
sentences. The scheduler auto-spaces those lines evenly across the
block's real duration using their actual synthesized speech length, so
you can add/remove/reword cues freely — timing adjusts automatically.
Sections and blocks must be contiguous (no gaps, no overlaps); the build
validates this before doing any expensive rendering.

## Re-rendering

Narration is cached by a hash of its text in `audio/voice/generated/`, so
editing one line and re-running `build.py` only re-synthesizes that line.
Delete `audio/voice/generated/` to force a full re-synthesis (e.g. after
changing `config.yaml`'s voice settings, since those aren't part of the
cache key).
