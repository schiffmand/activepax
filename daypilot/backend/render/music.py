"""
Procedural instrumental house-music bed generator.

Why procedural: this environment's network egress only reaches package
registries (pypi/apt) — every royalty-free music host (Mixkit, Pixabay,
Free Music Archive, Incompetech, Freesound, freepd, archive.org,
Wikimedia) is unreachable from here. Rather than fail or fabricate a
download, this module synthesizes original instrumental electronic music
from scratch with numpy/scipy: kick, hats, sidechained bass, pads and an
arpeggiated lead, built around the exact BPM/energy curve the workout
calls for. Being wholly generated, it carries no licensing risk at all.

Style targets: progressive / deep / melodic house. No vocals, no drops,
no aggressive dubstep — steady, warm, "adult" energy.
"""
from __future__ import annotations

import numpy as np
from scipy.signal import butter, lfilter

SR = 44100

# Minor-key chord loops (root semitone offsets from A2 = MIDI 45, ~110 Hz),
# written as lists of (root_semitone, [chord tone semitone offsets]) per bar.
# 8-bar loops in A minor / F major relative — moody but clean, not cheesy.
_CHORDS_MAIN = [
    (0, [0, 3, 7]),      # Am
    (0, [0, 3, 7]),
    (-2, [0, 3, 7]),     # Gm-ish passing -> kept simple, reused root
    (5, [0, 4, 7]),      # F major (relative major, borrowed)
    (5, [0, 4, 7]),
    (3, [0, 3, 7]),      # Cish
    (8, [0, 4, 7]),      # Fmaj alt voicing
    (7, [0, 3, 7]),      # Em-ish -> resolves back to Am
]

_CHORDS_SPARSE = [
    (0, [0, 3, 7]),
    (0, [0, 3, 7]),
    (5, [0, 4, 7]),
    (5, [0, 4, 7]),
]

ENERGY_PRESETS = {
    # 0:00-8:00 warm-up: settled, welcoming, moderate motion
    "warmup": dict(
        chords=_CHORDS_MAIN, kick_gain=0.62, hat_gain=0.28, bass_gain=0.55,
        pad_gain=0.85, arp=False, arp_gain=0.0, bass_pattern="quarter",
        hat_density="normal", brightness=0.35, shaker=False,
    ),
    # 8:00-13:00 release: low-energy, rhythmic but sparse (half-time feel)
    "release": dict(
        chords=_CHORDS_SPARSE, kick_gain=0.42, hat_gain=0.16, bass_gain=0.38,
        pad_gain=0.95, arp=False, arp_gain=0.0, bass_pattern="half",
        hat_density="sparse", brightness=0.22, shaker=False,
    ),
    # 13:00-25:00 & 39:00-46:00 strength: driving melodic/progressive house
    "strength": dict(
        chords=_CHORDS_MAIN, kick_gain=0.72, hat_gain=0.34, bass_gain=0.68,
        pad_gain=0.8, arp=True, arp_gain=0.22, bass_pattern="eighth",
        hat_density="normal", brightness=0.5, shaker=False,
    ),
    # 25:00-39:00 shoulders/arms: highest-energy block
    "peak": dict(
        chords=_CHORDS_MAIN, kick_gain=0.8, hat_gain=0.4, bass_gain=0.72,
        pad_gain=0.75, arp=True, arp_gain=0.32, bass_pattern="syncopated",
        hat_density="dense", brightness=0.68, shaker=True,
    ),
    # 46:00-52:00 conditioning finish: driving but controlled
    "finish": dict(
        chords=_CHORDS_MAIN, kick_gain=0.74, hat_gain=0.34, bass_gain=0.66,
        pad_gain=0.8, arp=True, arp_gain=0.24, bass_pattern="eighth",
        hat_density="normal", brightness=0.5, shaker=False,
    ),
}


def _midi_to_freq(semitone_offset_from_a2: float) -> float:
    return 110.0 * (2.0 ** (semitone_offset_from_a2 / 12.0))


def _lowpass(x: np.ndarray, cutoff_hz: float, sr: int = SR, order: int = 2) -> np.ndarray:
    nyq = sr / 2.0
    cutoff = min(max(cutoff_hz, 20.0), nyq * 0.99)
    b, a = butter(order, cutoff / nyq, btype="low")
    return lfilter(b, a, x).astype(np.float32)


def _highpass(x: np.ndarray, cutoff_hz: float, sr: int = SR, order: int = 2) -> np.ndarray:
    nyq = sr / 2.0
    cutoff = min(max(cutoff_hz, 20.0), nyq * 0.99)
    b, a = butter(order, cutoff / nyq, btype="high")
    return lfilter(b, a, x).astype(np.float32)


