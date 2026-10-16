"""
Rule-based WorkoutSpec generator.

This stands in for the "LLM-driven generation" described in the product
plan, behind the exact same interface a real LLM call would use:
`generate_workout(profile, today) -> WorkoutSpec`. A rule-based generator
is the right MVP choice here: it's deterministic, free, instantly testable,
and -- critically -- it can never hallucinate an unsafe exercise, because
it only ever selects from the vetted EXERCISE_LIBRARY and filters by
contraindication tags before anything is placed. Swapping in a real LLM
later means replacing `_select_exercise_for_pattern` with a model call
constrained to this same library (retrieval, not free generation) and
running the same `_safety_filter` pass before accepting its output --
the safety boundary does not move when the generator does.
"""
from __future__ import annotations

import re
import sys
import uuid
import random
import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "data"))
from exercise_library import EXERCISE_LIBRARY  # noqa: E402

from schema import (  # noqa: E402
    CueSet, DayType, ExerciseBlock, Profile, TodayConstraints, WorkoutSpec,
)

LIBRARY_BY_ID = {e["id"]: e for e in EXERCISE_LIBRARY}

# Interval-style days draw from a shared, overlapping pool -- a library
# entry tagged only "circuit" is still perfectly good HIIT material, and
# vice versa. Keeps the generator robust to how finely a content pass
# happened to label things, instead of requiring an exact day_type match.
DAY_TYPE_COMPAT = {
    "hiit": {"hiit", "circuit", "cardio"},
    "circuit": {"circuit", "hiit", "cardio"},
    "cardio": {"cardio", "hiit", "circuit"},
    "strength": {"strength"},
    "mobility": {"mobility"},
}

STRENGTH_PATTERN_ORDER = [
    "hinge", "squat", "push_horizontal", "pull_horizontal",
    "push_vertical", "pull_vertical", "lunge", "core",
]
# Tried in order for warm-up/cool-down "cardio"/"mobility" slots -- these
# aren't a day_type match question, just "what's the calmest version of
# this pattern that exists," so they're resolved directly against
# _candidates() rather than through _select_exercise_for_pattern(), which
# is reserved for cases where a real constraint actually excluded something.
WARMUP_COOLDOWN_DAY_TYPES_TRY = ("mobility", "circuit", "strength")
WARMUP_PATTERNS = ["mobility", "cardio"]
COOLDOWN_PATTERNS = ["calf", "ankle", "mobility"]
HIIT_PATTERNS = [
    "cardio", "squat", "push_horizontal", "core", "lunge",
    "pull_horizontal", "cardio", "hinge",
]
MOBILITY_PATTERNS = [
    "mobility", "hinge", "lunge", "core", "rotation",
    "calf", "ankle", "pull_horizontal", "squat",
]

DEFAULT_STRENGTH_REST_SEC = 42
_REPS_RANGE_RE = re.compile(r"(\d+)\s*-\s*(\d+)")
_REPS_SINGLE_RE = re.compile(r"(\d+)")


def _avg_reps(reps: str | None) -> float:
    if not reps:
        return 10.0
    m = _REPS_RANGE_RE.search(reps)
    if m:
        return (float(m.group(1)) + float(m.group(2))) / 2
    m = _REPS_SINGLE_RE.search(reps)
    if m:
        return float(m.group(1))
    return 10.0


def _estimate_set_seconds(ex: dict) -> float:
    """Mirrors timeline.py's real duration math so the number of rounds
    chosen here lands close to what actually gets rendered."""
    tempo = ex.get("tempo_seconds") or {}
    per_rep = sum(tempo.values()) if tempo else 3.0
    per_rep = per_rep or 3.0
    work = max(8.0, _avg_reps(ex.get("default_reps")) * per_rep)
    return work + DEFAULT_STRENGTH_REST_SEC


def _injury_tags(profile: Profile, today: TodayConstraints) -> set[str]:
    return set(profile.chronic_injury_tags) | set(today.today_pain_tags)


def _is_safe(exercise: dict, banned_tags: set[str]) -> bool:
    return not (set(exercise.get("contraindications", [])) & banned_tags)


