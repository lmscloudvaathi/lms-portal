from __future__ import annotations

import base64
from pathlib import Path
from typing import Optional

ASSETS_DIR = Path(__file__).resolve().parent / "assets"
TEMPLATES_DIR = ASSETS_DIR / "templates"
CERTIFICATE_DIR = ASSETS_DIR / "certificate"
PUBLIC_CERTIFICATE_DIR = Path(__file__).resolve().parents[1] / "frontend" / "public" / "certificate"
LEGACY_TEMPLATE = ASSETS_DIR / "certificate-template.png"

CERTIFICATE_ASSET_FILES = {
    "medal": "medal.png",
    "logo": "cloudvaathi-logo.png",
    "signature": "signature.png",
    "skillIndia": "skill-india.png",
    "msme": "msme.png",
}


def resolve_certificate_asset(name: str) -> Path:
    filename = CERTIFICATE_ASSET_FILES.get(name, name)
    for base in (CERTIFICATE_DIR, PUBLIC_CERTIFICATE_DIR):
        candidate = base / filename
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        f"Certificate asset '{filename}' is missing. Expected under {CERTIFICATE_DIR} "
        f"or {PUBLIC_CERTIFICATE_DIR}."
    )


def resolve_template_png(template_id: str = "default") -> Path:
    """
    Legacy full-page template (kept for ReportLab fallback / migration).
    Prefer the layered assets in assets/certificate/ for new certificates.
    """
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


def certificate_asset_data_uri(name: str) -> str:
    return png_as_data_uri(resolve_certificate_asset(name))
