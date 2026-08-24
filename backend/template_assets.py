from __future__ import annotations

import base64
from pathlib import Path
from typing import Optional

ASSETS_DIR = Path(__file__).resolve().parent / "assets"
TEMPLATES_DIR = ASSETS_DIR / "templates"
LEGACY_TEMPLATE = ASSETS_DIR / "certificate-template.png"


def resolve_template_png(template_id: str = "default") -> Path:
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    named = TEMPLATES_DIR / f"{template_id}.png"
    if named.exists():
        return named
    if LEGACY_TEMPLATE.exists():
        return LEGACY_TEMPLATE
    raise FileNotFoundError(
        "Certificate template PNG is missing. Export the Canva design as PNG and save it to "
        f"{named} or {LEGACY_TEMPLATE}."
    )


def png_as_data_uri(path: Optional[Path] = None) -> str:
    image_path = path or resolve_template_png()
    raw = image_path.read_bytes()
    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:image/png;base64,{encoded}"
