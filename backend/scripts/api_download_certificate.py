"""Issue a cert in the live local DB and download it via the HTTP API."""
from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from urllib import request, parse, error

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import select

import models
from database import AsyncSessionLocal, engine
import certificate_service
from password_utils import get_password_hash

API = "http://127.0.0.1:8000/api/v1"
OUT = ROOT / "generated" / "api-download"
OUT.mkdir(parents=True, exist_ok=True)


async def ensure_demo_data() -> tuple[str, int, str]:
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)

    email = "cert_demo_student@test.local"
    password = "DemoPass123!"
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(models.User).where(models.User.email == email))).scalars().first()
        if not user:
            user = models.User(
                email=email,
                full_name="Demo Student",
                hashed_password=get_password_hash(password),
                role="student",
            )
            db.add(user)
            await db.flush()

        instructor = (await db.execute(select(models.User).where(models.User.role == "instructor"))).scalars().first()
        if not instructor:
            instructor = models.User(
                email="cert_demo_instructor@test.local",
                full_name="Demo Instructor",
                hashed_password=get_password_hash(password),
                role="instructor",
            )
            db.add(instructor)
            await db.flush()

        course = (
            await db.execute(select(models.Course).where(models.Course.title == "Azure Boot Camp Demo"))
        ).scalars().first()
        if not course:
            course = models.Course(
                title="Azure Boot Camp Demo",
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
            lesson = models.ContentItem(
                module_id=module.id, title="Intro", type="video", order=1, duration=1800
            )
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

        # enroll
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

        # complete lesson
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
        cert_id = cert.certificate_id if cert else None
        return email, course.id, cert_id or ""


def http_json(method: str, url: str, data=None, headers=None):
    body = None
    hdrs = dict(headers or {})
    if data is not None:
        if isinstance(data, dict) and hdrs.get("Content-Type") == "application/x-www-form-urlencoded":
            body = parse.urlencode(data).encode()
        else:
            body = json.dumps(data).encode()
            hdrs.setdefault("Content-Type", "application/json")
    req = request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            return resp.status, ctype, raw
    except error.HTTPError as exc:
        return exc.code, exc.headers.get("Content-Type", ""), exc.read()


def main() -> int:
    email, course_id, cert_id = asyncio.run(ensure_demo_data())
    print(f"Demo user={email} course_id={course_id} cert_id={cert_id}")

    status, ctype, raw = http_json(
        "POST",
        f"{API}/login",
        data={"username": email, "password": "DemoPass123!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    print(f"login status={status} ctype={ctype}")
    if status != 200:
        print(raw[:500])
        return 1
    token = json.loads(raw.decode())["access_token"]
    auth = {"Authorization": f"Bearer {token}"}

    status, ctype, raw = http_json("POST", f"{API}/courses/{course_id}/claim-certificate", data={}, headers=auth)
    print(f"claim status={status} body={raw[:400]!r}")

    status, ctype, raw = http_json("GET", f"{API}/generate-pdf/{course_id}", headers=auth)
    print(f"download status={status} ctype={ctype} bytes={len(raw)}")
    if status != 200 or not raw.startswith(b"%PDF"):
        print(raw[:500])
        return 1
    out = OUT / f"course-{course_id}-{cert_id or 'cert'}.pdf"
    out.write_bytes(raw)
    print(f"Saved download: {out} ({out.stat().st_size} bytes)")

    if cert_id:
        status, ctype, raw = http_json("GET", f"{API}/certificates/verify/{cert_id}")
        print(f"verify status={status} body={raw.decode()[:300]}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
