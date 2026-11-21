"""Write public/certificate/reference-certificate.pdf from the reference PNG."""
from __future__ import annotations

from pathlib import Path

import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
REF_PNG = ROOT / "frontend" / "public" / "certificate" / "reference-certificate.png"
REF_PDF = ROOT / "frontend" / "public" / "certificate" / "reference-certificate.pdf"
TMP = ROOT / "backend" / "generated" / "_ref_tmp.png"


def main() -> None:
    im = Image.open(REF_PNG).convert("RGB")
    im = im.resize((842 * 2, 595 * 2), Image.Resampling.LANCZOS)
    TMP.parent.mkdir(parents=True, exist_ok=True)
    im.save(TMP)
    doc = fitz.open()
    page = doc.new_page(width=842, height=595)
    page.insert_image(page.rect, filename=str(TMP))
    doc.save(REF_PDF)
    doc.close()
    print(REF_PDF, REF_PDF.stat().st_size)


if __name__ == "__main__":
    main()
