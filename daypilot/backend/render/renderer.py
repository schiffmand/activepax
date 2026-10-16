"""
Mixes music bed + interval bells + ducked narration into a single master,
normalizes loudness, and exports MP3/M4A. Extends the original
workout_audio renderer with a second, lighter duck tier for bells (bells
get priority: narration shifts around them, never the reverse -- see
timeline.schedule_cues).
"""
from __future__ import annotations

import json
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

from music import generate_music_bed, SR
from bells import BELLS
from timeline import MasterTimeline, BellEvent
from tts import TTSAdapter

NARRATION_DUCK_DB = -11
NARRATION_DUCK_IN_MS = 300
NARRATION_DUCK_RECOVERY_MS = 700

BELL_DUCK_DB = -6
BELL_DUCK_IN_MS = 120
BELL_DUCK_RECOVERY_MS = 350

MUSIC_GAIN = 0.8
BELL_GAIN = 0.9


@dataclass
class ScheduledCue:
    start_sec: float
    end_sec: float
    text: str
    wav_path: Path
    segment_kind: str
    exercise_name: str


def _wav_duration_sec(path: Path) -> float:
    info = sf.info(str(path))
    return info.frames / float(info.samplerate)


def schedule_cues(tl: MasterTimeline, tts_adapter: TTSAdapter, warnings: list[str]) -> list[ScheduledCue]:
    """Greedy left-to-right placement: cues never overlap each other, and
    shift later rather than step on a bell's protected window."""
    protected = []
    for bell in tl.bells:
        dur = {"go": 0.3, "warning": 0.25, "rest": 0.6, "round_complete": 0.65}[bell.kind]
        protected.append((bell.at_sec - BELL_DUCK_IN_MS / 1000, bell.at_sec + dur + BELL_DUCK_RECOVERY_MS / 1000))
    protected.sort()

    def push_past_bells(t: float) -> float:
        moved = True
        while moved:
            moved = False
            for s, e in protected:
                if s <= t < e:
                    t = e + 0.05
                    moved = True
        return t

    cursor = 0.0
    scheduled: list[ScheduledCue] = []
    for earliest_start, text, kind, exname in tl.cue_specs:
        wav_path = tts_adapter.synth(text)
        dur = _wav_duration_sec(wav_path)
        start = max(cursor, earliest_start)
        start = push_past_bells(start)
        end = start + dur
        if end > tl.total_duration_sec + 2.0:
            warnings.append(f"Dropped a late cue to stay in time: '{text[:40]}...'")
            continue
        scheduled.append(ScheduledCue(start, end, text, wav_path, kind, exname))
        cursor = end + 0.3
    return scheduled


def _fade_edges(arr: np.ndarray, sr: int, ms: float = 12.0) -> np.ndarray:
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


def _duck_envelope(total_samples: int, sr: int, events: list[tuple[float, float]],
                    duck_db: float, in_ms: float, rec_ms: float) -> np.ndarray:
    env = np.ones(total_samples, dtype=np.float32)
    target = float(10 ** (duck_db / 20.0))
    in_n = max(1, int(sr * in_ms / 1000.0))
    rec_n = max(1, int(sr * rec_ms / 1000.0))
    for start_sec, end_sec in events:
        s = max(0, min(total_samples, int(round(start_sec * sr))))
        e = max(0, min(total_samples, int(round(end_sec * sr))))
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


def mix_master(tl: MasterTimeline, cues: list[ScheduledCue]) -> np.ndarray:
    total_samples = int(round(tl.total_duration_sec * SR))

    sections = [{"id": s.id, "duration_sec": s.duration_sec, "bpm": s.bpm, "energy": s.energy}
                for s in tl.music_sections]
    music_bed = generate_music_bed(sections, target_total_sec=tl.total_duration_sec)
    if music_bed.shape[0] != total_samples:
        if music_bed.shape[0] > total_samples:
            music_bed = music_bed[:total_samples]
        else:
            music_bed = np.concatenate(
                [music_bed, np.zeros((total_samples - music_bed.shape[0], 2), dtype=np.float32)]
            )

    narration_events = [(c.start_sec, c.end_sec) for c in cues]
    narration_duck = _duck_envelope(total_samples, SR, narration_events,
                                     NARRATION_DUCK_DB, NARRATION_DUCK_IN_MS, NARRATION_DUCK_RECOVERY_MS)

    bell_durs = {"go": 0.3, "warning": 0.25, "rest": 0.6, "round_complete": 0.65}
    bell_events = [(b.at_sec, b.at_sec + bell_durs[b.kind]) for b in tl.bells]
    bell_duck = _duck_envelope(total_samples, SR, bell_events,
                                BELL_DUCK_DB, BELL_DUCK_IN_MS, BELL_DUCK_RECOVERY_MS)

    combined_duck = np.minimum(narration_duck, bell_duck)
    ducked_music = music_bed * (MUSIC_GAIN * combined_duck[:, None])

    bells_bus = np.zeros((total_samples, 2), dtype=np.float32)
    for bell in tl.bells:
        sample = BELLS[bell.kind]()
        start_idx = int(round(bell.at_sec * SR))
        _place_stereo(bells_bus, sample * BELL_GAIN, start_idx)

    narration_bus = np.zeros((total_samples, 2), dtype=np.float32)
    for c in cues:
        data, file_sr = sf.read(str(c.wav_path), dtype="float32", always_2d=False)
        if file_sr != SR:
            raise RuntimeError(f"Sample rate mismatch for {c.wav_path}: {file_sr} != {SR}")
        if data.ndim > 1:
            data = data.mean(axis=1)
        data = _fade_edges(data, SR)
        stereo = np.stack([data, data], axis=1)
        _place_stereo(narration_bus, stereo, int(round(c.start_sec * SR)))

    fade_n = int(0.5 * SR)
    if total_samples > 2 * fade_n:
        ramp = np.linspace(0, 1, fade_n, dtype=np.float32)
        ducked_music[:fade_n] *= ramp[:, None]
        ducked_music[-fade_n:] *= ramp[::-1][:, None]

    mix = ducked_music + bells_bus + narration_bus
    mix = np.tanh(mix * 0.98) * 0.98
    return mix.astype(np.float32)


