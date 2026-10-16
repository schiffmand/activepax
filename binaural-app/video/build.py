"""Turn a recording from record.mjs into the captioned product walkthrough (1080x1920 MP4).

The soundtrack is synthesised to match what the prototype plays at each step:
the ear-check tones, the Focus layer (200 Hz left / 214 Hz right, brown noise
12 dB under the beat, 8 s perceptual fade-in, 20 s fade-out) and a simple pad
standing in for "your music" (the prototype simulates that app too).

Usage: python3 video/build.py <recordingDir> <fontsDir> <out.mp4>
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

rec, fonts, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
meta = json.loads((rec / "events.json").read_text())
ev = {e["name"]: e["t"] - meta["firstFrame"] for e in meta["events"]}
END_CARD = 3.5
video_len = meta["end"] - meta["firstFrame"]
total = video_len + END_CARD

# ---------------------------------------------------------------- soundtrack
SR = 48_000
n = int(total * SR)
t = np.arange(n) / SR
left = np.zeros(n)
right = np.zeros(n)
rng = np.random.default_rng(7)


def db(x):
    return 10 ** (x / 20)


def burst(freq, start, dur, amp_db, ramp=0.15):
    """A short sine tone with raised-cosine edges."""
    i0, i1 = int(start * SR), int((start + dur) * SR)
    seg = np.sin(2 * np.pi * freq * t[i0:i1])
    r = int(ramp * SR)
    env = np.ones(i1 - i0)
    env[:r] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, r))
    env[-r:] = env[:r][::-1]
    return i0, i1, seg * env * db(amp_db)


# Ear check: left tone, then right tone
i0, i1, s = burst(200, ev["ear-left"] + 0.1, 1.8, -24)
left[i0:i1] += s
i0, i1, s = burst(214, ev["ear-right"] + 0.1, 1.8, -24)
right[i0:i1] += s

# Focus layer envelope in dB: 8 s fade in from start, level changes ramp over 1 s,
# 20 s fade out from stop. Fades are linear in dB, as in the engine.
level_db = np.full(n, -80.0)
t_start, t_stop = ev["start"], ev["stop"]
LEVELS = {"medium": 0.0, "quiet": -8.0, "full": 5.0}
changes = sorted([(ev["quiet"], "quiet"), (ev["full"], "full"), (ev["medium"], "medium")])
target = np.zeros(n)
for when, name in changes:
    k = int(when * SR)
    prev = target[k - 1]
    ramp = np.clip((t[k:] - when) / 1.0, 0, 1)
    target[k:] = prev + (LEVELS[name] - prev) * ramp
fade_in = np.clip(-60 + 60 * (t - t_start) / 8.0, -60, 0)
fade_out = np.clip(-60 * (t - t_stop) / 20.0, -60, 0)
fade_out[t < t_stop] = 0
active = (t >= t_start) & (t < t_stop + 20)
level_db[active] = (target + fade_in + fade_out)[active]
gain = np.where(level_db <= -60, 0, db(level_db))

# Tones: L = carrier - beat/2, R = carrier + beat/2 (207 Hz carrier, 14 Hz beat)
TONE_DB = -21
left += np.sin(2 * np.pi * 200 * t) * gain * db(TONE_DB)
right += np.sin(2 * np.pi * 214 * t) * gain * db(TONE_DB)


def brown(size):
    w = rng.standard_normal(size)
    b = np.zeros(size)
    acc = 0.0
    # leaky integrator keeps it from wandering
    for i in range(0, size, 4096):
        chunk = w[i:i + 4096]
        out = np.empty_like(chunk)
        for j, x in enumerate(chunk):
            acc = 0.997 * acc + x
            out[j] = acc
        b[i:i + 4096] = out
    b -= b.mean()
    return b / np.sqrt(np.mean(b ** 2))


# Brown noise bed 12 dB under the beat (per-channel RMS), uncorrelated L/R
noise_rms = db(TONE_DB - 12)
left += brown(n) * gain * noise_rms
right += brown(n) * gain * noise_rms

# "Your music": a soft pad of four chords, centred, from the other-app toggle to the end
CHORDS = [(261.63, 329.63, 392.00), (220.00, 261.63, 329.63), (174.61, 220.00, 261.63), (196.00, 246.94, 293.66)]
music = np.zeros(n)
m_start, m_end = ev["other-on"], total - 1.0
step = 3.0
k = 0
when = m_start
while when < m_end:
    chord = CHORDS[k % 4]
    i0, i1 = int(when * SR), min(int((when + step + 1.0) * SR), n)
    tt = t[i0:i1] - when
    env = np.minimum(1, tt / 0.8) * np.clip((step + 1.0 - tt) / 1.2, 0, 1)
    tone = sum(np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(4 * np.pi * f * tt) for f in chord)
    music[i0:i1] += tone * env
    when += step
    k += 1
music *= db(-20) / max(1e-9, np.sqrt(np.mean(music[int(m_start * SR):int(m_end * SR)] ** 2)))
outro = np.clip((m_end - t) / 2.0, 0, 1)
music *= outro
left += music
right += music

pcm = np.stack([left, right], axis=1)
peak = np.max(np.abs(pcm))
if peak > 0.89:
    pcm *= 0.89 / peak
wav_path = rec / "soundtrack.wav"
with wave.open(str(wav_path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((pcm * 32767).astype("<i2").tobytes())

# ---------------------------------------------------------------- captions (ASS)
CAPS = [
    (0, "ear-left", "Tuck plays a soft layer of binaural beats and noise under whatever you already listen to."),
    ("ear-left", "stereo-ok", "First, a quick ear check: one tone on the left, one on the right. The beat needs stereo headphones."),
    ("stereo-ok", "home", "Stereo confirmed. The beat lives in the gap between the two tones."),
    ("home", "start", "Home asks one thing: how are you arriving? Each answer maps to a layer, in plain words."),
    ("start", "playing", "Tap Start sound. The layer rises and the sound fades in over 8 seconds."),
    ("playing", "other-on", "Focus: a 14 Hz beat (200 Hz left, 214 Hz right) over soft brown noise."),
    ("other-on", "quiet", "Your music keeps playing on top. Tuck never pauses or ducks it. (The music is simulated in this demo.)"),
    ("quiet", "spec", "Level sets how far under your audio Tuck sits: Quiet, Medium or Full."),
    ("spec", "stop", "Tap the numbers for the full spec: both ears, the carrier, the noise, the fades."),
    ("stop", "mixing", "Stop fades out over 20 seconds. No streaks and nothing to keep up with."),
    ("mixing", "science", "It explains how it plays under your audio, and what the phone doesn't tell apps."),
    ("science", video_len, "And it's honest about the science: the beat is real, the benefits aren't proven."),
]


def ts(x):
    x = max(0.0, x)
    h, rem = divmod(x, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def at(v):
    return v if isinstance(v, (int, float)) else ev[v]


BG = "&H001C211C"  # ASS colours are &HAABBGGRR
CREAM = "&H00DAE7EC"
MUTED = "&H00A8B5A9"
ass = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Atkinson Hyperlegible Next,48,{CREAM},{CREAM},{BG},{BG},0,0,0,0,100,100,0,0,1,0,0,8,90,90,1640,1
Style: Brand,Literata,46,{CREAM},{CREAM},{BG},{BG},0,0,0,0,100,100,0,0,1,0,0,7,96,0,52,1
Style: Note,Atkinson Hyperlegible Next,30,{MUTED},{MUTED},{BG},{BG},0,0,0,0,100,100,0,0,1,0,0,9,0,96,64,1
Style: Card,Literata,120,{CREAM},{CREAM},{BG},{BG},0,0,0,0,100,100,0,0,1,0,0,5,90,90,0,1
Style: CardSub,Atkinson Hyperlegible Next,46,{MUTED},{MUTED},{BG},{BG},0,0,0,0,100,100,0,0,1,0,0,5,120,120,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,{ts(0)},{ts(video_len)},Brand,,0,0,0,,Tuck
Dialogue: 0,{ts(0)},{ts(video_len)},Note,,0,0,0,,Prototype walkthrough · headphones on
"""
for a, b, text in CAPS:
    ass += f"Dialogue: 0,{ts(at(a) + 0.15)},{ts(at(b) - 0.05)},Cap,,0,0,0,,{{\\fad(200,150)}}{text}\n"
