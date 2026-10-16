"""
Interval/timer tones -- distinct from narration, never TTS. These are the
"Tabata bell" signals: short, synthesized, percussive, unambiguous. They
get scheduling priority over narration (see timeline.py) and a lighter,
faster duck on the music bed than narration gets, so the beat barely
flinches when one fires.
"""
from __future__ import annotations

import numpy as np

SR = 44100


def _note(freq: float, dur: float, decay: float, sr: int = SR) -> np.ndarray:
    n = int(sr * dur)
    t = np.arange(n) / sr
    env = np.exp(-t / decay)
    tone = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2 * t)
    return (tone * env).astype(np.float32)


def _concat_with_gap(parts: list[np.ndarray], gap_sec: float, sr: int = SR) -> np.ndarray:
    gap = np.zeros(int(sr * gap_sec), dtype=np.float32)
    out = []
    for i, p in enumerate(parts):
        out.append(p)
        if i < len(parts) - 1:
            out.append(gap)
    return np.concatenate(out)


def _stereo(mono: np.ndarray) -> np.ndarray:
    peak = np.abs(mono).max()
    if peak > 0:
        mono = mono / peak * 0.85
    return np.stack([mono, mono], axis=1).astype(np.float32)


def make_go_bell() -> np.ndarray:
    """Work starts. Rising triad, crisp and short."""
    notes = [_note(f, 0.1, 0.08) for f in (523.25, 659.25, 783.99)]
    return _stereo(_concat_with_gap(notes, 0.02))


def make_warning_bell() -> np.ndarray:
    """~15s left in this work segment. Two neutral blips, not alarming."""
    notes = [_note(440.0, 0.07, 0.05) for _ in range(2)]
    return _stereo(_concat_with_gap(notes, 0.09))


def make_rest_bell() -> np.ndarray:
    """Work ends, rest begins. One smooth descending tone."""
    n = int(SR * 0.6)
    t = np.arange(n) / SR
    freq = np.linspace(600, 300, n)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    env = np.exp(-t / 0.5)
    tone = np.sin(phase) * env
    return _stereo(tone.astype(np.float32))


def make_round_complete_bell() -> np.ndarray:
    """A full round/circuit is done. Brighter, longer, a little triumphant."""
    notes = [_note(f, 0.14, 0.12) for f in (523.25, 659.25, 783.99, 1046.50)]
    return _stereo(_concat_with_gap(notes, 0.015))


BELLS = {
    "go": make_go_bell,
    "warning": make_warning_bell,
    "rest": make_rest_bell,
    "round_complete": make_round_complete_bell,
}
