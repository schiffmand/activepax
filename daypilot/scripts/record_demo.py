"""
Drives the real, running DayPilot app through a full session in a real
browser and records video -- proof the end-to-end loop actually works,
not a mockup.

Usage: python3 record_demo.py [duration_min] [day_type] [out_dir]
"""
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:8000"


def run(duration_min: int, day_type: str, out_dir: Path, watch_playback_sec: int = 35):
    out_dir.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
            if Path("/opt/pw-browsers/chromium-1194/chrome-linux/chrome").exists() else None,
            args=["--autoplay-policy=no-user-gesture-required"],
        )
        context = browser.new_context(
            viewport={"width": 420, "height": 860},
            record_video_dir=str(out_dir),
            record_video_size={"width": 420, "height": 860},
        )
        page = context.new_page()
        page.on("console", lambda msg: print("[console]", msg.type, msg.text))
        page.on("pageerror", lambda exc: print("[pageerror]", exc))
        page.goto(BASE_URL, wait_until="networkidle")
        time.sleep(1)

        day_label = {"strength": "Strength", "hiit": "HIIT circuit", "mobility": "Light / mobility"}[day_type]
        page.get_by_text(day_label, exact=True).click()
        time.sleep(0.6)

        dur_label = {15: "15 min", 25: "25 min", 40: "40 min"}.get(duration_min, "15 min")
        page.get_by_text(dur_label, exact=True).click()
        time.sleep(0.6)

        page.get_by_text("Dumbbells", exact=True).click()
        time.sleep(0.6)

        page.get_by_text("All clear", exact=True).click()
        time.sleep(0.6)

        page.screenshot(path=str(out_dir / "after_intake.png"))
        print("Waiting for workout to generate (this calls the real backend)...")
        page.wait_for_selector("#screen-review:not([hidden])", timeout=180_000)
        print("Workout generated. Review screen visible.")
        time.sleep(2)

        page.locator("#btn-start").click()
        page.wait_for_selector("#screen-playing:not([hidden])", timeout=10_000)
        print(f"Playback started. Watching for {watch_playback_sec}s...")
        time.sleep(watch_playback_sec)

        page.screenshot(path=str(out_dir / "now_playing.png"))
        context.close()
        browser.close()

        video_files = list(out_dir.glob("*.webm"))
        print("Recorded:", video_files)
        return video_files


if __name__ == "__main__":
    duration_min = int(sys.argv[1]) if len(sys.argv) > 1 else 15
    day_type = sys.argv[2] if len(sys.argv) > 2 else "strength"
    out_dir = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("/tmp/daypilot_demo")
    run(duration_min, day_type, out_dir)
