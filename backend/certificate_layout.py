from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

ASSETS_DIR = Path(__file__).resolve().parent / "assets"
LAYOUT_PATH = ASSETS_DIR / "certificate-layout.json"

# A4 landscape CSS pixels used by Playwright PDF output.
CERTIFICATE_WIDTH = 842
CERTIFICATE_HEIGHT = 595
CANVAS_WIDTH = CERTIFICATE_WIDTH
CANVAS_HEIGHT = CERTIFICATE_HEIGHT

# Template geometry (percent of canvas). Decorative layers are baked into the PNG;
# these constants document the reserved regions so overlays stay clear of them.
LEFT_STRIP_X = 11.3
LEFT_STRIP_WIDTH = 7.3
LEFT_STRIP_RIGHT = LEFT_STRIP_X + LEFT_STRIP_WIDTH  # ~18.6

HEADER_X = 33.6
HEADER_Y = 8.8
HEADER_WIDTH = 44.0
HEADER_HEIGHT = 18.0

LOGO_X = 82.0
LOGO_Y = 6.5
LOGO_WIDTH = 15.0
LOGO_HEIGHT = 22.0

SEAL_X = 6.0
SEAL_Y = 16.0
SEAL_WIDTH = 18.0
SEAL_HEIGHT = 32.0

# Dynamic content column: right of the seal, left of the logo/signature.
CONTENT_X = 28.5
CONTENT_WIDTH = 58.0
CONTENT_RIGHT = CONTENT_X + CONTENT_WIDTH  # ~86.5
NAME_X = 22.0
NAME_MAX_WIDTH = 62.0
NAME_MAX_FONT = 42
NAME_MIN_FONT = 26
DESCRIPTION_X = CONTENT_X
DESCRIPTION_Y = 61.0
DESCRIPTION_MAX_WIDTH = CONTENT_WIDTH
DESCRIPTION_MAX_FONT = 14
DESCRIPTION_MIN_FONT = 11

INTRO_X = CONTENT_X
INTRO_Y = 41.8

CERTIFICATION_INFO_X = 20.8
CERTIFICATION_INFO_Y = 86.6
CERTIFICATION_INFO_WIDTH = 28.5

BOTTOM_LOGOS_X = 50.5
BOTTOM_LOGOS_Y = 88.5

SIGNATURE_X = 79.0
SIGNATURE_Y = 78.5

