"""ReportLab certificate PDF fallback — layered assets, no Playwright/Chromium required."""
from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from certificate_copy import (
    build_course_body,
    clean_text,
    format_issued_month_year,
    format_recipient_name,
    normalize_program_name,
    resolve_subject_area,
)
from certificate_layout import BLUE, BROWN, CANVAS_HEIGHT, CANVAS_WIDTH, LAYOUT_PT, NAVY, SIDH_ID_TEXT
from template_assets import resolve_certificate_asset

logger = logging.getLogger(__name__)

ASSETS_DIR = Path(__file__).resolve().parent / "assets"
FONTS_DIR = ASSETS_DIR / "fonts"
GENERATED_DIR = Path(__file__).resolve().parent / "generated"

_FONTS_REGISTERED = False
DISPLAY_FONT = "Helvetica-Bold"
SERIF_FONT = "Times-Roman"


def _register_fonts() -> None:
    global _FONTS_REGISTERED, DISPLAY_FONT, SERIF_FONT
    if _FONTS_REGISTERED:
        return
    display_candidates = [
        ("Norwester", "Norwester.otf"),
        ("Norwester", "Norwester.ttf"),
        ("Norwester", "Anton-Regular.ttf"),
        ("Norwester", "Staatliches-Regular.ttf"),
        ("Norwester", "Oswald-Bold.ttf"),
    ]
    for name, filename in display_candidates:
        path = FONTS_DIR / filename
        if path.exists():
            try:
                pdfmetrics.registerFont(TTFont(name, str(path)))
                DISPLAY_FONT = name
                break
            except Exception:
                logger.exception("Could not register display font %s", filename)

    serif_path = FONTS_DIR / "SourceSerif4-Regular.ttf"
    if serif_path.exists():
        try:
            pdfmetrics.registerFont(TTFont("SourceSerif4", str(serif_path)))
            SERIF_FONT = "SourceSerif4"
        except Exception:
            logger.exception("Could not register Source Serif 4")
    _FONTS_REGISTERED = True


def _hex(color: str):
    c = color.lstrip("#")
    return tuple(int(c[i : i + 2], 16) / 255 for i in (0, 2, 4))


def _y_top(page_h: float, top: float) -> float:
    """Convert CSS top (from page top) to ReportLab y (from page bottom) for glyph top."""
    return page_h - top


def _fit_font_size(c: canvas.Canvas, text: str, font: str, max_size: float, min_size: float, max_width: float) -> float:
    lo, hi, best = min_size, max_size, min_size
    while hi - lo > 0.2:
        mid = (lo + hi) / 2
        if c.stringWidth(text, font, mid) <= max_width:
            best = mid
            lo = mid
        else:
            hi = mid
    return best