def _has_equipment(exercise: dict, available: set[str]) -> bool:
    needed = set(exercise.get("equipment", []))
    if "bodyweight" in needed:
        # Library convention: listing "bodyweight" alongside other items
        # (e.g. forward_lunge: bodyweight+dumbbells) means the bodyweight
        # version always works and the rest is an optional added load --
        # not a requirement to have every listed item.
        return True
    return needed.issubset(available)


def _candidates(pattern: str, day_type: str, equipment: set[str], banned: set[str]) -> list[dict]:
    compatible = DAY_TYPE_COMPAT.get(day_type, {day_type})
    return [
        e for e in EXERCISE_LIBRARY
        if e["movement_pattern"] == pattern
        and compatible & set(e.get("day_types", []))
        and _has_equipment(e, equipment)
        and _is_safe(e, banned)
    ]


def _select_exercise_for_pattern(
    pattern: str, day_type: str, equipment: set[str], banned: set[str],
    used_ids: set[str], warnings: list[str],
) -> dict | None:
    pool = [c for c in _candidates(pattern, day_type, equipment, banned) if c["id"] not in used_ids]
    if not pool:
        pool = _candidates(pattern, day_type, equipment, banned)
    if pool:
        return random.choice(pool)

    # Nothing safe/available for this pattern at all -- try regressions of
    # anything in that pattern before giving up on it entirely. Figure out
    # *why* the usual picks didn't work so the message is accurate -- an
    # injury exclusion and a missing-equipment gap read very differently
    # to the user, and conflating them (always blaming "flagged
    # constraints") was its own bug.
    same_pattern = [e for e in EXERCISE_LIBRARY if e["movement_pattern"] == pattern]
    blocked_by_safety = any(_has_equipment(e, equipment) and not _is_safe(e, banned) for e in same_pattern)
    blocked_by_equipment = any(not _has_equipment(e, equipment) and _is_safe(e, banned) for e in same_pattern)
    if blocked_by_safety and not blocked_by_equipment:
        reason = "based on today's flagged pain/injury notes"
    elif blocked_by_equipment and not blocked_by_safety:
        reason = "since today's equipment doesn't cover the usual pick"
    else:
        reason = "based on today's equipment and flagged constraints"

    for e in same_pattern:
        for reg_id in e.get("regressions", []):
            reg = LIBRARY_BY_ID.get(reg_id)
            if reg and day_type in reg.get("day_types", []) and _has_equipment(reg, equipment) and _is_safe(reg, banned):
                warnings.append(f"Substituted '{reg['name']}' for the usual {pattern} movement {reason}.")
                return reg
    warnings.append(f"Skipped the {pattern.replace('_', ' ')} slot -- nothing safe/available today.")
    return None


def _cues(exercise: dict) -> CueSet:
    c = exercise["cues"]
    return CueSet(
        setup=c["setup"], breath=c["breath"],
        tempo_contract_relax=c["tempo_contract_relax"],
        balance_posture=c["balance_posture"],
        common_fault=c.get("common_fault"),
    )


def _block(exercise: dict, order_index: int, round_index: int, *, sets=None, reps=None,
           work_sec=None, rest_sec=None, note: str | None = None) -> ExerciseBlock:
    return ExerciseBlock(
        exercise_id=exercise["id"], name=exercise["name"],
        order_index=order_index, round_index=round_index,
        sets=sets, reps=reps, work_sec=work_sec, rest_sec=rest_sec,
        tempo_seconds=exercise.get("tempo_seconds"),
        cues=_cues(exercise),
        substitution_reason=note,
    )


