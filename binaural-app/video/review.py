"""Build the "simulated council review" cut: quotes from the round-4 persona council
(docs/reviews/round-4-council.md) over footage from the walkthrough recording.

These reviewers are AI personas, not real users, and every card says so.

Usage: python3 video/review.py <recordingDir> <fontsDir> <out.mp4>
(the recording dir needs raw.mp4 and soundtrack.wav from build.py)
"""
import subprocess
import sys
from pathlib import Path

rec, fonts, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])

# (name, seat, score, quote, note, footage start in raw.mp4)
SEATS = [
    ("Maya", "ADHD knowledge worker", "8.5",
     "“That's the time-blindness anchor I wanted, and it doesn't nag.”",
     "", 37.5),
    ("Leo", "Student", "9.0",
     "“Everything I care about works and reads right. … It's free, with no ads.”",
     "", 15.0),
    ("Sam", "Autistic, sensory-sensitive", "8.0",
     "“Every route sheet is literal.” But: “An overlay that hides words is exactly the unpredictable-UI thing I'm sensitive to.”",
     "The overlay was fixed after this round.", 5.5),
    ("Dev", "Programmer in deep work", "8.5",
     "“For an app whose whole pitch is ‘exact numbers’, the one line of numbers on the screen has to be self-consistent.”",
     "The readout was fixed after this round.", 49.5),
    ("Priya", "Sleep and longevity optimizer", "8.5",
     "“At 21:00 Home now offers Heavy-eyed → Evening descent … dim and warm. The full loop works.”",
     "", 41.0),
    ("Hannah", "Skeptic", "8.5",
     "“The control arm is a sham with the same tones and no beat, and the setup copy says so plainly. … That's the right humility.”",
     "", 70.0),
]
INTRO, SEG, OUTRO = 4.0, 6.5, 4.0
total = INTRO + SEG * len(SEATS) + OUTRO


def ts(x):
    m, s = divmod(max(0.0, x), 60)
    return f"0:{int(m):02d}:{s:05.2f}"


BG, CREAM, MUTED, LINING = "&H001C211C", "&H00DAE7EC", "&H00A8B5A9", "&H0088ADE5"
ass = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Quote,Literata,50,{CREAM},{CREAM},{BG},{BG},0,0,0,0,100,100,0,0,1,0,0,8,90,90,1240,1
Style: Who,Atkinson Hyperlegible Next,40,{LINING},{LINING},{BG},{BG},1,0,0,0,100,100,0,0,1,0,0,8,90,90,1150,1
Style: Note,Atkinson Hyperlegible Next,32,{MUTED},{MUTED},{BG},{BG},0,0,0,0,100,100,0,0,1,0,0,2,90,90,130,1
Style: Label,Atkinson Hyperlegible Next,30,{MUTED},{MUTED},{BG},{BG},0,0,0,0,100,100,0,0,1,0,0,2,90,90,60,1
Style: Card,Literata,92,{CREAM},{CREAM},{BG},{BG},0,0,0,0,100,100,0,0,1,0,0,5,90,90,0,1
Style: CardSub,Atkinson Hyperlegible Next,44,{MUTED},{MUTED},{BG},{BG},0,0,0,0,100,100,0,0,1,0,0,5,120,120,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,{ts(INTRO)},{ts(total - OUTRO)},Label,,0,0,0,,Simulated reviewers: AI personas from the Tuck customer council, round 4. Not real users.
Dialogue: 0,{ts(0.2)},{ts(INTRO)},Card,,0,0,0,,{{\\pos(540,820)\\fad(400,300)}}What the council said
Dialogue: 0,{ts(0.6)},{ts(INTRO)},CardSub,,0,0,0,,{{\\pos(540,1000)\\fad(400,300)}}Six simulated customers tried the Tuck prototype.\\NThey are AI personas, not real users.
"""
for i, (name, seat, score, quote, note, _) in enumerate(SEATS):
    a = INTRO + i * SEG
    ass += f"Dialogue: 0,{ts(a + 0.2)},{ts(a + SEG - 0.1)},Who,,0,0,0,,{{\\fad(250,200)}}{name}  ·  {seat}  ·  {score}/10\n"
    ass += f"Dialogue: 0,{ts(a + 0.35)},{ts(a + SEG - 0.1)},Quote,,0,0,0,,{{\\fad(300,200)}}{quote}\n"
    if note:
        ass += f"Dialogue: 0,{ts(a + 0.6)},{ts(a + SEG - 0.1)},Note,,0,0,0,,{{\\fad(300,200)}}{note}\n"
ass += f"Dialogue: 0,{ts(total - OUTRO + 0.2)},{ts(total)},Card,,0,0,0,,{{\\pos(540,820)\\fad(400,0)}}Average 8.5 / 10\n"
ass += f"Dialogue: 0,{ts(total - OUTRO + 0.5)},{ts(total)},CardSub,,0,0,0,,{{\\pos(540,1000)\\fad(400,0)}}Every seat 8 or higher. Next: real people, on real phones.\n"
(rec / "review.ass").write_text(ass)

# Footage: one clip per seat, phone at 1060 px tall above the quote
PH = 1060
pw = round(780 * PH / 1688 / 2) * 2
x = (1080 - pw) // 2
parts, inputs = [], []
for i, (*_, start) in enumerate(SEATS):
    inputs += ["-ss", f"{start}", "-t", f"{SEG}", "-i", str(rec / "raw.mp4")]
    parts.append(f"[{i}:v]fps=30,scale={pw}:{PH}:flags=lanczos,setsar=1,fade=t=in:st=0:d=0.3,fade=t=out:st={SEG - 0.3}:d=0.3[c{i}]")
n = len(SEATS)
filt = ";".join(parts)
filt += f";color=c=0x1C211C:s={pw}x{PH}:r=30:d={INTRO}[pre];color=c=0x1C211C:s={pw}x{PH}:r=30:d={OUTRO}[post]"
filt += ";[pre]" + "".join(f"[c{i}]" for i in range(n)) + f"[post]concat=n={n + 2}:v=1:a=0[ph]"
filt += f";color=c=0x1C211C:s=1080x1920:r=30:d={total}[bg];[bg][ph]overlay=x={x}:y=70:shortest=1,"
filt += f"ass={rec / 'review.ass'}:fontsdir={fonts},format=yuv420p[v]"
# Soft bed: the layer-under-music stretch of the walkthrough soundtrack, 10 dB down
inputs += ["-ss", "35", "-t", f"{total}", "-i", str(rec / "soundtrack.wav")]
filt += f";[{n}:a]volume=-10dB,afade=t=in:d=1.5,afade=t=out:st={total - 2}:d=2[a]"
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex", filt,
                "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "20", "-preset", "slow",
                "-c:a", "aac", "-b:a", "160k", "-t", f"{total}", "-movflags", "+faststart", str(out)], check=True)
print(out, f"{total:.1f}s")
