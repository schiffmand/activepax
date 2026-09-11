#!/usr/bin/env python3
"""
One-command build: turns workout.yaml into a finished, polished workout
audio file.

Usage:
    python build.py workout.yaml
    python build.py workout.yaml --voice male --music-dir audio/music
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

import yaml  # noqa: E402

from timeline import build_timeline, write_timeline_txt  # noqa: E402
from tts import TTSAdapter, VoiceConfig  # noqa: E402
from renderer import mix_master, export_audio  # noqa: E402
import validation as val  # noqa: E402


def load_config(path: Path) -> dict:
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a polished workout audio file from a YAML spec.")
    parser.add_argument("workout_yaml", nargs="?", default="workout.yaml")
    parser.add_argument("--voice", choices=["male", "female"], default=None)
    parser.add_argument("--music-dir", default=None, help="Directory of local royalty-free tracks to use instead of procedural music.")
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--out-dir", default=None)
    parser.add_argument("--base-name", default=None)
    args = parser.parse_args()

    project_root = Path(__file__).parent
    cfg = load_config(project_root / args.config)

    voice_cfg_dict = cfg.get("voice", {})
    if args.voice:
        voice_cfg_dict = {**voice_cfg_dict, "gender": args.voice}
    voice_cfg = VoiceConfig(**{k: v for k, v in voice_cfg_dict.items() if k in VoiceConfig.__annotations__})

    paths_cfg = cfg.get("paths", {})
    out_dir = Path(args.out_dir or paths_cfg.get("output_dir", "output"))
    voice_gen_dir = project_root / paths_cfg.get("voice_generated_dir", "audio/voice/generated")
    music_dir = Path(args.music_dir) if args.music_dir else project_root / paths_cfg.get("music_dir", "audio/music")

    output_cfg = cfg.get("output", {})
    base_name = args.base_name or output_cfg.get("base_name", "today_workout")

    results: list[val.CheckResult] = []
    log_lines: list[str] = []

    def record(check: val.CheckResult, fatal: bool = True) -> bool:
        results.append(check)
        log_lines.append(str(check))
        print(str(check))
        if fatal and not check.passed:
            log_lines.append("BUILD ABORTED: fatal check failed.")
            (out_dir / "build_log.txt").parent.mkdir(parents=True, exist_ok=True)
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / "build_log.txt").write_text("\n".join(log_lines), encoding="utf-8")
            return False
        return True

    t_start = time.time()

    if not record(val.check_ffmpeg_available()):
        return 1

    workout_check, workout = val.check_workout_parses(project_root / args.workout_yaml)
    if not record(workout_check):
        return 1

    if not record(val.check_monotonic_structure(workout)):
        return 1

    print("Synthesizing narration and scheduling the timeline...")
    tts_adapter = TTSAdapter(voice_gen_dir, voice_cfg)
    log_lines.append(f"TTS engine selected: {tts_adapter.engine_used}")
    tl = build_timeline(workout, tts_adapter)
    for w in tl.warnings:
        log_lines.append(f"WARNING: {w}")
        print(f"WARNING: {w}")

    if not record(val.check_narration_within_duration(tl)):
        return 1
    if not record(val.check_no_malformed_overlaps(tl)):
        return 1
    if not record(val.check_narration_files(tl)):
        return 1
    if not record(val.check_required_cues_present(tl)):
        return 1

    out_dir.mkdir(parents=True, exist_ok=True)
    write_timeline_txt(tl, out_dir / "timeline.txt")
    print(f"Wrote {out_dir / 'timeline.txt'}")

    print("Rendering music bed and mixing with ducked narration...")
    audio_cfg = workout.get("audio", {})
    mix, music_source = mix_master(tl, audio_cfg, music_dir=music_dir)
    log_lines.append(f"Music source: {music_source}")

    if not record(val.check_no_clipping(mix)):
        return 1
    if not record(val.check_music_bed_covers_workout(mix, 44100, tl.total_duration_sec)):
        return 1

    print("Normalizing loudness and exporting MP3/M4A...")
    export_result = export_audio(
        mix,
        out_dir,
        base_name,
        target_lufs=audio_cfg.get("final_lufs", -15),
        true_peak_db=audio_cfg.get("true_peak_db", -1),
    )
    measured = export_result["measured_loudness"]
    log_lines.append(f"Measured loudness (pre-normalization): {measured}")

    if not record(val.check_output_exists(export_result["mp3"])):
        return 1
    if not record(val.check_output_exists(export_result["m4a"])):
        return 1
    if not record(val.check_output_duration_plausible(export_result["mp3"], tl.total_duration_sec)):
        return 1

    elapsed = time.time() - t_start
    log_lines.append(f"Total build time: {elapsed:.1f}s")
    log_lines.append(f"Total workout duration: {tl.total_duration_sec:.1f}s ({tl.total_duration_sec/60:.1f} min)")
    log_lines.append(f"Narration cues: {len(tl.events)}")
    log_lines.append(f"Output MP3: {export_result['mp3']}")
    log_lines.append(f"Output M4A: {export_result['m4a']}")
    log_lines.append("ALL CHECKS PASSED.")

    (out_dir / "build_log.txt").write_text("\n".join(log_lines), encoding="utf-8")

    print(f"\nDone in {elapsed:.1f}s. Output:")
    print(f"  {export_result['mp3']}")
    print(f"  {export_result['m4a']}")
    print(f"  {out_dir / 'timeline.txt'}")
    print(f"  {out_dir / 'build_log.txt'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
