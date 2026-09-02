"""End-to-end certificate auto-generation flow test."""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path

# Use isolated SQLite for this test run.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./_cert_flow_test.db")

from sqlalchemy import select

import models
import certificate_service
from certificate_email import certificate_email_configured
from certificate_id import format_certificate_id, compact_prefix
from certificate_course_codes import build_certificate_prefix, resolve_course_certificate_code
from database import AsyncSessionLocal, engine
from pdf_certificate import close_shared_browser
from template_assets import resolve_template_png


async def setup_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)


async def run_flow_test() -> dict:
    results: dict = {"steps": [], "pass": True}

    def step(name: str, ok: bool, detail: str = "") -> None:
        results["steps"].append({"name": name, "ok": ok, "detail": detail})
        if not ok:
            results["pass"] = False
        mark = "PASS" if ok else "FAIL"
        print(f"[{mark}] {name}" + (f" — {detail}" if detail else ""))

    await setup_db()

    async with AsyncSessionLocal() as db:
        # 1. Create instructor + student + course with 2 lessons
        instructor = models.User(
            email="instructor_flow@test.local",
            full_name="Flow Instructor",
            hashed_password="x",
            role="instructor",
        )
        student = models.User(
            email="student_flow@test.local",
            full_name="GUNASEKARAN K",
            hashed_password="x",
            role="student",
        )
        course = models.Course(
            title="Information Security Boot Camp",
            description="Information security governance, risk management, and incident response.",
            price=0,
            is_published=True,
            instructor_id=1,
            course_type="standard",
            category="programming",
        )
        db.add(instructor)
        db.add(student)
        db.add(course)
        await db.flush()

        module = models.Module(title="Module 1", order=1, course_id=course.id)
        db.add(module)
        await db.flush()

        lesson1 = models.ContentItem(
            module_id=module.id, title="Intro", type="video", order=1, duration=60
        )
        lesson2 = models.ContentItem(
            module_id=module.id, title="Final Assignment", type="assignment", order=2, duration=30
        )
        db.add(lesson1)
        db.add(lesson2)
        await db.commit()
        await db.refresh(student)
        await db.refresh(course)
        await db.refresh(lesson1)
        await db.refresh(lesson2)

        code = resolve_course_certificate_code(course)
        prefix = build_certificate_prefix(course)
        step("Course code resolved", code in {"PYT", "GEN", "WEB", "CLD"}, f"code={code}, prefix={compact_prefix(prefix)}")

        # 2. Complete first lesson — should NOT issue cert yet
        db.add(models.LessonProgress(
            user_id=student.id, content_item_id=lesson1.id, is_completed=True, completed_at=datetime.utcnow()
        ))
        await db.commit()
        cert_partial = await certificate_service.issue_certificate_if_eligible(db, student, course.id)
        step("Partial completion (1/2) — no certificate", cert_partial is None)

        # 3. Complete last lesson (simulates assignment upload auto-issue path)
        db.add(models.LessonProgress(
            user_id=student.id, content_item_id=lesson2.id, is_completed=True, completed_at=datetime.utcnow()
        ))
        await db.commit()
        cert = await certificate_service.issue_after_content_complete(db, student, lesson2.id)
        step("Full completion — certificate auto-issued", cert is not None)

        if not cert:
            return results

        cid = cert.certificate_id or ""
        has_no_hyphens = "-" not in cid
        step("Certificate ID has no hyphens", has_no_hyphens, cid)
        step("Certificate ID starts with CV", cid.upper().startswith("CV"), cid)

        step("PDF status GENERATED", (cert.status or "").upper() == "GENERATED", cert.status or "")
        pdf_path = certificate_service._pdf_path_for(cert)
        step("PDF file exists on disk", pdf_path.exists() and pdf_path.stat().st_size > 0, str(pdf_path))

        email_ok = cert.email_status in ("SENT", "SKIPPED", "FAILED", "PENDING")
        step(
            "Email step handled",
            email_ok,
            f"email_status={cert.email_status}, configured={certificate_email_configured()}",
        )

        verify = await certificate_service.public_certificate_payload(db, cid)
        step("Public verify lookup works", verify is not None and verify.get("valid"), cid)

        results["certificate"] = {
            "id": cid,
            "recipient": cert.recipient_name,
            "course": course.title,
            "pdf": str(pdf_path),
            "verify_url": certificate_service.verify_url(cid),
            "email_status": cert.email_status,
        }

        # 4. Re-trigger should not duplicate
        cert_again = await certificate_service.issue_certificate_if_eligible(db, student, course.id)
        step("Re-issue returns same certificate", cert_again is not None and cert_again.id == cert.id)

    return results


async def generate_visual_sample(output_id: str) -> Path | None:
    from certificate_copy import build_course_body, format_recipient_name
    from certificate_html import build_certificate_html
    from pdf_certificate import generate_certificate_pdf_with_browser

    course = models.Course(
        title="Information Security Boot Camp",
        description="Information security governance, risk management, and incident response.",
        category="programming",
    )
    recipient = format_recipient_name("GUNASEKARAN K", "student@cloudvaathi.in")
    body = build_course_body(
        title=course.title,
        description=course.description,
        duration_minutes=1200,
        category=course.category,
    )
    out_dir = Path(__file__).resolve().parent / "generated"
    out_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = out_dir / f"{output_id}-FLOW-SAMPLE.pdf"

    try:
        await generate_certificate_pdf_with_browser(
            recipient_name=recipient,
            course_title=course.title,
            credential_id=output_id,
            issued_at=datetime.utcnow(),
            body_text=body,
            email="student@cloudvaathi.in",
            output_path=pdf_path,
        )
        return pdf_path
    finally:
        await close_shared_browser()


async def main() -> None:
    print("=== CERTIFICATE AUTO-GENERATE FLOW TEST ===\n")
    print(f"Template: {resolve_template_png()}\n")

    results = await run_flow_test()
    print()

    cert = results.get("certificate") or {}
    sample_id = cert.get("id") or format_certificate_id(build_certificate_prefix(
        models.Course(title="Information Security Boot Camp", category="programming")
    ), 502)

    print("=== GENERATING VISUAL SAMPLE PDF ===")
    sample_path = await generate_visual_sample(sample_id)
    if sample_path:
        print(f"Sample PDF: {sample_path} ({sample_path.stat().st_size:,} bytes)")
    else:
        print("Sample PDF generation failed")

    print("\n=== SUMMARY ===")
    if cert:
        print(f"Certificate ID : {cert.get('id')}")
        print(f"Recipient      : {cert.get('recipient')}")
        print(f"Course         : {cert.get('course')}")
        print(f"Verify URL     : {cert.get('verify_url')}")
        print(f"PDF path       : {cert.get('pdf')}")
        print(f"Email status   : {cert.get('email_status')}")

    passed = sum(1 for s in results["steps"] if s["ok"])
    total = len(results["steps"])
    print(f"\nFlow result: {passed}/{total} checks passed — {'ALL OK' if results['pass'] else 'ISSUES FOUND'}")
    sys.exit(0 if results["pass"] else 1)


if __name__ == "__main__":
    asyncio.run(main())
