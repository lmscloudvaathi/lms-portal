from __future__ import annotations

import base64
import html
from datetime import datetime
from pathlib import Path
from typing import Optional

from certificate_copy import (
    build_course_body,
    clean_text,
    format_issued_month_year,
    format_recipient_name,
    normalize_program_name,
    resolve_subject_area,
)
from certificate_layout import (
    BLUE,
    BROWN,
    CANVAS_HEIGHT,
    CANVAS_WIDTH,
    LAYOUT_PT,
    NAVY,
    SIDH_ID_TEXT,
)
from template_assets import certificate_asset_data_uri

FONTS_DIR = Path(__file__).resolve().parent / "assets" / "fonts"


def _font_face(family: str, filename: str, weight: int = 400, style: str = "normal") -> str:
    path = FONTS_DIR / filename
    if not path.exists():
        return ""
    raw = path.read_bytes()
    encoded = base64.b64encode(raw).decode("ascii")
    suffix = path.suffix.lower()
    if suffix == ".otf":
        fmt = "opentype"
        mime = "font/otf"
    elif suffix == ".woff":
        fmt = "woff"
        mime = "font/woff"
    elif suffix == ".woff2":
        fmt = "woff2"
        mime = "font/woff2"
    else:
        fmt = "truetype"
        mime = "font/ttf"
    return (
        f"@font-face {{ font-family: '{family}'; src: url('data:{mime};base64,{encoded}') format('{fmt}'); "
        f"font-weight: {weight}; font-style: {style}; font-display: block; }}"
    )


def _embedded_font_css() -> str:
    # Prefer a real Norwester file if operators drop one into assets/fonts.
    faces = [
        _font_face("Norwester", "Norwester.otf", 400),
        _font_face("Norwester", "Norwester.ttf", 400),
        _font_face("Norwester", "norwester.otf", 400),
        _font_face("Norwester", "norwester.ttf", 400),
        # Closest free condensed display stand-ins when Norwester is unavailable.
        # Anton tracks closer to Norwester's width than ultra-condensed Staatliches.
        _font_face("Norwester", "Anton-Regular.ttf", 400),
        _font_face("Norwester", "Staatliches-Regular.ttf", 400),
        _font_face("Norwester", "Oswald-Bold.ttf", 700),
        _font_face("Source Serif 4", "SourceSerif4-Regular.ttf", 400),
    ]
    return "\n".join(filter(None, faces))


