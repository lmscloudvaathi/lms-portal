"""End-to-end certificate workflow + course-variation generation check."""
from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from certificate_copy import (
    build_course_body,
    duration_hours_from_minutes,
    format_recipient_name,
    resolve_subject_area,
)
from certificate_course_codes import build_certificate_prefix, resolve_course_certificate_code
from certificate_id import compact_prefix, format_certificate_id
from pdf_certificate import close_shared_browser, generate_certificate_pdf_with_browser
from template_assets import resolve_certificate_asset
import models

OUT = ROOT / "generated" / "course-variants"
OUT.mkdir(parents=True, exist_ok=True)

COURSES = [
    {
        "title": "Complete Python Bootcamp",
        "category": "programming",
        "language": "python",
        "minutes": 480,
        "subject": "Python",
        "name": "ANANYA R",
    },
    {
        "title": "Azure Boot Camp",
        "category": "cloud-devops",
        "language": "other",
        "minutes": 1800,
        "subject": "Azure Cloud",
        "name": "RUBESH P",
    },
    {
        "title": "MS Excel for Business Analytics",
        "category": "business",
        "language": "other",
        "minutes": 900,
        "subject": "Business Analytics",
        "name": "PRIYA S",
    },
    {
        "title": "SQL Mastery",
        "category": "data-science",
        "language": "sql",
        "minutes": 600,
        "subject": "SQL",
        "name": "KARTHIK M",
    },
    {
        "title": "React Frontend Development",
        "category": "web-development",
        "language": "javascript",
        "minutes": 1200,
        "subject": "Web Development",
        "name": "DIVYA K",
    },
]


async def main() -> int:
    report = {"assets": {}, "variants": [], "checks": []}

    def check(name: str, ok: bool, detail: str = "") -> None:
        report["checks"].append({"name": name, "ok": ok, "detail": detail})
        mark = "PASS" if ok else "FAIL"
        print(f"[{mark}] {name}" + (f" — {detail}" if detail else ""))

    # 1) Assets present
    for key in ("medal", "logo", "signature", "skillIndia", "msme"):
        try:
            path = resolve_certificate_asset(key)
            report["assets"][key] = str(path)
            check(f"Asset {key}", path.exists() and path.stat().st_size > 1000, str(path))
        except Exception as exc:
            check(f"Asset {key}", False, str(exc))

    # 2) Course variants: what changes + generate PDF/PNG
    print("\n=== COURSE VARIATION CERTIFICATES ===")
    try:
        for i, spec in enumerate(COURSES, start=1):
            course = models.Course(
                id=i,
                title=spec["title"],
                category=spec["category"],
                language=spec["language"],
                course_type="standard",
            )
            code = resolve_course_certificate_code(course)
            prefix = compact_prefix(build_certificate_prefix(course))
            hours = duration_hours_from_minutes(spec["minutes"])
            subject = resolve_subject_area(
                subject_area=spec["subject"],
                program_name=spec["title"],
                category=spec["category"],
                language=spec["language"],
            )
            cert_id = format_certificate_id(prefix, 100 + i)
            body = build_course_body(
                program_name=spec["title"],
                duration_hours=hours,
                subject_area=subject,
            )
            recipient = format_recipient_name(spec["name"])
            stem = f"{code}-{cert_id}"
            pdf = OUT / f"{stem}.pdf"
            png = OUT / f"{stem}.png"
            path = await generate_certificate_pdf_with_browser(
                recipient_name=recipient,
                program_name=spec["title"],
                certificate_id=cert_id,
                issued_at=datetime(2025, 7, 15),
                duration_hours=hours,
                subject_area=subject,
                body_text=body,
                output_path=pdf,
                also_png=png,
            )
            size = path.stat().st_size
            pages_ok = size > 50_000 and size < 500_000
            row = {
                "course": spec["title"],
                "code": code,
                "certificate_id": cert_id,
                "program_name": spec["title"],
                "duration_hours": hours,
                "subject_area": subject,
                "recipient": recipient,
                "body": body,
                "pdf": str(path),
                "png": str(png),
                "bytes": size,
            }
            report["variants"].append(row)
            check(
                f"Generate {code}",
                pages_ok and png.exists(),
                f"id={cert_id} hours={hours} subject={subject} bytes={size}",
            )
            print(f"  Body: {body}")
    finally:
        await close_shared_browser()

    # 3) Health endpoint (if server up)
    print("\n=== API HEALTH ===")
    try:
        import urllib.request

        with urllib.request.urlopen("http://127.0.0.1:8000/api/v1/certificate/health", timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            check("GET /certificate/health", resp.status == 200, json.dumps(payload)[:300])
    except Exception as exc:
        check("GET /certificate/health", False, str(exc))

    out_json = OUT / "report.json"
    out_json.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nReport: {out_json}")

    failed = sum(1 for c in report["checks"] if not c["ok"])
    print(f"\nResult: {len(report['checks']) - failed}/{len(report['checks'])} passed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
