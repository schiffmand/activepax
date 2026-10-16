"""Render the goal tracks to audio from curves.json (written by curves.mjs from core's own programs).

  python3 tracks/synth.py <curves.json> <outDir> preview   # ~2 min real-time excerpts of each track
  python3 tracks/synth.py <curves.json> <outDir> full      # every track at full length

The sound matches the engine: L = carrier - beat/2, R = carrier + beat/2 (phase-continuous sines),
an RMS-normalised looped noise bed at noise% x the beat's level (25% = -12 dB), the program's level
envelope as linear gain, an 8 s perceptual fade-in and the program's own end fade.
Standalone files are mastered louder than the in-app Medium level (beat at -20 dBFS RMS per ear),
because nothing else is playing on top of them.
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44_100
BEAT_RMS_DBFS = -20.0
FADE_IN_SEC = 8.0
CHUNK_SEC = 30.0
EXCERPT_SEC = 30.0
XFADE_SEC = 2.5

rng = np.random.default_rng(2026)


def noise_loop(kind: str, seconds: float = 30.0) -> np.ndarray:
    """A seamless stereo noise loop (uncorrelated L/R), spectrally shaped and RMS-normalised to 1."""
    n = int(seconds * SR)
    out = np.empty((n, 2))
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1]
    slope = {"white": 0.0, "pink": -0.5, "brown": -1.0}[kind]
    shape = f ** slope
    shape[f < 20] = 0  # no sub-sonic rumble
    for ch in range(2):
        spec = np.fft.rfft(rng.standard_normal(n)) * shape
        x = np.fft.irfft(spec, n)
        out[:, ch] = x / np.sqrt(np.mean(x ** 2))
    return out


LOOPS = {}


def render(track: dict, t0: float, t1: float) -> np.ndarray:
    """Program time t0..t1 seconds -> stereo float64."""
    return np.concatenate(list(chunks(track, t0, t1)))


def chunks(track: dict, t0: float, t1: float):
    """Program time t0..t1 seconds as consecutive stereo chunks (phase-continuous)."""
    step = track["step"]
    grid = np.arange(len(track["beat"])) * step
    beat = np.asarray(track["beat"])
    carrier = np.asarray(track["carrier"])
    level = np.asarray(track["level"])
    noise = track["noise"]
    kind, nvol = noise["type"], noise["volume"]
    loop = None
    if kind != "off":
        loop = LOOPS.setdefault(kind, noise_loop(kind))
    amp = 10 ** (BEAT_RMS_DBFS / 20) * np.sqrt(2)  # sine peak for the target RMS
    total, fade_out = track["totalSec"], track["endFadeSec"]
    phase_l = phase_r = 0.0
    t = t0
    while t < t1 - 1e-9:
        n = int(round(min(CHUNK_SEC, t1 - t) * SR))
        ts = t + np.arange(n) / SR
        b = np.interp(ts, grid, beat)
        c = np.interp(ts, grid, carrier)
        lv = np.interp(ts, grid, level)
        fl, fr = c - b / 2, c + b / 2
        pl = phase_l + np.cumsum(2 * np.pi * fl / SR)
        pr = phase_r + np.cumsum(2 * np.pi * fr / SR)
        phase_l, phase_r = pl[-1] % (2 * np.pi), pr[-1] % (2 * np.pi)
        x = np.stack([np.sin(pl), np.sin(pr)], axis=1) * amp
        if loop is not None:
            idx = (np.arange(n) + int(round(t * SR))) % len(loop)
            x += loop[idx] * (10 ** (BEAT_RMS_DBFS / 20)) * nvol
        # envelopes in dB: fade in from -40 dB, end fade to -40 dB then silence
        env_db = np.zeros(n)
        env_db += np.clip(-40 + 40 * ts / FADE_IN_SEC, -40, 0)
        if fade_out > 0:
            env_db += np.clip(-40 * (ts - (total - fade_out)) / fade_out, -40, 0)
        g = 10 ** (env_db / 20)
        g[env_db <= -40] = 0
        x *= (lv * g)[:, None]
        yield x
        t += n / SR


def preview(track: dict) -> np.ndarray:
    total = track["totalSec"]
    starts = [0.0, total * 0.3, total * 0.62, total - EXCERPT_SEC]
    parts = [render(track, s, s + EXCERPT_SEC) for s in starts]
    xf = int(XFADE_SEC * SR)
    ramp = np.linspace(0, 1, xf)[:, None]
    y = parts[0]
    for p in parts[1:]:
        y = np.concatenate([y[:-xf], y[-xf:] * (1 - ramp) + p[:xf] * ramp, p[xf:]])
    if track["endFadeSec"] == 0:  # a track that holds all night: close the preview gently
        tail = int(4 * SR)
        y[-tail:] *= np.linspace(1, 0, tail)[:, None]
    return y


def write(parts, path: Path, title: str, bitrate: str) -> float:
    """Write chunks to WAV, encode to AAC, return the peak in dBFS."""
    wav = path.with_suffix(".wav")
    peak = 0.0
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        for y in parts:
            peak = max(peak, float(np.max(np.abs(y))))
            w.writeframes((np.clip(y, -1, 1) * 32767).astype("<i2").tobytes())
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-c:a", "aac", "-b:a", bitrate,
                    "-metadata", f"title={title}", "-metadata", "artist=Tuck", "-movflags", "+faststart", str(path)], check=True)
    wav.unlink()
    return 20 * np.log10(peak + 1e-12)


def main() -> None:
    curves, out_dir, mode = json.loads(Path(sys.argv[1]).read_text()), Path(sys.argv[2]), sys.argv[3]
    out_dir.mkdir(parents=True, exist_ok=True)
    for i, tr in enumerate(curves, 1):
        name = f"{i:02d}-{tr['id']}"
        if mode == "preview":
            y = preview(tr)
            peak = write([y], out_dir / f"{name}-preview.m4a", f"{tr['goal']} (preview)", "128k")
            secs = len(y) / SR
        else:
            peak = write(chunks(tr, 0, tr["totalSec"]), out_dir / f"{name}.m4a", tr["goal"], "96k")
            secs = tr["totalSec"]
        print(f"{name}: {secs / 60:.1f} min, peak {peak:.1f} dBFS", flush=True)


if __name__ == "__main__":
    main()