def _wrap_lines(c: canvas.Canvas, text: str, font: str, size: float, max_width: float) -> list[str]:
    words = (text or "").split()
    if not words:
        return []
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        if c.stringWidth(trial, font, size) <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def generate_certificate_pdf_with_reportlab(
    *,
    recipient_name: str,
    program_name: Optional[str] = None,
    course_title: Optional[str] = None,
    certificate_id: Optional[str] = None,
    credential_id: Optional[str] = None,
    issued_at: Optional[datetime] = None,
    duration_hours: Optional[int] = None,
    subject_area: Optional[str] = None,
    body_text: Optional[str] = None,
    email: Optional[str] = None,
    category: Optional[str] = None,
    language: Optional[str] = None,
    output_path: Optional[Path] = None,
) -> Path:
    _register_fonts()
    layout = LAYOUT_PT
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    cert_id = clean_text(certificate_id or credential_id, fallback="UNKNOWN")
    dest = output_path or (GENERATED_DIR / f"{cert_id}.pdf")

    width, height = float(CANVAS_WIDTH), float(CANVAS_HEIGHT)
    c = canvas.Canvas(str(dest), pagesize=(width, height))
    c.setFillColorRGB(1, 1, 1)
    c.rect(0, 0, width, height, fill=1, stroke=0)

    # Navy bars
    c.setFillColorRGB(*_hex(NAVY))
    for key in ("topBar", "bottomBar"):
        box = layout[key]
        c.rect(box["x"], height - box["y"] - box["height"], box["width"], box["height"], fill=1, stroke=0)

    # Images
    for key, asset in (
        ("medal", "medal"),
        ("logo", "logo"),
        ("signature", "signature"),
        ("skillIndia", "skillIndia"),
        ("msme", "msme"),
    ):
        box = layout[key]
        path = resolve_certificate_asset(asset)
        c.drawImage(
            ImageReader(str(path)),
            box["x"],
            height - box["y"] - box["height"],
            width=box["width"],
            height=box["height"],
            mask="auto",
            preserveAspectRatio=True,
            anchor="c",
        )

    name = format_recipient_name(recipient_name, email)
    program = normalize_program_name(program_name or course_title)
    hours = int(duration_hours) if duration_hours is not None else 30
    subject = resolve_subject_area(
        subject_area=subject_area,
        program_name=program,
        category=category,
        language=language,
    )
    body = clean_text(body_text) or build_course_body(
        program_name=program, duration_hours=hours, subject_area=subject
    )

    def draw_left(text: str, *, font: str, size: float, color: str, x: float, top: float) -> None:
        c.setFont(font, size)
        c.setFillColorRGB(*_hex(color))
        c.drawString(x, _y_top(height, top) - size * 0.8, text)

    def draw_centered(text: str, *, font: str, size: float, color: str, center_x: float, top: float) -> None:
        c.setFont(font, size)
        c.setFillColorRGB(*_hex(color))
        c.drawCentredString(center_x, _y_top(height, top) - size * 0.8, text)

    title = layout["titleCertificate"]
    of_comp = layout["titleOfCompletion"]
    draw_left("CERTIFICATE", font=DISPLAY_FONT, size=title["fontSize"], color=NAVY, x=title["x"], top=title["y"])
    draw_left("OF COMPLETION", font=DISPLAY_FONT, size=of_comp["fontSize"], color=NAVY, x=of_comp["x"], top=of_comp["y"])

    sidh = layout["sidhId"]
    draw_centered(SIDH_ID_TEXT, font=SERIF_FONT, size=sidh["fontSize"], color=BLUE, center_x=sidh["centerX"], top=sidh["y"])

    awarded = layout["awardedTo"]
    draw_left(
        "This certificate is awarded to",
        font=SERIF_FONT,
        size=awarded["fontSize"],
        color=NAVY,
        x=awarded["x"],
        top=awarded["y"],
    )

    recipient = layout["recipient"]
    max_w = recipient["maxX"] - recipient["x"]
    name_size = _fit_font_size(c, name, DISPLAY_FONT, recipient["fontSize"], recipient["minFontSize"], max_w)
    draw_left(name, font=DISPLAY_FONT, size=name_size, color=BROWN, x=recipient["x"], top=recipient["y"])

    body_box = layout["body"]
    size = float(body_box["fontSize"])
    min_size = float(body_box["minFontSize"])
    line = float(body_box["lineHeight"])
    ratio = line / float(body_box["fontSize"])
    lines = _wrap_lines(c, body, SERIF_FONT, size, body_box["width"])
    while (len(lines) > 4 or body_box["y"] + len(lines) * size * ratio > body_box["maxBottom"]) and size > min_size:
        size -= 0.25
        lines = _wrap_lines(c, body, SERIF_FONT, size, body_box["width"])
    c.setFont(SERIF_FONT, size)
    c.setFillColorRGB(*_hex(NAVY))
    y = _y_top(height, body_box["y"]) - size * 0.8
    for line_text in lines[:4]:
        c.drawString(body_box["x"], y, line_text)
        y -= size * ratio

    cert_box = layout["certificationId"]
    issued_box = layout["issuedOn"]
    draw_left(
        f"CERTIFICATION ID : {cert_id}",
        font=SERIF_FONT,
        size=cert_box["fontSize"],
        color=BLUE,
        x=cert_box["x"],
        top=cert_box["y"],
    )
    draw_left(
        f"CERTIFICATE ISSUED ON {format_issued_month_year(issued_at)}",
        font=SERIF_FONT,
        size=issued_box["fontSize"],
        color=BLUE,
        x=issued_box["x"],
        top=issued_box["y"],
    )

    director = layout["learningDirector"]
    brand = layout["brandUnderSignature"]
    draw_centered(
        "LEARNING DIRECTOR",
        font=DISPLAY_FONT,
        size=director["fontSize"],
        color=NAVY,
        center_x=director["centerX"],
        top=director["y"],
    )
    draw_centered(
        "CLOUDVAATHI",
        font=SERIF_FONT,
        size=brand["fontSize"],
        color=BROWN,
        center_x=brand["centerX"],
        top=brand["y"],
    )

    c.showPage()
    c.save()
    return dest
