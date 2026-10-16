"""
Coaching-instruction PDF: one exercise per section, strict type hierarchy,
never more than three short cue lines per exercise, generous whitespace.
Built as a "field reference," not a manual -- per the design brief.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))
from schema import WorkoutSpec  # noqa: E402

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

GRAPHITE = HexColor("#17181a")
CHALK = HexColor("#f3efe8")
EMBER = HexColor("#c6531f")
SLATE = HexColor("#4c5a78")
DIM = HexColor("#6b685f")
LINE = HexColor("#ddd6c8")
BG = HexColor("#faf7f2")

MARGIN = 0.85 * inch
PAGE_W, PAGE_H = LETTER


def _wrap(c: canvas.Canvas, text: str, font: str, size: float, max_width: float) -> list[str]:
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if stringWidth(trial, font, size) <= max_width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _draw_header(c: canvas.Canvas, spec: WorkoutSpec, page_label: str) -> None:
    c.setFillColor(BG)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(GRAPHITE)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(MARGIN, PAGE_H - 0.55 * inch, "DAYPILOT")
    c.setFillColor(DIM)
    c.setFont("Helvetica", 9)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 0.55 * inch, page_label)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(MARGIN, PAGE_H - 0.68 * inch, PAGE_W - MARGIN, PAGE_H - 0.68 * inch)


def _cue_row(c: canvas.Canvas, x: float, y: float, glyph: str, label: str, text: str, width: float) -> float:
    c.setFillColor(EMBER)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, glyph)
    c.setFillColor(GRAPHITE)
    c.setFont("Helvetica-Oblique", 10.5)
    lines = _wrap(c, text, "Helvetica-Oblique", 10.5, width - 22)
    ty = y
    for i, ln in enumerate(lines):
        c.drawString(x + 22, ty, ln)
        ty -= 13.5
    return y - (len(lines) * 13.5) - 6


def render_workout_pdf(spec: WorkoutSpec, out_path: Path) -> Path:
    c = canvas.Canvas(str(out_path), pagesize=LETTER)
    content_w = PAGE_W - 2 * MARGIN

    # Cover
    c.setFillColor(GRAPHITE)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(EMBER)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(MARGIN, PAGE_H - 1.3 * inch, "DAYPILOT")
    c.setFillColor(CHALK)
    c.setFont("Helvetica-Bold", 30)
    c.drawString(MARGIN, PAGE_H - 1.9 * inch, spec.title)
    c.setFillColor(HexColor("#a9a69f"))
    c.setFont("Helvetica", 12)
    c.drawString(MARGIN, PAGE_H - 2.25 * inch, f"{spec.duration_min_target} minutes  ·  {spec.day_type.value.title()} day")

    main_blocks = [b for b in spec.blocks if b.round_index not in (0, 99)]
    n_rounds = max((b.round_index for b in main_blocks), default=1)
    unique = []
    seen = set()
    for b in main_blocks:
        if b.exercise_id not in seen:
            unique.append(b)
            seen.add(b.exercise_id)

    ty = PAGE_H - 2.9 * inch
    c.setFillColor(HexColor("#716e68"))
    c.setFont("Helvetica", 9)
    c.drawString(MARGIN, ty, f"{n_rounds} ROUND{'S' if n_rounds != 1 else ''}  ·  {len(unique)} MOVEMENTS")
    ty -= 24
    for b in unique:
        c.setFillColor(CHALK)
        c.setFont("Helvetica", 12)
        c.drawString(MARGIN, ty, b.name)
        ty -= 20
    if spec.warnings:
        ty -= 10
        c.setFillColor(SLATE)
        c.setFont("Helvetica-Oblique", 9)
        for w in spec.warnings[:3]:
            for ln in _wrap(c, w, "Helvetica-Oblique", 9, content_w):
                c.drawString(MARGIN, ty, ln)
                ty -= 12
    c.showPage()

    # One section per unique exercise, written once -- reused across rounds.
    for i, b in enumerate(unique, start=1):
        _draw_header(c, spec, f"{i:02d} / {len(unique):02d}")
        y = PAGE_H - 1.25 * inch

        c.setFillColor(DIM)
        c.setFont("Helvetica", 9)
        c.drawString(MARGIN, y, f"EXERCISE {i}")
        y -= 26

        c.setFillColor(GRAPHITE)
        c.setFont("Helvetica-Bold", 22)
        c.drawString(MARGIN, y, b.name)
        y -= 20

        meta = f"{b.sets} sets × {b.reps}" if b.reps else f"{b.work_sec}s work / {b.rest_sec}s rest"
        c.setFillColor(EMBER)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(MARGIN, y, meta.upper())
        y -= 34

        c.setStrokeColor(LINE)
        c.line(MARGIN, y, PAGE_W - MARGIN, y)
        y -= 28

        rows = [
            ("○", "setup", b.cues.setup),
            ("≈", "breath", b.cues.breath),
            ("◐", "tempo", b.cues.tempo_contract_relax),
            ("⬚", "balance", b.cues.balance_posture),
        ]
        for glyph, _label, text in rows:
            y = _cue_row(c, MARGIN, y, glyph, _label, text, content_w)

        if b.cues.common_fault:
            y -= 10
            c.setFillColor(SLATE)
            c.setFont("Helvetica-Bold", 8.5)
            c.drawString(MARGIN, y, "WATCH FOR")
            y -= 14
            c.setFont("Helvetica", 9.5)
            for ln in _wrap(c, b.cues.common_fault, "Helvetica", 9.5, content_w):
                c.drawString(MARGIN, y, ln)
                y -= 12.5

        c.showPage()

    c.save()
    return out_path
