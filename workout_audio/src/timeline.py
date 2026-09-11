"""
Parses workout.yaml into a deterministic master timeline: an ordered,
non-overlapping list of narration events with absolute start/end times,
plus per-section music parameters (duration/bpm/energy).

The same workout.yaml always produces the same timeline (given the same
TTS engine/voice), which is what makes the whole build reproducible.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

from tts import TTSAdapter


class TimelineError(RuntimeError):
    pass


def parse_timecode(value: str) -> float:
    parts = [float(p) for p in str(value).split(":")]
    if len(parts) == 2:
        m, s = parts
        return m * 60 + s
    if len(parts) == 3:
        h, m, s = parts
        return h * 3600 + m * 60 + s
    raise TimelineError(f"Bad timecode: {value!r}")


def format_timecode(seconds: float) -> str:
    seconds = max(0, int(round(seconds)))
    m, s = divmod(seconds, 60)
    return f"{m:02d}:{s:02d}"


@dataclass
class CueEvent:
    start_sec: float
    end_sec: float
    text: str
    wav_path: Path
    section_id: str
    block_exercise: str


@dataclass
class SectionSpec:
    id: str
    start_sec: float
    end_sec: float
    title: str
    bpm: float
    energy: str

    @property
    def duration_sec(self) -> float:
        return self.end_sec - self.start_sec


@dataclass
class Timeline:
    events: list[CueEvent] = field(default_factory=list)
    sections: list[SectionSpec] = field(default_factory=list)
    total_duration_sec: float = 0.0
    warnings: list[str] = field(default_factory=list)


def load_workout(path: str | Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not data or "sections" not in data:
        raise TimelineError(f"{path} has no 'sections' key — not a valid workout spec.")
    return data


def _bpm_midpoint(bpm_range: str) -> float:
    lo, hi = bpm_range.split("-")
    return (float(lo) + float(hi)) / 2.0


def validate_structure(workout: dict) -> None:
    sections = workout["sections"]
    if not sections:
        raise TimelineError("workout.yaml defines no sections.")

    prev_end = None
    for sec in sections:
        s0, s1 = parse_timecode(sec["start"]), parse_timecode(sec["end"])
        if s1 <= s0:
            raise TimelineError(f"Section {sec['id']!r} end <= start.")
        if prev_end is not None and abs(s0 - prev_end) > 1e-6:
            raise TimelineError(
                f"Section {sec['id']!r} starts at {sec['start']} but the "
                f"previous section ended at {format_timecode(prev_end)} — "
                "sections must be contiguous and non-overlapping."
            )
        prev_end = s1

        blocks = sec.get("blocks") or []
        if not blocks:
            raise TimelineError(f"Section {sec['id']!r} has no blocks.")
        prev_block_end = s0
        for blk in blocks:
            b0, b1 = parse_timecode(blk["start"]), parse_timecode(blk["end"])
            if b1 <= b0:
                raise TimelineError(
                    f"Block {blk.get('exercise')!r} in section {sec['id']!r} "
                    "end <= start."
                )
            if abs(b0 - prev_block_end) > 1e-6:
                raise TimelineError(
                    f"Block {blk.get('exercise')!r} in section {sec['id']!r} "
                    f"starts at {blk['start']} but the previous block/section "
                    f"boundary was at {format_timecode(prev_block_end)}."
                )
            prev_block_end = b1
            if not blk.get("lines"):
                raise TimelineError(
                    f"Block {blk.get('exercise')!r} in section {sec['id']!r} "
                    "has no narration lines."
                )
        if abs(prev_block_end - s1) > 1e-6:
            raise TimelineError(
                f"Section {sec['id']!r} blocks end at "
                f"{format_timecode(prev_block_end)} but the section ends at "
                f"{sec['end']}."
            )


def build_timeline(workout: dict, tts_adapter: TTSAdapter) -> Timeline:
    """
    Synthesizes every narration line (via `tts_adapter`) and schedules cues
    within each block using their real spoken durations, so cues never
    overlap and always land inside their block.
    """
    validate_structure(workout)

    tl = Timeline()
    sections = workout["sections"]
    tl.total_duration_sec = parse_timecode(sections[-1]["end"])

    for sec in sections:
        s0, s1 = parse_timecode(sec["start"]), parse_timecode(sec["end"])
        tl.sections.append(
            SectionSpec(
                id=sec["id"],
                start_sec=s0,
                end_sec=s1,
                title=sec["title"],
                bpm=_bpm_midpoint(sec["music_bpm"]),
                energy=sec["music_energy"],
            )
        )

        for blk in sec["blocks"]:
            b0, b1 = parse_timecode(blk["start"]), parse_timecode(blk["end"])
            block_dur = b1 - b0
            lines = blk["lines"]

            synthesized = []
            for text in lines:
                wav_path = tts_adapter.synth(text)
                dur = _wav_duration_sec(wav_path)
                synthesized.append((text, wav_path, dur))

            total_speech = sum(d for _, _, d in synthesized)
            n = len(synthesized)
            lead_in = min(2.0, block_dur * 0.08)
            tail_out = min(1.5, block_dur * 0.05)
            remaining = block_dur - total_speech - lead_in - tail_out
            gap = (remaining / (n - 1)) if n > 1 else 0.0

            if remaining < 0:
                tl.warnings.append(
                    f"Block '{blk['exercise']}' ({sec['id']}) is tightly packed: "
                    f"{total_speech:.1f}s of speech in a {block_dur:.1f}s block. "
                    "Cues will be spaced with minimal gaps."
                )
                gap = 0.0
                lead_in = min(lead_in, max(0.0, block_dur - total_speech))

            cursor = b0 + lead_in
            for text, wav_path, dur in synthesized:
                cue_end = cursor + dur
                if cue_end > tl.total_duration_sec:
                    tl.warnings.append(
                        f"Cue '{text[:40]}...' in block '{blk['exercise']}' "
                        "extends past the final workout duration; trimming."
                    )
                    cue_end = tl.total_duration_sec
                tl.events.append(
                    CueEvent(
                        start_sec=cursor,
                        end_sec=cue_end,
                        text=text,
                        wav_path=wav_path,
                        section_id=sec["id"],
                        block_exercise=blk["exercise"],
                    )
                )
                cursor = cue_end + max(gap, 0.0)

    return tl


def _wav_duration_sec(path: Path) -> float:
    import soundfile as sf

    info = sf.info(str(path))
    return info.frames / float(info.samplerate)


def write_timeline_txt(tl: Timeline, out_path: str | Path) -> None:
    lines = []
    section_by_id = {s.id: s for s in tl.sections}
    printed_sections = set()

    events = sorted(tl.events, key=lambda e: e.start_sec)
    for ev in events:
        if ev.section_id not in printed_sections:
            sec = section_by_id[ev.section_id]
            lines.append(
                f"{format_timecode(sec.start_sec)} SECTION {sec.title} "
                f"(~{sec.bpm:.0f} BPM, {sec.energy})"
            )
            printed_sections.add(ev.section_id)
        lines.append(
            f"{format_timecode(ev.start_sec)} VOICE \"{ev.text}\" "
            f"[{ev.block_exercise}]"
        )
    lines.append(f"{format_timecode(tl.total_duration_sec)} END")

    Path(out_path).write_text("\n".join(lines) + "\n", encoding="utf-8")