def _measure_loudnorm(wav_path: Path, target_i: float, target_tp: float, target_lra: float) -> dict:
    cmd = ["ffmpeg", "-v", "info", "-i", str(wav_path),
           "-af", f"loudnorm=I={target_i}:TP={target_tp}:LRA={target_lra}:print_format=json",
           "-f", "null", "-"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    match = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", result.stderr, re.DOTALL)
    if not match:
        raise RuntimeError(f"loudnorm measurement failed:\n{result.stderr[-2000:]}")
    return json.loads(match.group(0))


def export_audio(mix: np.ndarray, out_dir: Path, base_name: str,
                  target_lufs: float = -15.0, true_peak_db: float = -1.0, target_lra: float = 11.0) -> dict:
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
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(raw_wav), "-af", af, "-ar", "44100", str(normalized_wav)],
                        capture_output=True, text=True, check=True)
        mp3_path = out_dir / f"{base_name}.mp3"
        m4a_path = out_dir / f"{base_name}.m4a"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(normalized_wav),
                         "-codec:a", "libmp3lame", "-b:a", "192k", str(mp3_path)],
                        capture_output=True, text=True, check=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(normalized_wav),
                         "-codec:a", "aac", "-b:a", "192k", str(m4a_path)],
                        capture_output=True, text=True, check=True)
    return {"mp3": mp3_path, "m4a": m4a_path, "measured_loudness": measured}


def write_schedule_json(tl: MasterTimeline, cues: list[ScheduledCue], out_path: Path) -> None:
    """Machine-readable schedule for the frontend's Now Playing screen --
    drives the countdown ring and cue-line display off audio currentTime."""
    segments = []
    for s in tl.segments:
        segments.append({
            "kind": s.kind,
            "start_sec": round(s.start_sec, 2),
            "end_sec": round(s.end_sec, 2),
            "exercise_name": s.block.name if s.block else None,
            "round_index": s.block.round_index if s.block else None,
            "round_boundary": s.round_boundary,
        })
    bells = [{"kind": b.kind, "at_sec": round(b.at_sec, 2)} for b in tl.bells]
    cue_list = [{"start_sec": round(c.start_sec, 2), "end_sec": round(c.end_sec, 2), "text": c.text} for c in cues]
    import json as _json
    Path(out_path).write_text(
        _json.dumps({
            "total_duration_sec": round(tl.total_duration_sec, 2),
            "segments": segments, "bells": bells, "cues": cue_list,
        }, indent=2),
        encoding="utf-8",
    )


def write_timeline_txt(tl: MasterTimeline, cues: list[ScheduledCue], out_path: Path) -> None:
    def fmt(sec: float) -> str:
        sec = max(0, int(round(sec)))
        return f"{sec // 60:02d}:{sec % 60:02d}"

    events = []
    for s in tl.segments:
        label = s.kind.upper().replace("_", " ")
        name = s.block.name if s.block else ""
        events.append((s.start_sec, f"{fmt(s.start_sec)} SEGMENT {label} {name}".rstrip()))
    for b in tl.bells:
        events.append((b.at_sec, f"{fmt(b.at_sec)} BELL {b.kind}"))
    for c in cues:
        events.append((c.start_sec, f"{fmt(c.start_sec)} VOICE \"{c.text}\""))
    events.sort(key=lambda x: x[0])
    lines = [e[1] for e in events]
    lines.append(f"{fmt(tl.total_duration_sec)} END")
    Path(out_path).write_text("\n".join(lines) + "\n", encoding="utf-8")
