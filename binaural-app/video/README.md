# Videos

Rendered files are in `../docs/video/`:

- `tuck-walkthrough.mp4`: 81 s captioned product walkthrough of the prototype (1080x1920, stereo; headphones on).
- `tuck-council-review.mp4`: 47 s cut of quotes from the round-4 persona council. These reviewers are AI personas, not real users, and the video says so.

Rebuild (needs the built prototype, ffmpeg with libass, numpy, and the Literata / Atkinson Hyperlegible Next TTFs in a fonts dir):

```bash
node video/record.mjs /tmp/tuck-rec                         # scripted run, 2x frames + events.json
python3 video/build.py /tmp/tuck-rec <fontsDir> docs/video/tuck-walkthrough.mp4
ffmpeg -f concat -safe 0 -i /tmp/tuck-rec/frames.txt -vf "scale=780:1688:force_original_aspect_ratio=decrease,pad=780:1688,fps=30,format=yuv420p" -c:v libx264 /tmp/tuck-rec/raw.mp4
python3 video/review.py /tmp/tuck-rec <fontsDir> docs/video/tuck-council-review.mp4
```

The soundtrack is synthesised to match what the prototype plays at each step (ear-check tones, Focus at 200 / 214 Hz with brown noise 12 dB under the beat, 8 s fade in, 20 s fade out). The "your music" pad is a stand-in, as it is in the prototype.
