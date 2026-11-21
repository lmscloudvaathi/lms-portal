"""Full certificate model export: assets, demos, course variants, flow sample, API download."""
from __future__ import annotations

import asyncio
import json
import shutil
import sys
import zipfile
from datetime import datetime
from pathlib import Path
from urllib import error, parse, request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import select

import certificate_service
import models
from certificate_copy import (
    build_course_body,
    duration_hours_from_minutes,
    format_recipient_name,
    resolve_subject_area,
)
from certificate_course_codes import build_certificate_prefix, resolve_course_certificate_code
from certificate_id import compact_prefix, format_certificate_id
from database import AsyncSessionLocal, engine
from password_utils import get_password_hash
from pdf_certificate import close_shared_browser, generate_certificate_pdf_with_browser
from template_assets import resolve_certificate_asset

API = "http://127.0.0.1:8000/api/v1"
EXPORT = ROOT / "generated" / "certificate-export"
EXPORT.mkdir(parents=True, exist_ok=True)

COURSES = [
    {"title": "Complete Python Bootcamp", "category": "programming", "language": "python", "minutes": 480, "subject": "Python", "name": "ANANYA R"},
    {"title": "Azure Boot Camp", "category": "cloud-devops", "language": "other", "minutes": 1800, "subject": "Azure Cloud", "name": "RUBESH P"},
    {"title": "MS Excel for Business Analytics", "category": "business", "language": "other", "minutes": 900, "subject": "Business Analytics", "name": "PRIYA S"},
    {"title": "SQL Mastery", "category": "data-science", "language": "sql", "minutes": 600, "subject": "SQL", "name": "KARTHIK M"},
    {"title": "React Frontend Development", "category": "web-development", "language": "javascript", "minutes": 1200, "subject": "Web Development", "name": "DIVYA K"},
    {"title": "Complete Python Bootcamp: From Zero to Hero in Data Engineering", "category": "programming", "language": "python", "minutes": 7200, "subject": "Data Engineering", "name": "JAGATHISHWARAN PARTHIBAN SUBRAMANIAN"},
]


def check(report: dict, name: str, ok: bool, detail: str = "") -> None:
    report["checks"].append({"name": name, "ok": ok, "detail": detail})
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


def http(method: str, url: str, data=None, headers=None):
    body = None
    hdrs = dict(headers or {})
    if data is not None:
        if hdrs.get("Content-Type") == "application/x-www-form-urlencoded":
            body = parse.urlencode(data).encode()
        else:
            body = json.dumps(data).encode()
            hdrs.setdefault("Content-Type", "application/json")
    req = request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with request.urlopen(req, timeout=90) as resp:
            return resp.status, resp.headers.get("Content-Type", ""), resp.read()
    except error.HTTPError as exc:
        return exc.code, exc.headers.get("Content-Type", ""), exc.read()


async def render_variants(report: dict) -> None:
    out = EXPORT / "variants"
    out.mkdir(parents=True, exist_ok=True)
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
            cert_id = format_certificate_id(prefix, 200 + i)
            body = build_course_body(program_name=spec["title"], duration_hours=hours, subject_area=subject)
            stem = f"{code}-{cert_id}"
            pdf = out / f"{stem}.pdf"
            png = out / f"{stem}.png"
            path = await generate_certificate_pdf_with_browser(
                recipient_name=format_recipient_name(spec["name"]),
                program_name=spec["title"],
                certificate_id=cert_id,
                issued_at=datetime(2025, 7, 15),
                duration_hours=hours,
                subject_area=subject,
                body_text=body,
                output_path=pdf,
                also_png=png,
            )
            ok = path.exists() and path.stat().st_size > 50_000 and png.exists()
            check(report, f"Variant {code}", ok, f"{cert_id} {path.stat().st_size} bytes")
            report["variants"].append({
                "course": spec["title"],
                "code": code,
                "certificate_id": cert_id,
                "hours": hours,
                "subject": subject,
                "pdf": str(path),
                "png": str(png),
                "bytes": path.stat().st_size,
            })
    finally:
        await close_shared_browser()