DEFAULT_LAYOUT: Dict[str, Any] = {
    "canvas": {"width": CERTIFICATE_WIDTH, "height": CERTIFICATE_HEIGHT},
    "regions": {
        "leftStrip": {"x": LEFT_STRIP_X, "y": 0, "width": LEFT_STRIP_WIDTH, "height": 100},
        "header": {"x": HEADER_X, "y": HEADER_Y, "width": HEADER_WIDTH, "height": HEADER_HEIGHT},
        "logo": {"x": LOGO_X, "y": LOGO_Y, "width": LOGO_WIDTH, "height": LOGO_HEIGHT},
        "seal": {"x": SEAL_X, "y": SEAL_Y, "width": SEAL_WIDTH, "height": SEAL_HEIGHT},
        "intro": {"x": INTRO_X, "y": INTRO_Y, "width": CONTENT_WIDTH, "height": 6.5},
        "recipient": {"x": NAME_X, "y": 48.6, "width": NAME_MAX_WIDTH, "height": 9.2},
        "body": {"x": DESCRIPTION_X, "y": DESCRIPTION_Y, "width": DESCRIPTION_MAX_WIDTH, "height": 22.0},
        "credential": {"x": CERTIFICATION_INFO_X, "y": CERTIFICATION_INFO_Y, "width": CERTIFICATION_INFO_WIDTH, "height": 4.4},
        "issuedDate": {"x": CERTIFICATION_INFO_X, "y": 91.4, "width": CERTIFICATION_INFO_WIDTH, "height": 4.4},
        "bottomLogos": {"x": BOTTOM_LOGOS_X, "y": BOTTOM_LOGOS_Y, "width": 22.0, "height": 10.0},
        "signature": {"x": SIGNATURE_X, "y": SIGNATURE_Y, "width": 17.0, "height": 18.0},
    },
    "elements": {
        "intro": {
            "x": INTRO_X, "y": INTRO_Y, "width": CONTENT_WIDTH, "height": 6.5,
            "fontFamily": "Georgia", "fontSize": 16, "fontWeight": "400",
            "fontStyle": "italic", "textAlign": "left", "verticalAlign": "center",
            "color": "#1A2744", "lineHeight": 1.25, "display": "flex",
        },
        "recipient": {
            "x": NAME_X, "y": 48.6, "width": NAME_MAX_WIDTH, "height": 9.2,
            "fontFamily": "Oswald", "fontSize": NAME_MAX_FONT, "fontWeight": "700",
            "fontStyle": "normal", "textAlign": "center", "verticalAlign": "center",
            "color": "#924E15", "lineHeight": 1.05, "letterSpacing": "0.04em",
            "display": "flex", "whiteSpace": "nowrap",
            "minFontSize": NAME_MIN_FONT, "maxFontSize": NAME_MAX_FONT, "fit": "name",
        },
        "body": {
            "x": DESCRIPTION_X, "y": DESCRIPTION_Y, "width": DESCRIPTION_MAX_WIDTH, "height": 22.0,
            "fontFamily": "Georgia", "fontSize": DESCRIPTION_MAX_FONT, "fontWeight": "400",
            "fontStyle": "normal", "textAlign": "left", "verticalAlign": "top",
            "color": "#222222", "lineHeight": 1.52, "display": "block",
            "minFontSize": DESCRIPTION_MIN_FONT, "maxFontSize": DESCRIPTION_MAX_FONT, "fit": "body",
        },
        "credential": {
            "x": CERTIFICATION_INFO_X, "y": CERTIFICATION_INFO_Y, "width": CERTIFICATION_INFO_WIDTH, "height": 4.4,
            "fontFamily": "Montserrat", "fontSize": 11, "fontWeight": "600",
            "fontStyle": "normal", "textAlign": "left", "verticalAlign": "center",
            "color": "#4A9AD4", "lineHeight": 1.2, "display": "flex", "whiteSpace": "nowrap",
        },
        "issuedDate": {
            "x": CERTIFICATION_INFO_X, "y": 91.4, "width": CERTIFICATION_INFO_WIDTH, "height": 4.4,
            "fontFamily": "Montserrat", "fontSize": 11, "fontWeight": "600",
            "fontStyle": "normal", "textAlign": "left", "verticalAlign": "center",
            "color": "#4A9AD4", "lineHeight": 1.2, "display": "flex", "whiteSpace": "nowrap",
        },
    },
}


def load_layout() -> Dict[str, Any]:
    if LAYOUT_PATH.exists():
        try:
            data = json.loads(LAYOUT_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data.get("elements"):
                return data
        except (OSError, json.JSONDecodeError):
            pass
    return DEFAULT_LAYOUT


def box_css(element: Dict[str, Any]) -> str:
    align = (element.get("textAlign") or "center").lower()
    valign = (element.get("verticalAlign") or "center").lower()
    justify = {"left": "flex-start", "right": "flex-end", "center": "center"}.get(align, "center")
    items = {"top": "flex-start", "bottom": "flex-end", "center": "center"}.get(valign, "center")
    weight = element.get("fontWeight") or "400"
    style = element.get("fontStyle") or "normal"
    family = element.get("fontFamily") or "Georgia"
    size = element.get("fontSize") or 14
    color = element.get("color") or "#1A1A1A"
    line_height = element.get("lineHeight") or 1.4
    x = element.get("x") or 0
    y = element.get("y") or 0
    width = element.get("width") or 100
    height = element.get("height") or 10
    display = (element.get("display") or "flex").lower()
    white_space = element.get("whiteSpace") or "normal"
    generic = "sans-serif" if family.lower() in {"oswald", "montserrat"} else "serif"
    extra = ""
    if element.get("letterSpacing"):
        extra += f"letter-spacing:{element['letterSpacing']};"
    extra += f"white-space:{white_space};"
    if display == "block":
        display_css = "display:block;"
    else:
        display_css = (
            f"display:flex;align-items:{items};justify-content:{justify};"
        )
    return (
        f"position:absolute;left:{x}%;top:{y}%;width:{width}%;height:{height}%;"
        f"{display_css}"
        f"font-family:'{family}',{generic};font-size:{size}px;font-weight:{weight};"
        f"font-style:{style};color:{color};line-height:{line_height};"
        f"text-align:{align};overflow:hidden;{extra}"
    )
