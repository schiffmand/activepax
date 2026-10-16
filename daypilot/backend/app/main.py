"""
DayPilot backend. Thin FastAPI layer over the generation + render pipeline.
Rendering runs synchronously in-process for the prototype (no queue) --
real enough to prove the loop, simple enough to run anywhere.
"""
from __future__ import annotations

import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "render"))

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from schema import Profile, TodayConstraints, WorkoutSpec, DayType
from generator import generate_workout
from timeline import build_timeline
from tts import TTSAdapter, VoiceConfig
from renderer import schedule_cues, mix_master, export_audio, write_timeline_txt, write_schedule_json
from pdf import render_workout_pdf

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "generated"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
VOICE_CACHE_DIR = Path(__file__).resolve().parent.parent / "voice_cache"

app = FastAPI(title="DayPilot API")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)
app.mount("/files", StaticFiles(directory=str(OUTPUT_DIR)), name="files")

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"

PROFILES: dict[str, Profile] = {}
JOBS: dict[str, dict] = {}

INTRO_TEMPLATES = {
    DayType.strength: "Good to see you. Let's build some strength today.",
    DayType.hiit: "Good to see you. Let's get your heart rate up today.",
    DayType.circuit: "Good to see you. Circuit day -- let's move.",
    DayType.cardio: "Good to see you. Let's get moving today.",
    DayType.mobility: "Good to see you. Let's open things up today.",
}
OUTRO_TEMPLATES = {
    None: (
        "Good. Notice how you feel now compared to when you started. "
        "If anything we flagged today felt off, tell me next time and I'll adjust. "
        "Nice work."
    ),
}


class IntakeIn(BaseModel):
    user_id: str
    name: str | None = None
    experience: str = "intermediate"
    goals: list[str] = []
    chronic_injury_tags: list[str] = []
    default_equipment: list[str] = ["bodyweight", "dumbbells"]
    preferred_duration_min: int = 35


class GenerateIn(BaseModel):
    user_id: str
    duration_min: int = 30
    day_type: DayType = DayType.strength
    equipment: list[str] = ["bodyweight", "dumbbells"]
    today_pain_tags: list[str] = []
    today_soreness: list[str] = []
    notes: str = ""


@app.post("/v1/intake")
def submit_intake(body: IntakeIn) -> dict:
    profile = Profile(**body.model_dump())
    PROFILES[profile.user_id] = profile
    return {"user_id": profile.user_id, "status": "ok"}


@app.get("/v1/profile/{user_id}")
def get_profile(user_id: str) -> Profile:
    if user_id not in PROFILES:
        raise HTTPException(404, "No profile for this user yet -- call /v1/intake first.")
    return PROFILES[user_id]


def _render_job(job_id: str, profile: Profile, today: TodayConstraints) -> None:
    job = JOBS[job_id]
    try:
        job["stage"] = "generating_spec"
        spec = generate_workout(profile, today)
        job["spec"] = spec.model_dump()
        job["progress"] = 15

        job["stage"] = "rendering_pdf"
        work_dir = OUTPUT_DIR / spec.workout_id
        work_dir.mkdir(parents=True, exist_ok=True)
        pdf_path = render_workout_pdf(spec, work_dir / "workout.pdf")
        job["pdf_url"] = f"/files/{spec.workout_id}/workout.pdf"
        job["progress"] = 35

        job["stage"] = "scheduling_audio"
        intro = INTRO_TEMPLATES.get(today.day_type, "Good to see you. Let's get into it.")
        outro = OUTRO_TEMPLATES[None]

        adapter = TTSAdapter(VOICE_CACHE_DIR, VoiceConfig())
        job["tts_engine"] = adapter.engine_used
        # Synthesize the fixed bookend lines first so the timeline is sized
        # to their real spoken length -- never guessed, never dropped.
        from renderer import _wav_duration_sec
        intro_dur = _wav_duration_sec(adapter.synth(intro))
        outro_dur = _wav_duration_sec(adapter.synth(outro))
        tl = build_timeline(
            spec, intro_line=intro, outro_line=outro,
            intro_duration_sec=intro_dur, outro_duration_sec=outro_dur,
        )

        cue_warnings: list[str] = []
        cues = schedule_cues(tl, adapter, cue_warnings)
        job["progress"] = 60

        job["stage"] = "rendering_audio"
        mix = mix_master(tl, cues)
        job["progress"] = 85

        job["stage"] = "exporting"
        result = export_audio(mix, work_dir, "workout")
        write_timeline_txt(tl, cues, work_dir / "timeline.txt")
        write_schedule_json(tl, cues, work_dir / "schedule.json")

        job["audio_url"] = f"/files/{spec.workout_id}/workout.mp3"
        job["audio_m4a_url"] = f"/files/{spec.workout_id}/workout.m4a"
        job["timeline_url"] = f"/files/{spec.workout_id}/timeline.txt"
        job["schedule_url"] = f"/files/{spec.workout_id}/schedule.json"
        job["duration_sec"] = tl.total_duration_sec
        job["loudness"] = result["measured_loudness"]
        job["warnings"] = spec.warnings + cue_warnings
        job["workout_id"] = spec.workout_id
        job["progress"] = 100
        job["stage"] = "ready"
    except Exception as e:  # noqa: BLE001
        job["stage"] = "failed"
        job["error"] = str(e)
        raise


@app.post("/v1/workouts/generate")
def generate(body: GenerateIn) -> dict:
    profile = PROFILES.get(body.user_id) or Profile(user_id=body.user_id)
    today = TodayConstraints(
        duration_min=body.duration_min, day_type=body.day_type, equipment=body.equipment,
        today_pain_tags=body.today_pain_tags, today_soreness=body.today_soreness, notes=body.notes,
    )
    job_id = str(uuid.uuid4())[:8]
    JOBS[job_id] = {"stage": "queued", "progress": 0}
    _render_job(job_id, profile, today)  # synchronous for the prototype
    return {"job_id": job_id, **JOBS[job_id]}


@app.get("/v1/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    if job_id not in JOBS:
        raise HTTPException(404, "Unknown job id.")
    return JOBS[job_id]


@app.get("/v1/health")
def health() -> dict:
    return {"status": "ok", "time": time.time()}


# Mounted last so the API routes above always take precedence.
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
