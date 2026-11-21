"""Generate demo Cloudvaathi certificates for the new layered template."""
from __future__ import annotations

import asyncio
from datetime import datetime
from pathlib import Path

from certificate_copy import build_course_body, format_recipient_name
from certificate_html import build_certificate_html
from pdf_certificate import close_shared_browser, generate_certificate_pdf_with_browser

OUT_DIR = Path(__file__).resolve().parent / "generated"


async def render_one(
    *,
    stem: str,
    recipient_name: str,
    program_name: str,
    duration_hours: int,
    subject_area: str,
    certificate_id: str,
    issued_at: datetime,
) -> dict:
    body = build_course_body(
        program_name=program_name,
        duration_hours=duration_hours,
        subject_area=subject_area,
    )
    recipient = format_recipient_name(recipient_name)
    html_path = OUT_DIR / f"{stem}.html"
    pdf_path = OUT_DIR / f"{stem}.pdf"
    png_path = OUT_DIR / f"{stem}.png"

    html = build_certificate_html(
        recipient_name=recipient,
        program_name=program_name,
        certificate_id=certificate_id,
        issued_at=issued_at,
        duration_hours=duration_hours,
        subject_area=subject_area,
        body_text=body,
    )
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    html_path.write_text(html, encoding="utf-8")

    path = await generate_certificate_pdf_with_browser(
        recipient_name=recipient,
        program_name=program_name,
        certificate_id=certificate_id,
        issued_at=issued_at,
        duration_hours=duration_hours,
        subject_area=subject_area,
        body_text=body,
        output_path=pdf_path,
        also_png=png_path,
    )
    return {
        "stem": stem,
        "pdf": path,
        "png": png_path,
        "html": html_path,
        "bytes": path.stat().st_size,
        "recipient": recipient,
        "program": program_name,
        "id": certificate_id,
        "body": body,
    }


async def main() -> None:
    samples = [
        {
            "stem": "demo-rubesh-azure",
            "recipient_name": "RUBESH P",
            "program_name": "Azure Boot Camp",
            "duration_hours": 30,
            "subject_area": "Azure Cloud",
            "certificate_id": "2507BN298",
            "issued_at": datetime(2025, 7, 15),
        },
        {
            "stem": "demo-long-name",
            "recipient_name": "JAGATHISHWARAN PARTHIBAN SUBRAMANIAN",
            "program_name": "Azure Boot Camp",
            "duration_hours": 30,
            "subject_area": "Azure Cloud",
            "certificate_id": "2507BN299",
            "issued_at": datetime(2025, 7, 15),
        },
        {
            "stem": "demo-long-program",
            "recipient_name": "RUBESH P",
            "program_name": "Complete Python Bootcamp: From Zero to Hero in Data Engineering",
            "duration_hours": 120,
            "subject_area": "Data Engineering",
            "certificate_id": "2507BN300",
            "issued_at": datetime(2025, 7, 15),
        },
    ]

    print("=== CLOUDVAATHI CERTIFICATE SAMPLES ===")
    try:
        for spec in samples:
            result = await render_one(**spec)
            print(
                f"{result['stem']}: {result['recipient']} | {result['program']} | "
                f"{result['id']} | PDF {result['bytes']:,} bytes"
            )
            print(f"  PNG: {result['png']}")
            print(f"  PDF: {result['pdf']}")
            print(f"  Body: {result['body']}")
    finally:
        await close_shared_browser()


if __name__ == "__main__":
    asyncio.run(main())
