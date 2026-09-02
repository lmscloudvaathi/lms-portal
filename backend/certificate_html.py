from __future__ import annotations

import base64
import html
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from certificate_copy import default_body_text, format_issued_date, format_recipient_name, markdown_bold_to_html
from certificate_layout import CANVAS_HEIGHT, CANVAS_WIDTH, box_css, load_layout
from template_assets import png_as_data_uri, resolve_template_png

FONTS_DIR = Path(__file__).resolve().parent / "assets" / "fonts"


def _font_face(family: str, filename: str, weight: int = 400, style: str = "normal") -> str:
    path = FONTS_DIR / filename
    if not path.exists():
        return ""
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return (
        f"@font-face {{ font-family: '{family}'; src: url('data:font/ttf;base64,{encoded}') format('truetype'); "
        f"font-weight: {weight}; font-style: {style}; font-display: block; }}"
    )


def _embedded_font_css() -> str:
    return "\n".join(filter(None, [
        _font_face("Oswald", "Oswald-Bold.ttf", 700),
        _font_face("Montserrat", "Montserrat-Regular.ttf", 400),
        _font_face("Montserrat", "Montserrat-SemiBold.ttf", 600),
    ]))


def _fit_attr(element: Dict[str, Any]) -> str:
    kind = element.get("fit")
    if not kind:
        return ""
    min_size = element.get("minFontSize") or 11
    max_size = element.get("maxFontSize") or element.get("fontSize") or 14
    return (
        f' data-fit="{html.escape(str(kind), quote=True)}"'
        f' data-min-size="{min_size}" data-max-size="{max_size}"'
    )


FIT_SCRIPT = """
function fitCertificateText() {
  document.querySelectorAll('[data-fit]').forEach(function (el) {
    var min = parseFloat(el.getAttribute('data-min-size') || '11');
    var max = parseFloat(el.getAttribute('data-max-size') || '14');
    var kind = el.getAttribute('data-fit');
    var size = max;
    el.style.fontSize = size + 'px';
    if (kind === 'name') {
      el.style.whiteSpace = 'nowrap';
      while (el.scrollWidth > el.clientWidth && size > min) {
        size -= 0.5;
        el.style.fontSize = size + 'px';
      }
      return;
    }
    var copy = el.querySelector('.body-copy') || el;
    while (copy.scrollHeight > el.clientHeight && size > min) {
      size -= 0.5;
      el.style.fontSize = size + 'px';
    }
  });
}
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(fitCertificateText);
} else {
  fitCertificateText();
}
"""


def build_certificate_html(
    *,
    recipient_name: str,
    course_title: str,
    credential_id: str,
    issued_at: Optional[datetime] = None,
    body_text: Optional[str] = None,
    email: Optional[str] = None,
    layout: Optional[Dict[str, Any]] = None,
) -> str:
    layout_data = layout or load_layout()
    elements = layout_data.get("elements") or {}
    template_path = resolve_template_png()
    background = png_as_data_uri(template_path)

    name = html.escape(format_recipient_name(recipient_name, email))
    intro = html.escape("Cloudvaathi certifies that")
    body = markdown_bold_to_html(body_text or default_body_text(course_title))
    credential = html.escape(f"CERTIFICATION ID : {credential_id}")
    issued = html.escape(f"CERTIFICATION DATE : {format_issued_date(issued_at)}")

    intro_el = elements.get("intro") or {}
    recipient_el = elements.get("recipient") or {}
    body_el = elements.get("body") or {}
    credential_el = elements.get("credential") or {}
    issued_el = elements.get("issuedDate") or {}

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    {_embedded_font_css()}
    @page {{ size: {CANVAS_WIDTH}px {CANVAS_HEIGHT}px; margin: 0; }}
    html, body {{
      margin: 0; padding: 0; width: {CANVAS_WIDTH}px; height: {CANVAS_HEIGHT}px;
      background: #ffffff; overflow: hidden;
    }}
    .page {{
      position: relative; width: {CANVAS_WIDTH}px; height: {CANVAS_HEIGHT}px;
      overflow: hidden;
    }}
    .bg {{
      position: absolute; inset: 0; width: 100%; height: 100%;
      object-fit: fill; z-index: 0;
    }}
    .el {{ z-index: 1; box-sizing: border-box; padding: 0 6px; }}
    .body-copy {{
      margin: 0;
      width: 100%;
      max-width: 100%;
      display: block;
      white-space: normal;
      overflow-wrap: break-word;
      word-wrap: break-word;
    }}
  </style>
</head>
<body>
  <div class="page">
    <img class="bg" src="{background}" alt="" />
    <div class="el" style="{box_css(intro_el)}">{intro}</div>
    <div class="el"{_fit_attr(recipient_el)} style="{box_css(recipient_el)}">{name}</div>
    <div class="el"{_fit_attr(body_el)} style="{box_css(body_el)}"><p class="body-copy">{body}</p></div>
    <div class="el" style="{box_css(credential_el)}">{credential}</div>
    <div class="el" style="{box_css(issued_el)}">{issued}</div>
  </div>
  <script>{FIT_SCRIPT}</script>
</body>
</html>"""
