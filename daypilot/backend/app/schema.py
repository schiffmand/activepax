"""
Core data model for DayPilot. A WorkoutSpec is the one structured object
that the PDF renderer, audio renderer, and frontend all consume -- nothing
downstream ever parses prose.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class DayType(str, Enum):
    strength = "strength"
    hiit = "hiit"
    circuit = "circuit"
    cardio = "cardio"
    mobility = "mobility"


class Experience(str, Enum):
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"


class Profile(BaseModel):
    """Persisted across sessions -- what DayPilot already knows about you."""
    user_id: str
    name: Optional[str] = None
    experience: Experience = Experience.intermediate
    goals: list[str] = Field(default_factory=list)
    chronic_injury_tags: list[str] = Field(default_factory=list)
    default_equipment: list[str] = Field(default_factory=lambda: ["bodyweight", "dumbbells"])
    preferred_duration_min: int = 35


class TodayConstraints(BaseModel):
    """The short daily check-in -- what's true right now, not forever."""
    duration_min: int = 30
    day_type: DayType = DayType.strength
    equipment: list[str] = Field(default_factory=lambda: ["bodyweight", "dumbbells"])
    today_pain_tags: list[str] = Field(default_factory=list)
    today_soreness: list[str] = Field(default_factory=list)
    notes: str = ""


class CueSet(BaseModel):
    setup: str
    breath: str
    tempo_contract_relax: str
    balance_posture: str
    common_fault: Optional[str] = None


class ExerciseBlock(BaseModel):
    """One exercise placement inside the workout, with reps OR interval timing."""
    exercise_id: str
    name: str
    order_index: int
    round_index: int = 1
    sets: Optional[int] = None
    reps: Optional[str] = None
    work_sec: Optional[int] = None
    rest_sec: Optional[int] = None
    tempo_seconds: Optional[dict] = None
    cues: CueSet
    substituted_for: Optional[str] = None
    substitution_reason: Optional[str] = None


class SegmentType(str, Enum):
    warmup = "warmup"
    work = "work"
    rest = "rest"
    round_rest = "round_rest"
    cooldown = "cooldown"


class WorkoutSpec(BaseModel):
    workout_id: str
    user_id: str
    created_at: str
    day_type: DayType
    duration_min_target: int
    title: str
    blocks: list[ExerciseBlock]
    warnings: list[str] = Field(default_factory=list)


class RenderedAssets(BaseModel):
    workout_id: str
    pdf_path: str
    audio_path: str
    timeline_path: str
    duration_sec: float
    validation_report: dict
