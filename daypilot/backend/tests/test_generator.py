"""
Fast, render-free regression tests for the generator and timeline logic.
No TTS/audio/PDF rendering here on purpose -- these should run in well
under a second and catch the kind of bugs that broke things tonight
(reps-string parsing, equipment semantics, day_type matching) without
needing a live server or espeak-ng installed.

Run with: cd backend/tests && python3 test_generator.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "render"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "data"))

from schema import Profile, TodayConstraints, DayType  # noqa: E402
from generator import generate_workout  # noqa: E402
import generator as gen_mod  # noqa: E402
from timeline import build_timeline, _avg_reps  # noqa: E402

PASS = 0
FAIL = 0


def check(name: str, condition: bool, detail: str = ""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name}  {detail}")


def test_reps_parsing():
    print("reps parsing")
    check("plain range", _avg_reps("8-10") == 9.0)
    check("range with suffix", _avg_reps("8-10 per side") == 9.0)
    check("single number", _avg_reps("12") == 12.0)
    check("none -> fallback", _avg_reps(None) == 10.0)
    check("garbage -> fallback", _avg_reps("per side") == 10.0)


def test_equipment_semantics():
    print("equipment semantics")
    bodyweight_plus = {"id": "x", "equipment": ["bodyweight", "dumbbells"]}
    dumbbell_only = {"id": "y", "equipment": ["dumbbells"]}
    check(
        "bodyweight+dumbbells entry usable with bodyweight only",
        gen_mod._has_equipment(bodyweight_plus, {"bodyweight"}),
    )
    check(
        "dumbbell-only entry NOT usable with bodyweight only",
        not gen_mod._has_equipment(dumbbell_only, {"bodyweight"}),
    )
    check(
        "dumbbell-only entry usable once dumbbells available",
        gen_mod._has_equipment(dumbbell_only, {"bodyweight", "dumbbells"}),
    )


def test_strength_generation_basic():
    print("strength generation")
    profile = Profile(user_id="t1")
    today = TodayConstraints(duration_min=30, day_type=DayType.strength, equipment=["bodyweight", "dumbbells"])
    spec = generate_workout(profile, today)
    main_blocks = [b for b in spec.blocks if b.round_index not in (0, 99)]
    uniq = {b.exercise_id for b in main_blocks}
    check("has warmup blocks", any(b.round_index == 0 for b in spec.blocks))
    check("has cooldown blocks", any(b.round_index == 99 for b in spec.blocks))
    check("at least 4 unique main exercises", len(uniq) >= 4, f"got {len(uniq)}")
    check("3 rounds of each main exercise", len(main_blocks) == len(uniq) * 3, f"{len(main_blocks)} vs {len(uniq) * 3}")


def test_injury_exclusion_and_backfill():
    print("injury exclusion + backfill")
    profile = Profile(user_id="t2", chronic_injury_tags=["shoulder_injury"])
    today = TodayConstraints(duration_min=35, day_type=DayType.strength, equipment=["dumbbells"])
    spec = generate_workout(profile, today)
    main_blocks = [b for b in spec.blocks if b.round_index not in (0, 99)]
    names = {b.name for b in main_blocks}
    unsafe = {"Dumbbell Overhead Press", "Seated Dumbbell Press", "Dumbbell Bench Press", "Floor Press"}
    check("no shoulder-unsafe exercise placed", not (names & unsafe), f"found: {names & unsafe}")
    uniq = {b.exercise_id for b in main_blocks}
    check("still backfilled to a full session (>=4 exercises)", len(uniq) >= 4, f"got {len(uniq)}: {names}")


def test_hiit_day_type_compat():
    print("HIIT day_type compatibility")
    profile = Profile(user_id="t3")
    today = TodayConstraints(duration_min=15, day_type=DayType.hiit, equipment=["bodyweight"])
    spec = generate_workout(profile, today)
    main_blocks = [b for b in spec.blocks if b.round_index not in (0, 99)]
    check("HIIT produced main blocks", len(main_blocks) > 0, "generator returned no main blocks for HIIT")
    skipped_core_or_lunge = any("core slot" in w or "lunge slot" in w for w in spec.warnings)
    check(
        "core/lunge not spuriously skipped for plain bodyweight HIIT",
        not skipped_core_or_lunge,
        str(spec.warnings),
    )


def test_timeline_duration_matches_target():
    print("timeline duration vs target")
    profile = Profile(user_id="t4")
    today = TodayConstraints(duration_min=20, day_type=DayType.strength, equipment=["dumbbells"])
    spec = generate_workout(profile, today)
    tl = build_timeline(
        spec, intro_line="Hi.", outro_line="Bye.",
        intro_duration_sec=1.0, outro_duration_sec=1.0,
    )
    target_sec = 20 * 60
    diff = abs(tl.total_duration_sec - target_sec)
    check(
        f"within 6 minutes of {target_sec}s target (generous -- this is a rule-based duration estimate)",
        diff < 360, f"got {tl.total_duration_sec:.0f}s, diff {diff:.0f}s",
    )


def test_bells_fire_for_every_segment_with_rest():
    print("bell coverage")
    profile = Profile(user_id="t5")
    today = TodayConstraints(duration_min=12, day_type=DayType.hiit, equipment=["bodyweight"])
    spec = generate_workout(profile, today)
    tl = build_timeline(
        spec, intro_line="Hi.", outro_line="Bye.",
        intro_duration_sec=1.0, outro_duration_sec=1.0,
    )
    go_bells = [b for b in tl.bells if b.kind == "go"]
    work_segments = [s for s in tl.segments if s.kind in ("work", "warmup", "cooldown")]
    check(
        "one 'go' bell per work/warmup/cooldown segment",
        len(go_bells) == len(work_segments),
        f"{len(go_bells)} bells vs {len(work_segments)} segments",
    )
    check("no bell scheduled past total duration", all(b.at_sec <= tl.total_duration_sec for b in tl.bells))


if __name__ == "__main__":
    test_reps_parsing()
    test_equipment_semantics()
    test_strength_generation_basic()
    test_injury_exclusion_and_backfill()
    test_hiit_day_type_compat()
    test_timeline_duration_matches_target()
    test_bells_fire_for_every_segment_with_rest()
    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(1 if FAIL else 0)