def _place(buf: np.ndarray, sample: np.ndarray, start_idx: int) -> None:
    """Add `sample` into `buf` at `start_idx`, clipping to buffer bounds."""
    n = buf.shape[0]
    end_idx = start_idx + sample.shape[0]
    if end_idx <= 0 or start_idx >= n:
        return
    s0, s1 = max(0, start_idx), min(n, end_idx)
    b0, b1 = s0 - start_idx, s1 - start_idx
    buf[s0:s1] += sample[b0:b1]


def _make_kick(sr: int = SR) -> np.ndarray:
    dur = 0.32
    t = np.arange(int(sr * dur)) / sr
    pitch_env = 150.0 * np.exp(-t / 0.045) + 42.0
    phase = 2 * np.pi * np.cumsum(pitch_env) / sr
    body = np.sin(phase)
    amp_env = np.exp(-t / 0.22)
    click = np.exp(-t / 0.003) * (np.random.default_rng(1).uniform(-1, 1, t.shape))
    return (body * amp_env + 0.15 * click).astype(np.float32)


def _make_hat(sr: int = SR, open_hat: bool = False, seed: int = 0) -> np.ndarray:
    dur = 0.22 if open_hat else 0.055
    n = int(sr * dur)
    rng = np.random.default_rng(seed)
    noise = rng.uniform(-1, 1, n).astype(np.float32)
    noise = _highpass(noise, 7500.0, sr)
    t = np.arange(n) / sr
    tau = 0.09 if open_hat else 0.02
    env = np.exp(-t / tau)
    return (noise * env).astype(np.float32)


def _make_shaker(sr: int = SR, seed: int = 0) -> np.ndarray:
    dur = 0.09
    n = int(sr * dur)
    rng = np.random.default_rng(seed)
    noise = rng.uniform(-1, 1, n).astype(np.float32)
    noise = _highpass(noise, 4500.0, sr)
    t = np.arange(n) / sr
    env = np.exp(-t / 0.045)
    return (noise * env * 0.6).astype(np.float32)


def _saw(freq: float, n: int, sr: int = SR, detune_cents: float = 0.0) -> np.ndarray:
    f = freq * (2.0 ** (detune_cents / 1200.0))
    t = np.arange(n) / sr
    phase = (t * f) % 1.0
    return (2.0 * phase - 1.0).astype(np.float32)


def _make_bass_note(freq: float, dur: float, sr: int = SR) -> np.ndarray:
    n = int(sr * dur)
    t = np.arange(n) / sr
    sub = np.sin(2 * np.pi * freq * t)
    saw = _saw(freq, n, sr)
    tone = 0.65 * sub + 0.35 * saw
    attack = min(0.006, dur * 0.1)
    a_n = max(1, int(attack * sr))
    env = np.ones(n, dtype=np.float32)
    env[:a_n] = np.linspace(0, 1, a_n)
    release_n = min(n, int(0.03 * sr))
    env[-release_n:] *= np.linspace(1, 0, release_n)
    tone = _lowpass(tone * env, 900.0, sr, order=2)
    return tone.astype(np.float32)


def _make_pluck(freq: float, dur: float = 0.14, sr: int = SR) -> np.ndarray:
    n = int(sr * dur)
    t = np.arange(n) / sr
    tone = 0.5 * np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(2 * np.pi * freq * 2 * t)
    env = np.exp(-t / 0.09)
    return (tone * env).astype(np.float32)


def _make_pad_bar(freqs: list[float], dur: float, brightness: float, sr: int = SR) -> np.ndarray:
    n = int(sr * dur)
    t = np.arange(n) / sr
    mellow = np.zeros(n, dtype=np.float32)
    bright = np.zeros(n, dtype=np.float32)
    for f in freqs:
        mellow += 0.5 * np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * f * 2 * t)
        bright += _saw(f, n, sr, detune_cents=6) + _saw(f, n, sr, detune_cents=-6)
    mellow = _lowpass(mellow, 900.0, sr)
    bright = _lowpass(bright, 2600.0, sr)
    mix = mellow * (1.0 - brightness) + bright * (brightness * 0.5)
    attack_n = min(n, int(0.35 * sr))
    release_n = min(n, int(0.25 * sr))
    env = np.ones(n, dtype=np.float32)
    env[:attack_n] = np.linspace(0, 1, attack_n) ** 1.5
    env[-release_n:] *= np.linspace(1, 0, release_n) ** 1.5
    return (mix * env / max(1, len(freqs))).astype(np.float32)


