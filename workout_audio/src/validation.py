"""
Automated checks run before and after rendering. Every check returns a
(passed: bool, message: str) pair; nothing here silently swallows a
failure — callers are expected to fail the build loudly if any required
check fails.
"""
from __future__ import annotations

import shutil
from pathlib import Path

import numpy as np
import soundfile as sf

from timeline import Timeline, load_workout, validate_structure

REQUIRED_CUE_PHRASES = [
    "navicular",
    "tripod",
    "hinge",
    "three second",
    "tingling",
    "diagnostic test",
    "xero",
]


class CheckResult:
    def __init__(self, name: str, passed: bool, message: str):
        self.name = name
        self.passed = passed
        self.message = message

    def __str__(self) -> str:
        status = "PASS" if self.passed else "FAIL"
        return f"[{status}] {self.name}: {self.message}"


def check_ffmpeg_available() -> CheckResult:
    ok = shutil.which("ffmpeg") is not None
    return CheckResult("ffmpeg_available", ok, "ffmpeg found on PATH" if ok else "ffmpeg NOT found")


def check_workout_parses(workout_path: str | Path) -> tuple[CheckResult, dict | None]:
    try:
        workout = load_workout(workout_path)
        return CheckResult("workout_yaml_parses", True, f"parsed {workout_path}"), workout
    except Exception as e:
        return CheckResult("workout_yaml_parses", False, str(e)), None


def check_monotonic_structure(workout: dict) -> CheckResult:
    try:
        validate_structure(workout)
        return CheckResult("monotonic_nonoverlapping_structure", True, "sections/blocks are contiguous and monotonic")
    except Exception as e:
        return CheckResult("monotonic_nonoverlapping_structure", False, str(e))


def check_narration_within_duration(tl: Timeline) -> CheckResult:
    bad = [e for e in tl.events if e.end_sec > tl.total_duration_sec + 1e-6]
    ok = len(bad) == 0
    msg = "all cues end within total duration" if ok else f"{len(bad)} cue(s) extend past total duration"
    return CheckResult("narration_within_duration", ok, msg)


def check_no_malformed_overlaps(tl: Timeline) -> CheckResult:
    events = sorted(tl.events, key=lambda e: e.start_sec)
    for a, b in zip(events, events[1:]):
        if b.start_sec < a.end_sec - 1e-3:
            return CheckResult(
                "no_malformed_overlaps", False,
                f"overlap between '{a.text[:30]}...' (ends {a.end_sec:.2f}s) and "
                f"'{b.text[:30]}...' (starts {b.start_sec:.2f}s)",
            )
    return CheckResult("no_malformed_overlaps", True, "no overlapping cues")


def check_narration_files(tl: Timeline) -> CheckResult:
    sample_rates = set()
    for ev in tl.events:
        p = Path(ev.wav_path)
        if not p.exists() or p.stat().st_size == 0:
            return CheckResult("narration_files_valid", False, f"missing/empty narration file: {p}")
        info = sf.info(str(p))
        sample_rates.add(info.samplerate)
    ok = len(sample_rates) <= 1
    msg = (
        f"{len(tl.events)} narration files present, consistent sample rate {sample_rates}"
        if ok else f"inconsistent sample rates across narration files: {sample_rates}"
    )
    return CheckResult("narration_files_valid", ok, msg)


def check_required_cues_present(tl: Timeline) -> CheckResult:
    joined = " ".join(e.text.lower() for e in tl.events)
    missing = [p for p in REQUIRED_CUE_PHRASES if p not in joined]
    ok = len(missing) == 0
    msg = "all required safety/coaching phrases present" if ok else f"missing phrases: {missing}"
    return CheckResult("required_cues_present", ok, msg)


def check_output_exists(path: str | Path) -> CheckResult:
    p = Path(path)
    ok = p.exists() and p.stat().st_size > 0
    return CheckResult("output_file_exists", ok, str(p) if ok else f"missing or empty: {p}")


def check_output_duration_plausible(path: str | Path, expected_sec: float, tolerance_sec: float = 90.0) -> CheckResult:
    info = sf.info(str(path)) if str(path).endswith(".wav") else None
    if info is not None:
        actual = info.frames / float(info.samplerate)
    else:
        import subprocess
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True, text=True,
        )
        actual = float(result.stdout.strip())
    diff = abs(actual - expected_sec)
    ok = diff <= tolerance_sec
    msg = f"expected {expected_sec:.1f}s, got {actual:.1f}s (diff {diff:.1f}s, tolerance {tolerance_sec:.0f}s)"
    return CheckResult("output_duration_plausible", ok, msg)


def check_no_clipping(mix: np.ndarray, threshold: float = 0.995) -> CheckResult:
    peak = float(np.abs(mix).max())
    clipped_samples = int(np.sum(np.abs(mix) >= threshold))
    ok = clipped_samples < 10  # allow a handful of true-peak-limiter touches, not sustained clipping
    msg = f"peak amplitude {peak:.4f}, samples >= {threshold}: {clipped_samples}"
    return CheckResult("no_clipping", ok, msg)


def check_music_bed_covers_workout(mix: np.ndarray, sr: int, expected_sec: float) -> CheckResult:
    actual_sec = mix.shape[0] / sr
    ok = actual_sec >= expected_sec - 1.0
    msg = f"mixed program is {actual_sec:.1f}s for a {expected_sec:.1f}s workout"
    return CheckResult("music_bed_covers_workout", ok, msg)