async def ensure_api_user() -> tuple[str, int, str]:
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)

    email = "cert_export_student@test.local"
    password = "DemoPass123!"
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(models.User).where(models.User.email == email))).scalars().first()
        if not user:
            user = models.User(
                email=email,
                full_name="Export Student",
                hashed_password=get_password_hash(password),
                role="student",
            )
            db.add(user)
            await db.flush()

        instructor = (await db.execute(select(models.User).where(models.User.role == "instructor"))).scalars().first()
        if not instructor:
            instructor = models.User(
                email="cert_export_instructor@test.local",
                full_name="Export Instructor",
                hashed_password=get_password_hash(password),
                role="instructor",
            )
            db.add(instructor)
            await db.flush()

        course = (
            await db.execute(select(models.Course).where(models.Course.title == "Azure Boot Camp Export"))
        ).scalars().first()
        if not course:
            course = models.Course(
                title="Azure Boot Camp Export",
                description="Azure cloud foundations",
                price=0,
                is_published=True,
                instructor_id=instructor.id,
                course_type="standard",
                category="cloud-devops",
                language="other",
            )
            db.add(course)
            await db.flush()
            module = models.Module(title="Module 1", order=1, course_id=course.id)
            db.add(module)
            await db.flush()
            lesson = models.ContentItem(module_id=module.id, title="Intro", type="video", order=1, duration=1800)
            db.add(lesson)
            await db.flush()
        else:
            lesson = (
                await db.execute(
                    select(models.ContentItem)
                    .join(models.Module, models.ContentItem.module_id == models.Module.id)
                    .where(models.Module.course_id == course.id)
                )
            ).scalars().first()

        enr = (
            await db.execute(
                select(models.Enrollment).where(
                    models.Enrollment.user_id == user.id,
                    models.Enrollment.course_id == course.id,
                )
            )
        ).scalars().first()
        if not enr:
            db.add(models.Enrollment(user_id=user.id, course_id=course.id))

        if lesson:
            prog = (
                await db.execute(
                    select(models.LessonProgress).where(
                        models.LessonProgress.user_id == user.id,
                        models.LessonProgress.content_item_id == lesson.id,
                    )
                )
            ).scalars().first()
            if not prog:
                db.add(
                    models.LessonProgress(
                        user_id=user.id,
                        content_item_id=lesson.id,
                        is_completed=True,
                        completed_at=datetime.utcnow(),
                    )
                )

        await db.commit()
        await db.refresh(user)
        await db.refresh(course)
        cert = await certificate_service.issue_certificate_if_eligible(
            db, user, course.id, generate_pdf=True, send_email=False, require_complete=True
        )
        return email, course.id, (cert.certificate_id if cert else "")


def copy_assets(report: dict) -> None:
    assets_dir = EXPORT / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    for key in ("medal", "logo", "signature", "skillIndia", "msme"):
        src = resolve_certificate_asset(key)
        dest = assets_dir / src.name
        shutil.copy2(src, dest)
        check(report, f"Asset {key}", dest.exists() and dest.stat().st_size > 1000, f"{dest.name} {dest.stat().st_size}")


def package_zip(report: dict) -> Path:
    zip_path = ROOT / "generated" / "certificate-model-export.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in EXPORT.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(EXPORT.parent))
    report["zip"] = str(zip_path)
    report["zip_bytes"] = zip_path.stat().st_size
    return zip_path