def _generate_strength(profile: Profile, today: TodayConstraints, equipment: set[str],
                        banned: set[str], warnings: list[str]) -> list[ExerciseBlock]:
    n_exercises = 4 if today.duration_min <= 25 else (5 if today.duration_min <= 40 else 6)
    patterns = STRENGTH_PATTERN_ORDER[:n_exercises]

    chosen: list[dict] = []
    used_ids: set[str] = set()
    skipped_slots = 0
    for p in patterns:
        ex = _select_exercise_for_pattern(p, "strength", equipment, banned, used_ids, warnings)
        if ex:
            chosen.append(ex)
            used_ids.add(ex["id"])
        else:
            skipped_slots += 1

    # Backfill with safe alternatives so an injury/equipment constraint
    # shrinks *which* exercises appear, not how substantial the session is.
    if skipped_slots:
        backfill_order = STRENGTH_PATTERN_ORDER[n_exercises:] + STRENGTH_PATTERN_ORDER[:n_exercises]
        for p in backfill_order:
            if len(chosen) >= n_exercises:
                break
            ex = _select_exercise_for_pattern(p, "strength", equipment, banned, used_ids, [])
            if ex and ex["id"] not in used_ids:
                chosen.append(ex)
                used_ids.add(ex["id"])
                warnings.append(f"Added '{ex['name']}' to keep the session full after today's constraints.")

    if not chosen:
        return []

    # Rounds are chosen to actually hit the requested duration, using the
    # same per-set timing math the renderer uses -- not a fixed "3 rounds"
    # guess. Warm-up (~110s) + cool-down (~100s) + intro/outro (~15s) are
    # netted out first since those run outside this main block.
    target_sec = today.duration_min * 60
    overhead_sec = 225
    avg_set_sec = sum(_estimate_set_seconds(ex) for ex in chosen) / len(chosen)
    available_sec = max(avg_set_sec * len(chosen), target_sec - overhead_sec)
    rounds = max(2, min(5, round(available_sec / (len(chosen) * avg_set_sec))))

    blocks: list[ExerciseBlock] = []
    idx = 0
    for round_idx in range(1, rounds + 1):
        for ex in chosen:
            blocks.append(_block(
                ex, idx, round_idx,
                sets=rounds, reps=ex.get("default_reps", "8-12"),
            ))
            idx += 1
    return blocks


def _generate_interval(profile: Profile, today: TodayConstraints, equipment: set[str],
                        banned: set[str], warnings: list[str], day_type: str) -> list[ExerciseBlock]:
    duration_sec = today.duration_min * 60
    work_sec, rest_sec = (40, 20) if day_type == "hiit" else (45, 15)
    overhead_sec = 225  # warm-up + cool-down + intro/outro, same accounting as strength

    used_ids: set[str] = set()
    chosen: list[dict] = []
    for p in HIIT_PATTERNS[:5]:
        ex = _select_exercise_for_pattern(p, day_type, equipment, banned, used_ids, warnings)
        if ex:
            chosen.append(ex)
            used_ids.add(ex["id"])

    if not chosen:
        return []

    # Rounds are computed from how many stations we *actually* ended up
    # with, not the planned count of 5 -- if constraints trimmed the
    # station list, rounds scale up to compensate so the session still
    # fills the requested time instead of coming in short.
    available_sec = max(duration_sec - overhead_sec, len(chosen) * (work_sec + rest_sec))
    rounds = max(2, min(6, round(available_sec / (len(chosen) * (work_sec + rest_sec)))))

    blocks: list[ExerciseBlock] = []
    idx = 0
    for round_idx in range(1, int(rounds) + 1):
        for ex in chosen:
            blocks.append(_block(ex, idx, round_idx, work_sec=work_sec, rest_sec=rest_sec))
            idx += 1
    return blocks


def _select_calm_version(pattern: str, equipment: set[str], banned: set[str],
                          used: set[str], warnings: list[str]) -> dict | None:
    """For warm-up/cool-down slots: find the calmest available version of
    `pattern` by trying day types in order. This is just "which bucket is
    this exercise filed under," not a safety question, so it never emits
    the "substituted based on today's constraints" message unless a real
    injury/equipment constraint is the reason nothing was found."""
    for dt in WARMUP_COOLDOWN_DAY_TYPES_TRY:
        pool = [c for c in _candidates(pattern, dt, equipment, banned) if c["id"] not in used]
        if pool:
            return random.choice(pool)

    # Nothing available even considering every day type -- check whether
    # that's actually because of a flagged constraint (worth telling the
    # user) or simply because the library has nothing of this pattern for
    # the given equipment (not worth an alarming message).
    for dt in WARMUP_COOLDOWN_DAY_TYPES_TRY:
        pool_without_constraints = [c for c in _candidates(pattern, dt, equipment, set()) if c["id"] not in used]
        if pool_without_constraints:
            warnings.append(
                f"Skipped the usual {pattern.replace('_', ' ')} warm-up/cool-down movement "
                "based on today's flagged constraints."
            )
            return None
    return None