# End card: a full-frame panel over the last frame, then the name and line
ass += f"Dialogue: 1,{ts(video_len)},{ts(total)},Cap,,0,0,0,,{{\\an7\\pos(0,0)\\p1\\1c{BG}\\fad(400,0)}}m 0 0 l 1080 0 1080 1920 0 1920{{\\p0}}\n"
ass += f"Dialogue: 2,{ts(video_len + 0.2)},{ts(total)},Card,,0,0,0,,{{\\pos(540,900)\\fad(500,0)}}Tuck\n"
ass += f"Dialogue: 2,{ts(video_len + 0.5)},{ts(total)},CardSub,,0,0,0,,{{\\pos(540,1040)\\fad(500,0)}}Tuck a little sound under whatever you're playing.\n"
(rec / "captions.ass").write_text(ass)

# ---------------------------------------------------------------- compose
PHONE_H = 1440
phone_w = round(780 * PHONE_H / 1688 / 2) * 2
filt = (
    f"[0:v]fps=30,scale={phone_w}:{PHONE_H}:flags=lanczos,"
    f"tpad=stop_mode=clone:stop_duration={END_CARD}[ph];"
    f"color=c=0x1C211C:s=1080x1920:r=30:d={total:.3f}[bg];"
    f"[bg]drawbox=x={(1080 - phone_w) // 2 - 3}:y=147:w={phone_w + 6}:h={PHONE_H + 6}:color=0x3A4237:t=fill[bg2];"
    f"[bg2][ph]overlay=x={(1080 - phone_w) // 2}:y=150:shortest=1,"
    f"ass={rec / 'captions.ass'}:fontsdir={fonts},format=yuv420p[v]"
)
subprocess.run([
    "ffmpeg", "-loglevel", "error", "-y",
    "-f", "concat", "-safe", "0", "-i", str(rec / "frames.txt"),
    "-i", str(wav_path),
    "-filter_complex", filt, "-map", "[v]", "-map", "1:a",
    "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-t", f"{total:.3f}", "-movflags", "+faststart",
    str(out),
], check=True)
print(out, f"{total:.1f}s")