async def main() -> int:
    report: dict = {"checks": [], "variants": [], "api": {}, "assets": {}}
    print("=== CERTIFICATE MODEL FULL EXPORT ===\n")

    # 1) Assets
    copy_assets(report)

    # 2) Health
    status, ctype, raw = http("GET", f"{API}/certificate/health")
    check(report, "API health", status == 200, raw.decode(errors="ignore")[:300])

    # 3) Variants
    print("\n=== GENERATE VARIANTS ===")
    await render_variants(report)

    # 4) Demo samples
    print("\n=== DEMO SAMPLES ===")
    from generate_sample_certificate import render_one

    demos = EXPORT / "demos"
    demos.mkdir(exist_ok=True)
    try:
        for spec in [
            dict(stem="demo-rubesh-azure", recipient_name="RUBESH P", program_name="Azure Boot Camp", duration_hours=30, subject_area="Azure Cloud", certificate_id="2507BN298", issued_at=datetime(2025, 7, 15)),
            dict(stem="demo-long-name", recipient_name="JAGATHISHWARAN PARTHIBAN SUBRAMANIAN", program_name="Azure Boot Camp", duration_hours=30, subject_area="Azure Cloud", certificate_id="2507BN299", issued_at=datetime(2025, 7, 15)),
            dict(stem="demo-long-program", recipient_name="RUBESH P", program_name="Complete Python Bootcamp: From Zero to Hero in Data Engineering", duration_hours=120, subject_area="Data Engineering", certificate_id="2507BN300", issued_at=datetime(2025, 7, 15)),
        ]:
            # render into demos folder
            result = await render_one(**spec)
            for kind in ("pdf", "png", "html"):
                src = Path(result[kind])
                dest = demos / src.name
                shutil.copy2(src, dest)
            check(report, f"Demo {spec['stem']}", result["bytes"] > 50_000, f"{result['bytes']} bytes")
    finally:
        await close_shared_browser()

    # 5) API login → claim → download → verify
    print("\n=== API DOWNLOAD FLOW ===")
    email, course_id, cert_id = await ensure_api_user()
    status, ctype, raw = http(
        "POST",
        f"{API}/login",
        data={"username": email, "password": "DemoPass123!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    check(report, "API login", status == 200, ctype)
    if status != 200:
        print(raw[:400])
        return 1
    token = json.loads(raw.decode())["access_token"]
    auth = {"Authorization": f"Bearer {token}"}

    status, ctype, raw = http("POST", f"{API}/courses/{course_id}/claim-certificate", data={}, headers=auth)
    check(report, "API claim-certificate", status == 200, raw.decode(errors="ignore")[:220])

    status, ctype, raw = http("GET", f"{API}/generate-pdf/{course_id}", headers=auth)
    api_dir = EXPORT / "api-download"
    api_dir.mkdir(exist_ok=True)
    pdf_ok = status == 200 and raw.startswith(b"%PDF")
    if pdf_ok:
        out = api_dir / f"{cert_id or 'certificate'}.pdf"
        out.write_bytes(raw)
        report["api"]["download"] = str(out)
        report["api"]["bytes"] = len(raw)
    check(report, "API generate-pdf download", pdf_ok, f"{len(raw)} bytes")

    if cert_id:
        status, ctype, raw = http("GET", f"{API}/certificates/verify/{cert_id}")
        check(report, "API verify", status == 200 and b'"valid":true' in raw.replace(b" ", b""), raw.decode(errors="ignore")[:220])
        report["api"]["verify"] = json.loads(raw.decode())

    # 6) Manifest + zip
    manifest = EXPORT / "MANIFEST.json"
    passed = sum(1 for c in report["checks"] if c["ok"])
    total = len(report["checks"])
    report["summary"] = {"passed": passed, "total": total, "ok": passed == total}
    manifest.write_text(json.dumps(report, indent=2), encoding="utf-8")
    zip_path = package_zip(report)
    check(report, "ZIP package", zip_path.exists(), f"{zip_path} ({zip_path.stat().st_size:,} bytes)")
    manifest.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"\n=== SUMMARY {passed}/{total} ===")
    print(f"Export folder: {EXPORT}")
    print(f"ZIP: {zip_path} ({zip_path.stat().st_size:,} bytes)")
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