FIT_SCRIPT = """
function fitCertificateText() {
  var nameEl = document.getElementById('recipient-name');
  if (nameEl) {
    var min = parseFloat(nameEl.getAttribute('data-min-size') || '26');
    var max = parseFloat(nameEl.getAttribute('data-max-size') || '39.2');
    var maxRight = parseFloat(nameEl.getAttribute('data-max-right') || '800');
    var left = parseFloat(nameEl.style.left) || 284.9;
    var maxWidth = Math.max(40, maxRight - left);
    nameEl.style.width = maxWidth + 'pt';
    nameEl.style.whiteSpace = 'nowrap';
    nameEl.style.overflow = 'hidden';
    var lo = min, hi = max, best = min;
    while (hi - lo > 0.2) {
      var mid = (lo + hi) / 2;
      nameEl.style.fontSize = mid + 'pt';
      if (nameEl.scrollWidth <= nameEl.clientWidth + 0.5) { best = mid; lo = mid; }
      else { hi = mid; }
    }
    nameEl.style.fontSize = best + 'pt';
    if (nameEl.scrollWidth > nameEl.clientWidth + 0.5 && best <= min + 0.05) {
      nameEl.style.whiteSpace = 'normal';
      nameEl.style.lineHeight = '1.05';
      nameEl.style.height = 'auto';
      nameEl.style.maxHeight = '84pt';
    }
  }

  var bodyEl = document.getElementById('body-copy');
  if (bodyEl) {
    var minB = parseFloat(bodyEl.getAttribute('data-min-size') || '14');
    var maxB = parseFloat(bodyEl.getAttribute('data-max-size') || '17');
    var line = parseFloat(bodyEl.getAttribute('data-line-height') || '23.3');
    var maxBottom = parseFloat(bodyEl.getAttribute('data-max-bottom') || '490');
    var top = parseFloat(bodyEl.style.top) || 360.6;
    var maxHeight = Math.max(40, maxBottom - top);
    bodyEl.style.maxHeight = maxHeight + 'pt';
    var size = maxB;
    var ratio = line / maxB;
    bodyEl.style.fontSize = size + 'pt';
    bodyEl.style.lineHeight = (size * ratio) + 'pt';
    while ((bodyEl.scrollHeight > maxHeight + 1 || bodyEl.getClientRects().length > 0 && false) && size > minB) {
      // shrink while overflowing the footer guard
      if (bodyEl.scrollHeight <= maxHeight + 1) break;
      size -= 0.25;
      bodyEl.style.fontSize = size + 'pt';
      bodyEl.style.lineHeight = (size * ratio) + 'pt';
    }
    // Cap visual lines ~4 by further shrink if needed
    var guard = 0;
    while (bodyEl.scrollHeight > (size * ratio * 4.2) && size > minB && guard < 40) {
      size -= 0.25;
      bodyEl.style.fontSize = size + 'pt';
      bodyEl.style.lineHeight = (size * ratio) + 'pt';
      guard += 1;
    }
  }
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
    **_ignored,
) -> str:
    """
    Build the Cloudvaathi certificate as a single A4-landscape HTML page.

    Dynamic fields: recipientName, programName, durationHours, subjectArea,
    certificateId, issueDate. Everything else is fixed art/copy.
    """
    layout = LAYOUT_PT
    name = html.escape(format_recipient_name(recipient_name, email))
    program = normalize_program_name(program_name or course_title)
    cert_id = clean_text(certificate_id or credential_id, fallback="UNKNOWN")
    hours = int(duration_hours) if duration_hours is not None else 30
    subject = resolve_subject_area(
        subject_area=subject_area,
        program_name=program,
        category=category,
        language=language,
    )
    body_plain = clean_text(body_text) or build_course_body(
        program_name=program,
        duration_hours=hours,
        subject_area=subject,
    )
    body_html = html.escape(body_plain, quote=False)
    issued_label = html.escape(f"CERTIFICATE ISSUED ON {format_issued_month_year(issued_at)}")
    id_label = html.escape(f"CERTIFICATION ID : {cert_id}")
    awarded = html.escape("This certificate is awarded to")
    sidh = html.escape(SIDH_ID_TEXT)
    director = html.escape("LEARNING DIRECTOR")
    brand = html.escape("CLOUDVAATHI")

    medal = certificate_asset_data_uri("medal")
    logo = certificate_asset_data_uri("logo")
    signature = certificate_asset_data_uri("signature")
    skill = certificate_asset_data_uri("skillIndia")
    msme = certificate_asset_data_uri("msme")

    tb = layout["topBar"]
    bb = layout["bottomBar"]
    medal_box = layout["medal"]
    logo_box = layout["logo"]
    sig_box = layout["signature"]
    skill_box = layout["skillIndia"]
    msme_box = layout["msme"]
    title = layout["titleCertificate"]
    of_comp = layout["titleOfCompletion"]
    sidh_box = layout["sidhId"]
    awarded_box = layout["awardedTo"]
    recipient = layout["recipient"]
    body = layout["body"]
    cert_box = layout["certificationId"]
    issued_box = layout["issuedOn"]
    director_box = layout["learningDirector"]
    brand_box = layout["brandUnderSignature"]

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    {_embedded_font_css()}
    @page {{ size: {CANVAS_WIDTH}pt {CANVAS_HEIGHT}pt; margin: 0; }}
    html, body {{
      margin: 0;
      padding: 0;
      width: {CANVAS_WIDTH}pt;
      height: {CANVAS_HEIGHT}pt;
      background: #ffffff;
      overflow: hidden;
    }}
    .page {{
      position: relative;
      width: {CANVAS_WIDTH}pt;
      height: {CANVAS_HEIGHT}pt;
      background: #ffffff;
      overflow: hidden;
    }}
    .bar {{
      position: absolute;
      background: {NAVY};
      z-index: 1;
    }}
    .asset {{
      position: absolute;
      object-fit: contain;
      object-position: center center;
      display: block;
      z-index: 2;
    }}
    .asset.medal {{
      z-index: 3;
    }}
    .asset.msme {{
      /* Keep the full government seal inside the page; never crop the circle */
      overflow: visible;
    }}
    .txt {{
      position: absolute;
      margin: 0;
      padding: 0;
      white-space: nowrap;
      box-sizing: border-box;
      z-index: 4;
    }}
    .display {{
      font-family: 'Norwester', 'Anton', 'Oswald', Impact, sans-serif;
      font-weight: 400;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: {NAVY};
      line-height: 0.95;
    }}
    .serif {{
      font-family: 'Source Serif 4', 'Times New Roman', Times, serif;
      font-weight: 400;
      color: {NAVY};
    }}
    #body-copy {{
      white-space: normal;
      overflow: hidden;
      text-align: left;
    }}
  </style>
</head>
<body>
  <div class="page">
    <div class="bar" style="left:{tb['x']}pt;top:{tb['y']}pt;width:{tb['width']}pt;height:{tb['height']}pt;"></div>
    <div class="bar" style="left:{bb['x']}pt;top:{bb['y']}pt;width:{bb['width']}pt;height:{bb['height']}pt;"></div>

    <img class="asset medal" alt="" src="{medal}"
      style="left:{medal_box['x']}pt;top:{medal_box['y']}pt;width:{medal_box['width']}pt;height:{medal_box['height']}pt;" />
    <img class="asset" alt="" src="{logo}"
      style="left:{logo_box['x']}pt;top:{logo_box['y']}pt;width:{logo_box['width']}pt;height:{logo_box['height']}pt;" />
    <img class="asset" alt="" src="{signature}"
      style="left:{sig_box['x']}pt;top:{sig_box['y']}pt;width:{sig_box['width']}pt;height:{sig_box['height']}pt;" />
    <img class="asset" alt="" src="{skill}"
      style="left:{skill_box['x']}pt;top:{skill_box['y']}pt;width:{skill_box['width']}pt;height:{skill_box['height']}pt;" />
    <img class="asset msme" alt="" src="{msme}"
      style="left:{msme_box['x']}pt;top:{msme_box['y']}pt;width:{msme_box['width']}pt;height:{msme_box['height']}pt;" />

    <div class="txt display" style="left:{title['x']}pt;top:{title['y']}pt;font-size:{title['fontSize']}pt;">CERTIFICATE</div>
    <div class="txt display" style="left:{of_comp['x']}pt;top:{of_comp['y']}pt;font-size:{of_comp['fontSize']}pt;">OF COMPLETION</div>

    <div class="txt serif" style="left:{sidh_box['centerX']}pt;top:{sidh_box['y']}pt;transform:translateX(-50%);
      font-size:{sidh_box['fontSize']}pt;color:{BLUE};">{sidh}</div>

    <div class="txt serif" style="left:{awarded_box['x']}pt;top:{awarded_box['y']}pt;font-size:{awarded_box['fontSize']}pt;">{awarded}</div>

    <div id="recipient-name" class="txt display"
      data-min-size="{recipient['minFontSize']}" data-max-size="{recipient['fontSize']}" data-max-right="{recipient['maxX']}"
      style="left:{recipient['x']}pt;top:{recipient['y']}pt;font-size:{recipient['fontSize']}pt;color:{BROWN};">{name}</div>

    <div id="body-copy" class="txt serif"
      data-min-size="{body['minFontSize']}" data-max-size="{body['fontSize']}"
      data-line-height="{body['lineHeight']}" data-max-bottom="{body['maxBottom']}"
      style="left:{body['x']}pt;top:{body['y']}pt;width:{body['width']}pt;font-size:{body['fontSize']}pt;line-height:{body['lineHeight']}pt;">{body_html}</div>

    <div class="txt serif" style="left:{cert_box['x']}pt;top:{cert_box['y']}pt;font-size:{cert_box['fontSize']}pt;color:{BLUE};">{id_label}</div>
    <div class="txt serif" style="left:{issued_box['x']}pt;top:{issued_box['y']}pt;font-size:{issued_box['fontSize']}pt;color:{BLUE};">{issued_label}</div>

    <div class="txt display" style="left:{director_box['centerX']}pt;top:{director_box['y']}pt;transform:translateX(-50%);
      font-size:{director_box['fontSize']}pt;">{director}</div>
    <div class="txt serif" style="left:{brand_box['centerX']}pt;top:{brand_box['y']}pt;transform:translateX(-50%);
      font-size:{brand_box['fontSize']}pt;color:{BROWN};">{brand}</div>
  </div>
  <script>{FIT_SCRIPT}</script>
</body>
</html>"""
