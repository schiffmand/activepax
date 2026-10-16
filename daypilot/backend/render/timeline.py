"""
Converts a WorkoutSpec into a deterministic, absolute-time master timeline:
segments (warmup/work/rest/round_rest/cooldown), bell events (fixed,
non-negotiable anchors), narration cue events (scheduled into the
remaining room, shifted or dropped before they'd step on a bell), and the
music-bed section plan. Same discipline as the original workout_audio
prototype's scheduler, extended for dynamic specs and interval bells.
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))
from schema import WorkoutSpec, ExerciseBlock  # noqa: E402

DEFAULT_STRENGTH_REST_SEC = 42
SECONDS_PER_REP_FALLBACK = 3.0

_REPS_RANGE_RE = re.compile(r"(\d+)\s*-\s*(\d+)")
_REPS_SINGLE_RE = re.compile(r"(\d+)")


def _avg_reps(reps: str | None) -> float:
    """Parses leading numbers out of strings like '8-10', '12', or
    '8-10 per side' -- any trailing text (units, 'per side') is ignored
    rather than crashing the parse."""
    if not reps:
        return 10.0
    m = _REPS_RANGE_RE.search(reps)
    if m:
        return (float(m.group(1)) + float(m.group(2))) / 2
    m = _REPS_SINGLE_RE.search(reps)
    if m:
        return float(m.group(1))
    return 10.0


def _work_sec_for_block(block: ExerciseBlock) -> float:
    if block.work_sec:
        return float(block.work_sec)
    reps = _avg_reps(block.reps)
    tempo = block.tempo_seconds or {}
    per_rep = sum(tempo.values()) if tempo else SECONDS_PER_REP_FALLBACK
    per_rep = per_rep or SECONDS_PER_REP_FALLBACK
    return max(8.0, reps * per_rep)


def _rest_sec_for_block(block: ExerciseBlock, is_last_overall: bool) -> float:
    if is_last_overall:
        return 0.0
    if block.rest_sec is not None:
        return float(block.rest_sec)
    return DEFAULT_STRENGTH_REST_SEC


@dataclass
class Segment:
    kind: str  # warmup | work | rest | round_rest | cooldown
    start_sec: float
    end_sec: float
    block: ExerciseBlock | None = None
    round_boundary: bool = False  # True if this is the last segment of a round


@dataclass
class BellEvent:
    kind: str  # go | warning | rest | round_complete
    at_sec: float


@dataclass
class CueEvent:
    start_sec: float
    text: str
    segment_kind: str
    exercise_name: str


@dataclass
class MusicSection:
    id: str
    duration_sec: float
    bpm: float
    energy: str


@dataclass
class MasterTimeline:
    segments: list[Segment] = field(default_factory=list)
    bells: list[BellEvent] = field(default_factory=list)
    cue_specs: list[tuple[float, str, str, str]] = field(default_factory=list)  # (earliest_start, text, segment_kind, exercise_name)
    music_sections: list[MusicSection] = field(default_factory=list)
    total_duration_sec: float = 0.0


def _cue_lines_for_block(block: ExerciseBlock, kind: str) -> list[str]:
    c = block.cues
    if kind in ("warmup", "cooldown"):
        return [f"{block.name}. {c.setup}", c.breath]

    if block.work_sec:  # interval/HIIT block
        if block.round_index == 1:
            return [f"{block.name}. {c.setup}", c.breath]
        return [c.tempo_contract_relax]

    # strength set
    if block.round_index == 1:
        return [f"{block.name}. {c.setup}", c.breath]
    if block.round_index == 2:
        return [c.tempo_contract_relax]
    return [c.common_fault or c.balance_posture]


def build_timeline(
    spec: WorkoutSpec, *, intro_line: str, outro_line: str,
    intro_duration_sec: float, outro_duration_sec: float,
) -> MasterTimeline:
    """
    intro_duration_sec / outro_duration_sec must be the REAL synthesized
    speech duration of those two lines (caller synthesizes them first via
    the TTS adapter) -- these are fixed bookend messages that must never
    be dropped, so the timeline is sized to fit them exactly rather than
    guessed and hoped for.
    """
    tl = MasterTimeline()
    cursor = 0.0

    # Intro narration (not tied to a segment) gets a dedicated pad sized
    # to its real spoken length.
    tl.cue_specs.append((0.5, intro_line, "intro", "Welcome"))
    cursor = 0.5 + intro_duration_sec + 1.0

    n = len(spec.blocks)
    rounds_seen: dict[int, int] = {}
    # figure out last block index per round to know round boundaries
    last_idx_of_round: dict[int, int] = {}
    for i, b in enumerate(spec.blocks):
        last_idx_of_round[b.round_index] = i

    warmup_start = cursor
    music_groups: list[tuple[str, float, float]] = []  # (energy_key, start, end) accumulated below
    current_group_kind = None
    group_start = cursor

    for i, block in enumerate(spec.blocks):
        kind = "warmup" if block.round_index == 0 else ("cooldown" if block.round_index == 99 else "work")
        work_sec = _work_sec_for_block(block)
        work_start = cursor
        work_end = cursor + work_sec
        tl.segments.append(Segment("warmup" if kind == "warmup" else ("cooldown" if kind == "cooldown" else "work"),
                                    work_start, work_end, block=block))

        tl.bells.append(BellEvent("go", work_start))
        if work_sec >= 25:
            tl.bells.append(BellEvent("warning", work_end - 15))

        for line in _cue_lines_for_block(block, kind):
            tl.cue_specs.append((work_start + 0.4, line, kind, block.name))

        cursor = work_end

        is_last_overall = (i == n - 1)
        rest_sec = _rest_sec_for_block(block, is_last_overall)
        is_round_end = (i == last_idx_of_round.get(block.round_index, -1)) and kind == "work"

        if rest_sec > 0:
            rest_start = cursor
            rest_end = cursor + rest_sec
            rest_kind = "round_rest" if is_round_end else "rest"
            tl.segments.append(Segment(rest_kind, rest_start, rest_end, block=block, round_boundary=is_round_end))
            tl.bells.append(BellEvent("round_complete" if is_round_end else "rest", rest_start))
            cursor = rest_end

        # music section grouping: warmup | main (work-day-type) | cooldown
        group_kind = "warmup" if kind == "warmup" else ("cooldown" if kind == "cooldown" else "main")
        if current_group_kind is None:
            current_group_kind = group_kind
            group_start = warmup_start if kind == "warmup" else work_start
        elif group_kind != current_group_kind:
            music_groups.append((current_group_kind, group_start, work_start))
            current_group_kind = group_kind
            group_start = work_start

    music_groups.append((current_group_kind or "main", group_start, cursor))

    tl.cue_specs.append((cursor + 1.0, outro_line, "outro", "Nice work"))
    cursor += 1.0 + outro_duration_sec + 1.5

    tl.total_duration_sec = cursor

    energy_by_day = {
        "strength": "strength", "hiit": "peak", "circuit": "peak",
        "cardio": "peak", "mobility": "warmup",
    }
    bpm_by_day = {"strength": 124, "hiit": 128, "circuit": 126, "cardio": 128, "mobility": 118}
    main_energy = energy_by_day.get(spec.day_type.value, "strength")
    main_bpm = bpm_by_day.get(spec.day_type.value, 124)

    for idx, (gkind, gstart, gend) in enumerate(music_groups):
        if gend <= gstart:
            continue
        if gkind == "warmup":
            energy, bpm = "warmup", 120
        elif gkind == "cooldown":
            energy, bpm = "release", 118
        else:
            energy, bpm = main_energy, main_bpm
        tl.music_sections.append(MusicSection(f"sec{idx}", gend - gstart, bpm, energy))

    return tl
