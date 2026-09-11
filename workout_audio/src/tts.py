"""
TTS adapter: turns a line of coaching text into a rendered speech WAV file.

Engines are tried in preference order and the first one that is actually
usable in the current environment wins. This keeps `build.py` from ever
hard-failing just because a paid API key isn't configured.

Preference order:
  1. ElevenLabs   (if ELEVENLABS_API_KEY is set)
  2. OpenAI TTS   (if OPENAI_API_KEY is set)
  3. macOS `say`  (if running on macOS)
  4. espeak-ng    (local, offline, always available as a last resort)
"""
from __future__ import annotations

import hashlib
import os
import platform
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path


class TTSError(RuntimeError):
    pass


@dataclass
class VoiceConfig:
    engine: str = "auto"          # auto | elevenlabs | openai | macos | espeak
    gender: str = "male"
    espeak_voice: str = "mb-us3"  # mbrola US male diphone voice
    espeak_fallback_voice: str = "en-us"
    espeak_speed_wpm: int = 158
    espeak_pitch: int = 40        # 0-99, lower = deeper
    espeak_amplitude: int = 160   # 0-200


def _sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


class TTSAdapter:
    """Synthesizes narration lines to WAV files, caching by text hash."""

    def __init__(self, out_dir: Path, voice: VoiceConfig | None = None):
        self.out_dir = Path(out_dir)
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.voice = voice or VoiceConfig()
        self.engine_used = self._select_engine()

    def _select_engine(self) -> str:
        requested = self.voice.engine
        if requested != "auto":
            return requested

        if os.environ.get("ELEVENLABS_API_KEY"):
            return "elevenlabs"
        if os.environ.get("OPENAI_API_KEY"):
            return "openai"
        if platform.system() == "Darwin" and shutil.which("say"):
            return "macos"
        if shutil.which("espeak-ng"):
            return "espeak"
        raise TTSError(
            "No usable TTS engine found. Install espeak-ng "
            "(apt-get install espeak-ng mbrola mbrola-us3) or set "
            "ELEVENLABS_API_KEY / OPENAI_API_KEY."
        )

    def synth(self, text: str) -> Path:
        """Synthesize `text`, returning the path to a mono/stereo WAV file."""
        text = text.strip()
        if not text:
            raise TTSError("Refusing to synthesize empty narration text.")

        cache_path = self.out_dir / f"{_sha1(text)}.wav"
        if cache_path.exists() and cache_path.stat().st_size > 0:
            return cache_path

        if self.engine_used == "elevenlabs":
            self._synth_elevenlabs(text, cache_path)
        elif self.engine_used == "openai":
            self._synth_openai(text, cache_path)
        elif self.engine_used == "macos":
            self._synth_macos(text, cache_path)
        elif self.engine_used == "espeak":
            self._synth_espeak(text, cache_path)
        else:
            raise TTSError(f"Unknown TTS engine: {self.engine_used}")

        if not cache_path.exists() or cache_path.stat().st_size == 0:
            raise TTSError(f"TTS produced an empty file for text: {text!r}")
        return cache_path

    # -- engines ----------------------------------------------------------

    def _synth_espeak(self, text: str, out_path: Path) -> None:
        raw_path = out_path.with_suffix(".raw.wav")
        cmd = [
            "espeak-ng",
            "-v", self.voice.espeak_voice,
            "-s", str(self.voice.espeak_speed_wpm),
            "-a", str(self.voice.espeak_amplitude),
            "-w", str(raw_path),
            text,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0 or not raw_path.exists():
            # fall back to the plain formant voice if the mbrola voice fails
            cmd = [
                "espeak-ng",
                "-v", self.voice.espeak_fallback_voice,
                "-s", str(self.voice.espeak_speed_wpm),
                "-p", str(self.voice.espeak_pitch),
                "-a", str(self.voice.espeak_amplitude),
                "-w", str(raw_path),
                text,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0 or not raw_path.exists():
                raise TTSError(f"espeak-ng failed: {result.stderr}")

        # Normalize sample rate/format and add a touch of warmth so the
        # diphone/formant voice doesn't sound quite so thin and nasal.
        ff_cmd = [
            "ffmpeg", "-y", "-v", "error",
            "-i", str(raw_path),
            "-af",
            "highpass=f=90,"
            "equalizer=f=180:t=q:w=1:g=2,"
            "equalizer=f=3200:t=q:w=1:g=-2,"
            "acompressor=threshold=-18dB:ratio=2.5:attack=8:release=120,"
            "loudnorm=I=-16:TP=-1.5:LRA=7",
            "-ar", "44100", "-ac", "1",
            str(out_path),
        ]
        result = subprocess.run(ff_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise TTSError(f"ffmpeg post-processing failed: {result.stderr}")
        raw_path.unlink(missing_ok=True)

    def _synth_macos(self, text: str, out_path: Path) -> None:
        aiff_path = out_path.with_suffix(".aiff")
        voice = "Daniel" if self.voice.gender == "male" else "Samantha"
        cmd = ["say", "-v", voice, "-o", str(aiff_path), text]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise TTSError(f"macOS say failed: {result.stderr}")
        ff_cmd = [
            "ffmpeg", "-y", "-v", "error", "-i", str(aiff_path),
            "-af", "loudnorm=I=-16:TP=-1.5:LRA=7",
            "-ar", "44100", "-ac", "1", str(out_path),
        ]
        subprocess.run(ff_cmd, capture_output=True, text=True, check=True)
        aiff_path.unlink(missing_ok=True)

    def _synth_elevenlabs(self, text: str, out_path: Path) -> None:
        try:
            import requests
        except ImportError as e:
            raise TTSError("The `requests` package is required for ElevenLabs TTS.") from e

        api_key = os.environ["ELEVENLABS_API_KEY"]
        voice_id = os.environ.get("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB")  # "Adam"
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        resp = requests.post(
            url,
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
            json={
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {"stability": 0.55, "similarity_boost": 0.75},
            },
            timeout=60,
        )
        if resp.status_code != 200:
            raise TTSError(f"ElevenLabs API error {resp.status_code}: {resp.text[:300]}")
        mp3_path = out_path.with_suffix(".mp3")
        mp3_path.write_bytes(resp.content)
        ff_cmd = [
            "ffmpeg", "-y", "-v", "error", "-i", str(mp3_path),
            "-ar", "44100", "-ac", "1", str(out_path),
        ]
        subprocess.run(ff_cmd, capture_output=True, text=True, check=True)
        mp3_path.unlink(missing_ok=True)

    def _synth_openai(self, text: str, out_path: Path) -> None:
        try:
            from openai import OpenAI
        except ImportError as e:
            raise TTSError("The `openai` package is required for OpenAI TTS.") from e

        client = OpenAI()
        voice = os.environ.get("OPENAI_TTS_VOICE", "onyx")
        mp3_path = out_path.with_suffix(".mp3")
        with client.audio.speech.with_streaming_response.create(
            model="gpt-4o-mini-tts", voice=voice, input=text,
        ) as response:
            response.stream_to_file(mp3_path)
        ff_cmd = [
            "ffmpeg", "-y", "-v", "error", "-i", str(mp3_path),
            "-ar", "44100", "-ac", "1", str(out_path),
        ]
        subprocess.run(ff_cmd, capture_output=True, text=True, check=True)
        mp3_path.unlink(missing_ok=True)
