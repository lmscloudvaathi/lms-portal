"""ReportLab certificate PDF fallback — works without Playwright/Chromium."""
from __future__ import annotations

import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from certificate_copy import default_body_text, format_issued_date, format_recipient_name
from certificate_layout import CANVAS_HEIGHT, CANVAS_WIDTH, load_layout
from template_assets import resolve_template_png

logger = logging.getLogger(__name__)

ASSETS_DIR = Path(__file__).resolve().parent / "assets"
FONTS_DIR = ASSETS_DIR / "fonts"
GENERATED_DIR = Path(__file__).resolve().parent / "generated"

_FONTS_REGISTERED = False


def _register_fonts() -> None:
    global _FONTS_REGISTERED
    if _FONTS_REGISTERED:
        return
    pairs = [
        ("Oswald-Bold", "Oswald-Bold.ttf"),
        ("Montserrat", "Montserrat-Regular.ttf"),
        ("Montserrat-SemiBold", "Montserrat-SemiBold.ttf"),
        ("GreatVibes", "GreatVibes-Regular.ttf"),
    ]
    for name, filename in pairs:
        path = FONTS_DIR / filename
        if path.exists():
            try:
                pdfmetrics.registerFont(TTFont(name, str(path)))
            except Exception:
                logger.exception("Could not register font %s", filename)
    _FONTS_REGISTERED = True


def _map_font(family: str, weight: str = "400", style: str = "normal") -> str:
    fam = (family or "").lower()
    w = str(weight or "400")
    if fam == "oswald":
        return "Oswald-Bold" if "Oswald-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"
    if fam == "montserrat":
        if w in {"600", "700", "bold"} and "Montserrat-SemiBold" in pdfmetrics.getRegisteredFontNames():
            return "Montserrat-SemiBold"
        if "Montserrat" in pdfmetrics.getRegisteredFontNames():
            return "Montserrat"
        return "Helvetica-Bold" if w in {"600", "700", "bold"} else "Helvetica"
    if style == "italic":
        return "Times-Italic"
    return "Times-Roman"


def _body_plain(text: str) -> str:
    cleaned = re.sub(r"\*\*(.+?)\*\*", lambda m: f"‘{m.group(1).strip()}’", text or "")
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    cleaned = cleaned.replace("&nbsp;", " ").replace("&amp;", "&")
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    return cleaned.strip()


def _fit_font_size(c: canvas.Canvas, text: str, font: str, max_size: float, min_size: float, max_width: float) -> float:
    lo, hi, best = min_size, max_size, min_size
    while hi - lo > 0.25:
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
    course_title: str,
    credential_id: str,
    issued_at: Optional[datetime] = None,
    body_text: Optional[str] = None,
    email: Optional[str] = None,
    output_path: Optional[Path] = None,
) -> Path:
    _register_fonts()
    template = resolve_template_png()
    layout = load_layout()
    elements = layout.get("elements") or {}

    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    dest = output_path or (GENERATED_DIR / f"{credential_id}.pdf")

    width, height = float(CANVAS_WIDTH), float(CANVAS_HEIGHT)
    c = canvas.Canvas(str(dest), pagesize=(width, height))
    c.drawImage(ImageReader(str(template)), 0, 0, width=width, height=height, preserveAspectRatio=False, mask="auto")

    name = format_recipient_name(recipient_name, email)
    intro = "Cloudvaathi certifies that"
    body = _body_plain(body_text or default_body_text(course_title))
    credential = f"CERTIFICATION ID : {credential_id}"
    issued = f"CERTIFICATION DATE : {format_issued_date(issued_at)}"

    def draw_box_text(
        key: str,
        text: str,
        *,
        fit_name: bool = False,
        multiline: bool = False,
    ) -> None:
        el = elements.get(key) or {}
        x_pct = float(el.get("x") or 0)
        y_pct = float(el.get("y") or 0)
        w_pct = float(el.get("width") or 100)
        h_pct = float(el.get("height") or 10)
        x = width * x_pct / 100.0
        box_top = height * (1.0 - y_pct / 100.0)
        box_bottom = height * (1.0 - (y_pct + h_pct) / 100.0)
        box_w = width * w_pct / 100.0
        box_h = box_top - box_bottom

        font = _map_font(str(el.get("fontFamily") or "Georgia"), str(el.get("fontWeight") or "400"), str(el.get("fontStyle") or "normal"))
        color = str(el.get("color") or "#1A1A1A").lstrip("#")
        if len(color) == 6:
            r, g, b = int(color[0:2], 16) / 255, int(color[2:4], 16) / 255, int(color[4:6], 16) / 255
            c.setFillColorRGB(r, g, b)
        else:
            c.setFillColorRGB(0.1, 0.1, 0.1)

        max_size = float(el.get("maxFontSize") or el.get("fontSize") or 14)
        min_size = float(el.get("minFontSize") or 11)
        line_height = float(el.get("lineHeight") or 1.4)
        align = str(el.get("textAlign") or "left").lower()

        if fit_name:
            size = _fit_font_size(c, text, font, max_size, min_size, box_w)
            c.setFont(font, size)
            baseline = box_bottom + (box_h - size) / 2 + size * 0.15
            c.drawString(x, baseline, text)
            return

        if multiline:
            size = max_size
            lines = _wrap_lines(c, text, font, size, box_w)
            while size > min_size and len(lines) * size * line_height > box_h:
                size -= 0.5
                lines = _wrap_lines(c, text, font, size, box_w)
            c.setFont(font, size)
            leading = size * line_height
            cursor_y = box_top - size
            for line in lines:
                if cursor_y < box_bottom:
                    break
                c.drawString(x, cursor_y, line)
                cursor_y -= leading
            return

        size = float(el.get("fontSize") or max_size)
        c.setFont(font, size)
        baseline = box_bottom + (box_h - size) / 2 + size * 0.15
        if align == "right":
            c.drawRightString(x + box_w, baseline, text)
        elif align == "center":
            c.drawCentredString(x + box_w / 2, baseline, text)
        else:
            c.drawString(x, baseline, text)

    draw_box_text("intro", intro)
    draw_box_text("recipient", name, fit_name=True)
    draw_box_text("body", body, multiline=True)
    draw_box_text("credential", credential)
    draw_box_text("issuedDate", issued)

    c.showPage()
    c.save()
    if not dest.exists() or dest.stat().st_size <= 0:
        raise RuntimeError("ReportLab certificate PDF was not written.")
    return dest