def synthesize_section(duration_sec: float, bpm: float, energy: str, seed: int = 0) -> np.ndarray:
    """Return a (n, 2) float32 stereo buffer of original house music."""
    preset = ENERGY_PRESETS[energy]
    beat_dur = 60.0 / bpm
    bar_dur = beat_dur * 4
    n_bars = max(1, round(duration_sec / bar_dur))
    total_dur = n_bars * bar_dur
    n_samples = int(round(total_dur * SR))

    mono = np.zeros(n_samples, dtype=np.float32)
    kick_bus = np.zeros(n_samples, dtype=np.float32)
    perc_bus = np.zeros(n_samples, dtype=np.float32)
    bass_bus = np.zeros(n_samples, dtype=np.float32)
    pad_bus = np.zeros(n_samples, dtype=np.float32)
    arp_bus = np.zeros(n_samples, dtype=np.float32)

    kick_sample = _make_kick()
    rng = np.random.default_rng(seed)

    chords = preset["chords"]

    # Sidechain duck envelope: one period per beat, deep quick dip then
    # smooth recovery, matching classic 4-on-the-floor pumping house.
    duck_n = int(round(beat_dur * SR))
    duck_t = np.arange(duck_n) / SR
    duck_env = 1.0 - 0.75 * np.exp(-duck_t / 0.05)
    duck_env = np.clip(duck_env, 0.2, 1.0).astype(np.float32)

    for bar in range(n_bars):
        bar_start_sample = int(round(bar * bar_dur * SR))
        root_semi, tones = chords[bar % len(chords)]
        variant = (bar // 16) % 2  # slow variation every 16 bars, anti-fatigue

        chord_freqs = [_midi_to_freq(root_semi + t) for t in tones]
        pad = _make_pad_bar(chord_freqs, bar_dur, preset["brightness"])
        _place(pad_bus, pad * preset["pad_gain"], bar_start_sample)

        for beat in range(4):
            beat_start_sample = bar_start_sample + int(round(beat * beat_dur * SR))
            _place(kick_bus, kick_sample * preset["kick_gain"], beat_start_sample)

            # hats: closed on every 8th, density controls how many land
            density = preset["hat_density"]
            offsets = [0.0, 0.5] if density != "sparse" else [0.5]
            if density == "dense":
                offsets = [0.0, 0.25, 0.5, 0.75]
            for i, off in enumerate(offsets):
                open_hat = density == "dense" and beat == 3 and off == 0.75
                hat = _make_hat(open_hat=open_hat, seed=int(bar * 4 + beat) * 7 + i)
                gain = preset["hat_gain"] * (0.7 if not open_hat else 1.0)
                _place(perc_bus, hat * gain, beat_start_sample + int(off * beat_dur * SR))

            if preset["shaker"]:
                for off in (0.25, 0.75):
                    shk = _make_shaker(seed=int(bar * 4 + beat) * 13 + int(off * 10))
                    _place(perc_bus, shk * 0.5, beat_start_sample + int(off * beat_dur * SR))

        # bass: overwrite the placeholder region with real notes per pattern
        pattern = preset["bass_pattern"]
        root_freq = _midi_to_freq(root_semi - 12)
        if pattern == "half":
            note_times = [0.0, 2.0]
        elif pattern == "quarter":
            note_times = [0.0, 1.0, 2.0, 3.0]
        elif pattern == "eighth":
            note_times = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]
        else:  # syncopated
            note_times = [0.0, 0.75, 1.5, 2.0, 2.75, 3.5]
        note_dur = min(0.4, beat_dur * 0.9)
        for nt in note_times:
            freq = root_freq * (1.5 if (variant == 1 and nt in (1.5, 3.5)) else 1.0)
            note = _make_bass_note(freq, note_dur)
            start = bar_start_sample + int(round(nt * beat_dur * SR))
            _place(bass_bus, note * preset["bass_gain"], start)

        if preset["arp"]:
            arp_tones = tones + [tones[0] + 12]
            steps = 8
            for s in range(steps):
                if variant == 1 and s % 2 == 1:
                    continue  # sparser alt pattern for variety
                idx = s % len(arp_tones)
                freq = _midi_to_freq(root_semi + arp_tones[idx] + 12)
                pluck = _make_pluck(freq)
                start = bar_start_sample + int(round((s * beat_dur * 4 / steps) * SR))
                _place(arp_bus, pluck * preset["arp_gain"], start)

    kick_bus = np.clip(kick_bus, -1.2, 1.2)
    bass_bus = bass_bus * duck_env[np.arange(n_samples) % duck_n]
    pad_bus = pad_bus * duck_env[np.arange(n_samples) % duck_n]
    arp_bus = arp_bus * duck_env[np.arange(n_samples) % duck_n]

    mono = kick_bus + perc_bus + bass_bus + pad_bus + arp_bus
    mono = np.tanh(mono * 0.9) * 0.95  # gentle soft-clip safety net

    left = mono
    right = mono.copy()
    # subtle stereo width: tiny complementary delay + pad-only pan wobble
    delay_samples = int(0.006 * SR)
    right = np.concatenate([np.zeros(delay_samples, dtype=np.float32), right])[:n_samples]
    stereo = np.stack([left, right], axis=1)
    return stereo.astype(np.float32)


