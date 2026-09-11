"""
Mixes the music bed and narration into a single master, with automatic
ducking, fades, loudness normalization and clipping prevention, then
exports MP3 (and M4A) plus a build log.
"""
from __future__ import annotations

import json
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from music import generate_music_bed, load_local_music_bed, SR
from timeline import Timeline


def _fade_edges(arr: np.ndarray, sr: int, ms: float = 15.0) -> np.ndarray:
    n = min(len(arr), int(sr * ms / 1000.0))
    if n <= 1:
        return arr
    out = arr.copy()
    ramp = np.linspace(0, 1, n, dtype=np.float32)
    out[:n] *= ramp
    out[-n:] *= ramp[::-1]
    return out


def _place_stereo(buf: np.ndarray, sample: np.ndarray, start_idx: int) -> None:
    n = buf.shape[0]
    end_idx = start_idx + sample.shape[0]
    if end_idx <= 0 or start_idx >= n:
        return
    s0, s1 = max(0, start_idx), min(n, end_idx)
    b0, b1 = s0 - start_idx, s1 - start_idx
    buf[s0:s1] += sample[b0:b1]


def build_narration_bus(tl: Timeline, total_samples: int, sr: int = SR) -> np.ndarray:
    bus = np.zeros((total_samples, 2), dtype=np.float32)
    for ev in tl.events:
        data, file_sr = sf.read(str(ev.wav_path), dtype="float32", always_2d=False)
        if file_sr != sr:
            raise RuntimeError(
                f"Sample rate mismatch: {ev.wav_path} is {file_sr} Hz, expected {sr} Hz."
            )
        if data.ndim > 1:
            data = data.mean(axis=1)
        data = _fade_edges(data, sr, ms=12.0)
        stereo = np.stack([data, data], axis=1)
        start_idx = int(round(ev.start_sec * sr))
        _place_stereo(bus, stereo, start_idx)
    return bus


def build_duck_envelope(
    tl: Timeline,
    total_samples: int,
    sr: int,
    duck_db: float,
    duck_in_ms: float,
    duck_recovery_ms: float,
) -> np.ndarray:
    env = np.ones(total_samples, dtype=np.float32)
    target = float(10 ** (duck_db / 20.0))
    in_n = max(1, int(sr * duck_in_ms / 1000.0))
    rec_n = max(1, int(sr * duck_recovery_ms / 1000.0))

    for ev in sorted(tl.events, key=lambda e: e.start_sec):
        s = int(round(ev.start_sec * sr))
        e = int(round(ev.end_sec * sr))
        s = max(0, min(total_samples, s))
        e = max(0, min(total_samples, e))

        ramp_down_start = max(0, s - in_n)
        if s > ramp_down_start:
            seg = np.linspace(1.0, target, s - ramp_down_start, dtype=np.float32)
            env[ramp_down_start:s] = np.minimum(env[ramp_down_start:s], seg)

        if e > s:
            env[s:e] = np.minimum(env[s:e], target)

        ramp_up_end = min(total_samples, e + rec_n)
        if ramp_up_end > e:
            seg = np.linspace(target, 1.0, ramp_up_end - e, dtype=np.float32)
            env[e:ramp_up_end] = np.minimum(env[e:ramp_up_end], seg)

    return env


def mix_master(
    tl: Timeline,
    audio_cfg: dict,
    music_gain: float = 0.8,
    music_dir: Path | None = None,
) -> tuple[np.ndarray, str]:
    total_samples = int(round(tl.total_duration_sec * SR))

    music_bed = None
    music_source = "procedural"
    if music_dir is not None:
        music_bed = load_local_music_bed(music_dir, target_total_sec=tl.total_duration_sec)
        if music_bed is not None:
            music_source = f"local files in {music_dir}"

    if music_bed is None:
        section_specs = [
            {
                "id": s.id,
                "duration_sec": s.duration_sec,
                "bpm": s.bpm,
                "energy": s.energy,
            }
            for s in tl.sections
        ]
        music_bed = generate_music_bed(section_specs, target_total_sec=tl.total_duration_sec)
    if music_bed.shape[0] != total_samples:
        # generate_music_bed already pads/trims to target, but guard anyway
        if music_bed.shape[0] > total_samples:
            music_bed = music_bed[:total_samples]
        else:
            pad = np.zeros((total_samples - music_bed.shape[0], 2), dtype=np.float32)
            music_bed = np.concatenate([music_bed, pad], axis=0)

    duck_env = build_duck_envelope(
        tl,
        total_samples,
        SR,
        duck_db=audio_cfg.get("narration_duck_db", -11),
        duck_in_ms=audio_cfg.get("duck_in_ms", 300),
        duck_recovery_ms=audio_cfg.get("duck_recovery_ms", 700),
    )
    ducked_music = music_bed * (music_gain * duck_env[:, None])

    narration_bus = build_narration_bus(tl, total_samples, SR)

    # Half-second overall fade in/out on the whole program.
    program_fade_n = int(0.5 * SR)
    fade_in = np.linspace(0, 1, program_fade_n, dtype=np.float32)
    ducked_music[:program_fade_n] *= fade_in[:, None]
    ducked_music[-program_fade_n:] *= fade_in[::-1][:, None]

    mix = ducked_music + narration_bus
    mix = np.tanh(mix * 0.98) * 0.98  # soft-clip safety net against summed peaks
    return mix.astype(np.float32), music_source


def _measure_loudnorm(wav_path: Path, target_i: float, target_tp: float, target_lra: float) -> dict:
    cmd = [
        "ffmpeg", "-v", "info", "-i", str(wav_path),
        "-af", f"loudnorm=I={target_i}:TP={target_tp}:LRA={target_lra}:print_format=json",
        "-f", "null", "-",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    match = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", result.stderr, re.DOTALL)
    if not match:
        raise RuntimeError(f"loudnorm measurement failed:\n{result.stderr[-2000:]}")
    return json.loads(match.group(0))


def export_audio(
    mix: np.ndarray,
    out_dir: Path,
    base_name: str,
    target_lufs: float = -15.0,
    true_peak_db: float = -1.0,
    target_lra: float = 11.0,
) -> dict:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        raw_wav = Path(tmp) / "raw_mix.wav"
        sf.write(str(raw_wav), mix, SR, subtype="PCM_24")

        measured = _measure_loudnorm(raw_wav, target_lufs, true_peak_db, target_lra)

        normalized_wav = Path(tmp) / "normalized_mix.wav"
        af = (
            f"loudnorm=I={target_lufs}:TP={true_peak_db}:LRA={target_lra}:"
            f"measured_I={measured['input_i']}:measured_TP={measured['input_tp']}:"
            f"measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}:"
            f"offset={measured['target_offset']}:linear=true:print_format=summary"
        )
        cmd = [
            "ffmpeg", "-y", "-v", "error", "-i", str(raw_wav),
            "-af", af, "-ar", "44100", str(normalized_wav),
        ]
        subprocess.run(cmd, capture_output=True, text=True, check=True)

        mp3_path = out_dir / f"{base_name}.mp3"
        m4a_path = out_dir / f"{base_name}.m4a"

        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", str(normalized_wav),
             "-codec:a", "libmp3lame", "-b:a", "256k", str(mp3_path)],
            capture_output=True, text=True, check=True,
        )
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", str(normalized_wav),
             "-codec:a", "aac", "-b:a", "256k", str(m4a_path)],
            capture_output=True, text=True, check=True,
        )

    return {
        "mp3": mp3_path,
        "m4a": m4a_path,
        "measured_loudness": measured,
    }