def _warmup_blocks(equipment: set[str], banned: set[str], warnings: list[str]) -> list[ExerciseBlock]:
    used: set[str] = set()
    blocks = []
    for i, p in enumerate(WARMUP_PATTERNS):
        ex = _select_calm_version(p, equipment, banned, used, warnings)
        if ex:
            blocks.append(_block(ex, i, 0, work_sec=45, rest_sec=10))
            used.add(ex["id"])
    return blocks


def _cooldown_blocks(equipment: set[str], banned: set[str], warnings: list[str], start_idx: int) -> list[ExerciseBlock]:
    used: set[str] = set()
    blocks = []
    for i, p in enumerate(COOLDOWN_PATTERNS[:2]):
        ex = _select_calm_version(p, equipment, banned, used, warnings)
        if ex:
            blocks.append(_block(ex, start_idx + i, 99, work_sec=40, rest_sec=10))
            used.add(ex["id"])
    return blocks


def _generate_mobility(today: TodayConstraints, equipment: set[str],
                        banned: set[str], warnings: list[str]) -> list[ExerciseBlock]:
    """A mobility day is its own thing, not a lighter strength day: one
    calm pass through mobility-tagged movements, hold-based timing, sized
    directly to the requested duration rather than templated into rounds
    of rep-based sets."""
    work_sec, rest_sec = 35, 10
    used_ids: set[str] = set()
    chosen: list[dict] = []
    for p in MOBILITY_PATTERNS:
        ex = _select_exercise_for_pattern(p, "mobility", equipment, banned, used_ids, warnings)
        if ex:
            chosen.append(ex)
            used_ids.add(ex["id"])

    if not chosen:
        return []

    duration_sec = today.duration_min * 60
    overhead_sec = 110  # mobility days keep a light warm-up but no separate cool-down block
    available_sec = max(duration_sec - overhead_sec, work_sec + rest_sec)
    target_count = max(len(chosen), round(available_sec / (work_sec + rest_sec)))

    blocks: list[ExerciseBlock] = []
    idx, round_idx, count = 0, 1, 0
    while count < target_count:
        for ex in chosen:
            if count >= target_count:
                break
            blocks.append(_block(ex, idx, round_idx, work_sec=work_sec, rest_sec=rest_sec))
            idx += 1
            count += 1
        round_idx += 1
    return blocks


def generate_workout(profile: Profile, today: TodayConstraints) -> WorkoutSpec:
    equipment = set(today.equipment or profile.default_equipment) | {"bodyweight"}
    banned = _injury_tags(profile, today)
    warnings: list[str] = []

    warmup = _warmup_blocks(equipment, banned, warnings)

    if today.day_type in (DayType.hiit, DayType.circuit, DayType.cardio):
        main = _generate_interval(profile, today, equipment, banned, warnings, today.day_type.value)
    elif today.day_type == DayType.mobility:
        main = _generate_mobility(today, equipment, banned, warnings)
    else:
        main = _generate_strength(profile, today, equipment, banned, warnings)

    # reindex main blocks after warmup, and cooldown after main
    offset = len(warmup)
    for i, b in enumerate(main):
        b.order_index = offset + i
    cooldown = _cooldown_blocks(equipment, banned, warnings, offset + len(main))

    all_blocks = warmup + main + cooldown
    if not main:
        warnings.append(
            "Could not generate a safe main set with today's constraints -- "
            "showing warm-up/cooldown only. Please adjust equipment or flagged pain areas."
        )

    day_label_map = {"hiit": "HIIT"}
    day_label = day_label_map.get(today.day_type.value, today.day_type.value.replace("_", " ").title())
    return WorkoutSpec(
        workout_id=str(uuid.uuid4())[:8],
        user_id=profile.user_id,
        created_at=datetime.datetime.utcnow().isoformat() + "Z",
        day_type=today.day_type,
        duration_min_target=today.duration_min,
        title=f"{day_label} Session",
        blocks=all_blocks,
        warnings=warnings,
    )