def _equal_power_crossfade(a: np.ndarray, b: np.ndarray, n: int) -> np.ndarray:
    n = min(n, len(a), len(b))
    if n <= 0:
        return np.concatenate([a, b], axis=0)
    t = np.linspace(0, 1, n, dtype=np.float32)[:, None]
    fade_out = np.cos(t * np.pi / 2)
    fade_in = np.sin(t * np.pi / 2)
    head = a[:-n] if n < len(a) else np.zeros((0, a.shape[1]), dtype=np.float32)
    mixed = a[-n:] * fade_out + b[:n] * fade_in
    tail = b[n:]
    return np.concatenate([head, mixed, tail], axis=0)


_LOCAL_MUSIC_EXTS = {".mp3", ".wav", ".m4a", ".flac", ".aac", ".ogg"}


def _decode_to_stereo_array(path, sr: int = SR) -> np.ndarray:
    import subprocess
    import tempfile

    import soundfile as sf

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", str(path), "-ar", str(sr), "-ac", "2", tmp_path],
            check=True, capture_output=True, text=True,
        )
        data, _ = sf.read(tmp_path, dtype="float32", always_2d=True)
    finally:
        import os
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
    return data


def load_local_music_bed(music_dir, target_total_sec: float, crossfade_sec: float = 2.0) -> np.ndarray | None:
    """
    If the user has dropped their own licensed/royalty-free tracks into
    `music_dir`, loop and crossfade them to fill the workout instead of
    generating music. Returns None if the directory has no usable audio.
    """
    from pathlib import Path as _Path

    music_dir = _Path(music_dir)
    if not music_dir.exists():
        return None
    files = sorted(
        p for p in music_dir.iterdir()
        if p.suffix.lower() in _LOCAL_MUSIC_EXTS and p.stat().st_size > 0
    )
    if not files:
        return None

    tracks = [_decode_to_stereo_array(p) for p in files]
    target_n = int(round(target_total_sec * SR))
    crossfade_n = int(crossfade_sec * SR)

    bed = tracks[0]
    i = 1
    while bed.shape[0] < target_n:
        bed = _equal_power_crossfade(bed, tracks[i % len(tracks)], crossfade_n)
        i += 1

    if bed.shape[0] > target_n:
        fade_n = min(int(1.0 * SR), bed.shape[0] - target_n)
        bed = bed[:target_n].copy()
        if fade_n > 0:
            ramp = np.linspace(1, 0, fade_n, dtype=np.float32)[:, None]
            bed[-fade_n:] *= ramp
    return bed.astype(np.float32)


def generate_music_bed(sections: list[dict], target_total_sec: float, crossfade_sec: float = 1.5) -> np.ndarray:
    """
    sections: list of {id, duration_sec, bpm, energy, seed}
    Returns a (n, 2) float32 stereo buffer whose length matches
    target_total_sec as closely as bar-quantization allows, then is
    padded/trimmed to match exactly.
    """
    pieces = []
    for i, sec in enumerate(sections):
        audio = synthesize_section(
            sec["duration_sec"], sec["bpm"], sec["energy"], seed=i * 97 + 3
        )
        pieces.append(audio)

    crossfade_n = int(crossfade_sec * SR)
    bed = pieces[0]
    for nxt in pieces[1:]:
        bed = _equal_power_crossfade(bed, nxt, crossfade_n)

    target_n = int(round(target_total_sec * SR))
    if bed.shape[0] > target_n:
        fade_n = min(int(1.0 * SR), bed.shape[0] - target_n)
        bed = bed[:target_n].copy()
        if fade_n > 0:
            ramp = np.linspace(1, 0, fade_n, dtype=np.float32)[:, None]
            bed[-fade_n:] *= ramp
            bed[-fade_n:] += 0  # explicit fade-to-silence at the hard cut
    elif bed.shape[0] < target_n:
        pad = np.zeros((target_n - bed.shape[0], 2), dtype=np.float32)
        bed = np.concatenate([bed, pad], axis=0)

    # Final 30s: ease intensity slightly (gentle low-pass + gain taper).
    tail_n = min(target_n, int(30 * SR))
    if tail_n > 0:
        tail = bed[-tail_n:]
        tail_l = _lowpass(tail[:, 0], 2200.0)
        tail_r = _lowpass(tail[:, 1], 2200.0)
        taper = np.linspace(1.0, 0.82, tail_n, dtype=np.float32)
        bed[-tail_n:, 0] = tail_l * taper
        bed[-tail_n:, 1] = tail_r * taper

    return bed
