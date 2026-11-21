from __future__ import annotations

from typing import Any, Dict

# A4 landscape in PostScript points (1pt = 1/72in). Use pt everywhere for PDF fidelity.
CERTIFICATE_WIDTH = 842
CERTIFICATE_HEIGHT = 595
CANVAS_WIDTH = CERTIFICATE_WIDTH
CANVAS_HEIGHT = CERTIFICATE_HEIGHT

NAVY = "#202838"
BROWN = "#913E03"
BLUE = "#004AAD"

# Absolute layout (pt from page top-left)
LAYOUT_PT: Dict[str, Any] = {
    "page": {"width": CERTIFICATE_WIDTH, "height": CERTIFICATE_HEIGHT},
    "topBar": {"x": 105.3, "y": 0, "width": 62.6, "height": 262.1},
    "bottomBar": {"x": 105.3, "y": 489.7, "width": 62.6, "height": 105.8},
    "medal": {"x": 59.6, "y": 111.6, "width": 153.7, "height": 223.6},
    "logo": {"x": 706.4, "y": 61.3, "width": 112.6, "height": 101.3},
    "signature": {"x": 676.5, "y": 475.8, "width": 117.7, "height": 66.0},
    "skillIndia": {"x": 413.7, "y": 559.2, "width": 78.0, "height": 22.5},
    # Square box (keeps the seal circular). Bottom clears the page edge
    # (y + height = 591 < 595) so the circle is no longer clipped.
    "msme": {"x": 515.0, "y": 535.0, "width": 56.0, "height": 56.0},
    "titleCertificate": {"x": 284.9, "y": 59.1, "fontSize": 70},
    "titleOfCompletion": {"x": 284.9, "y": 143.1, "fontSize": 30},
    "sidhId": {"centerX": 766.0, "y": 164.8, "fontSize": 11.4},
    "awardedTo": {"x": 250.8, "y": 260.8, "fontSize": 17},
    "recipient": {
        "x": 284.9,
        "y": 297.0,
        "maxX": 800.0,
        "fontSize": 39.2,
        "minFontSize": 26.0,
    },
    "body": {
        "x": 240.2,
        "y": 360.6,
        "width": 560.0,
        "fontSize": 17.0,
        "minFontSize": 14.0,
        "lineHeight": 23.3,
        "maxBottom": 490.0,
    },
    "certificationId": {"x": 177.1, "y": 513.0, "fontSize": 13},
    "issuedOn": {"x": 177.1, "y": 538.8, "fontSize": 12},
    "learningDirector": {"centerX": 734.0, "y": 545.2, "fontSize": 18},
    "brandUnderSignature": {"centerX": 739.0, "y": 569.6, "fontSize": 13},
}

SIDH_ID_TEXT = "SIDH ID : TP326874"


def load_layout() -> Dict[str, Any]:
    """Return the absolute pt layout used by the HTML certificate builder."""
    return LAYOUT_PT
