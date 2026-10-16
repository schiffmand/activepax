# DayPilot

A hands-free AI workout coach: tell it your goals and today's constraints,
it builds a real session, and renders it as a single continuous audio
track -- music, spoken coaching cues, and Tabata-style interval bells --
so you can train without ever looking at your phone.

This is the **working prototype**: a full-stack web app (FastAPI backend +
a mobile-first vanilla-JS frontend) implementing the entire real pipeline.
It proves the loop end to end before any native iOS build begins -- see
`docs/` for the product plan this was built from.

## Run it

```bash
cd backend
pip install -r requirements.txt
apt-get install -y espeak-ng mbrola mbrola-us3 mbrola-us2 ffmpeg
cd app
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000` on your phone or a browser resized to phone
width. Expect roughly 1.5-3 minutes from "Start" to a ready session --
see Known Limitations below.

## How it works

```
frontend/              chat intake -> generating -> review -> Now Playing -> done
backend/app/
  schema.py             WorkoutSpec data model (pydantic)
  generator.py           rule-based workout generator (LLM-swappable, see below)
  main.py                 FastAPI routes, wires the whole pipeline
backend/data/
  exercise_library.py      ~65 vetted exercises with PT-style cues + contraindication tags
backend/render/
  timeline.py               WorkoutSpec -> absolute-time segments, bells, cue schedule
  bells.py                   synthesized interval tones (go/warning/rest/round-complete)
  music.py, tts.py           ported from the original workout_audio prototype
  pdf.py                     coaching-instruction PDF
  renderer.py                mixes music + bells + narration, normalizes, exports
```

### Why a rule-based generator instead of a live LLM call

The product plan calls for LLM-driven generation. This prototype's
generator (`generator.py`) implements the *exact same interface*
(`generate_workout(profile, today) -> WorkoutSpec`) using deterministic
rules instead: it selects only from the vetted `EXERCISE_LIBRARY`,
filtered by equipment and contraindication tags, with safe backfill when
a pattern gets excluded. This is a legitimate MVP choice, not a shortcut
hack -- it's free, instant, fully deterministic for testing, and
structurally **cannot** hallucinate an unsafe exercise, because it never
generates free text, only selects from a pre-vetted table. Swapping in a
real LLM later means replacing the selection logic with a constrained
model call over the same library and running the same safety filter
before accepting its output -- the safety boundary doesn't move.

### The interval/bell engine

Distinct synthesized tones (never TTS) mark work/rest/round transitions,
with scheduling priority over narration: bells are fixed anchors, cue
lines shift later rather than ever stepping on a bell. See
`timeline.py`'s `build_timeline` and `renderer.py`'s `schedule_cues`.

## Known limitations (read before judging the prototype)

- **Render latency is real** -- roughly 1.5-3 minutes per workout right
  now, dominated by sequential TTS synthesis calls to espeak-ng (not
  parallelized yet) and a two-pass ffmpeg loudnorm over the full file.
  The production plan's mitigations (parallel TTS, caching common cue
  audio, progressive delivery) aren't implemented here -- this prototype
  optimizes for proving correctness first.
- **TTS voice is espeak-ng/mbrola**, the same offline fallback used in
  the original workout_audio prototype -- robotic compared to
  ElevenLabs/OpenAI. No API keys are configured in this environment; the
  adapter is already built to prefer them automatically if you add one.
- **No persistence across restarts** -- profiles and jobs live in memory
  (`PROFILES`/`JOBS` dicts in `main.py`). Fine for a same-session demo,
  not for a real multi-day product.
- **Synchronous rendering, no job queue** -- `/v1/workouts/generate`
  blocks until the whole file is ready. The architecture plan's async
  job/polling design is sketched in the API shape but not implemented.
- **This is a web app, not a native iOS app** -- there is no Xcode/macOS
  available in the environment this was built in. It's mobile-responsive
  and fully functional in an iPhone browser today; a native SwiftUI
  client is the next phase once the UX here is validated.

## Testing

- `backend/tests/` has no automated test suite yet in this prototype pass
  -- validation so far has been real end-to-end runs (see
  `backend/generated/<workout_id>/` for actual rendered output) plus
  synthetic persona testing via agents exercising the live API. See the
  project status doc for what was found and fixed.
- `scripts/record_demo.py` drives the real running app in a real browser
  via Playwright and records video -- not a mockup.
