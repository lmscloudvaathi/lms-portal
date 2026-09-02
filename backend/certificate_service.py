from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from certificate_copy import build_course_body, default_body_text, format_recipient_name
from certificate_email import send_certificate_email, verify_url
from certificate_id import allocate_credential_id
from pdf_certificate import GENERATED_DIR, generate_certificate_pdf_with_browser

logger = logging.getLogger(__name__)


def serialize_certificate(cert: models.UserCertificate, course_title: Optional[str] = None) -> Dict[str, Any]:
    return {
        "credential_id": cert.certificate_id,
        "recipient_name": cert.recipient_name,
        "course_id": cert.course_id,
        "course_title": course_title,
        "issued_at": cert.issued_at.isoformat() if cert.issued_at else None,
        "status": cert.status or ("GENERATED" if cert.pdf_url else "PENDING"),
        "email_status": cert.email_status,
        "verify_url": verify_url(cert.certificate_id) if cert.certificate_id else None,
        "has_pdf": bool(cert.pdf_url),
    }


async def course_is_complete(db: AsyncSession, user_id: int, course: models.Course) -> bool:
    if (course.course_type or "") == "coding":
        total_res = await db.execute(
            select(func.count()).select_from(models.CourseChallenge).where(
                models.CourseChallenge.course_id == course.id
            )
        )
        total = int(total_res.scalar() or 0)
        if total <= 0:
            return False
        solved_res = await db.execute(
            select(func.count()).select_from(models.ChallengeProgress).where(
                models.ChallengeProgress.user_id == user_id,
                models.ChallengeProgress.is_solved == True,  # noqa: E712
                models.ChallengeProgress.challenge_id.in_(
                    select(models.CourseChallenge.id).where(models.CourseChallenge.course_id == course.id)
                ),
            )
        )
        return int(solved_res.scalar() or 0) == total

    items_res = await db.execute(
        select(models.ContentItem.id)
        .join(models.Module, models.ContentItem.module_id == models.Module.id)
        .where(models.Module.course_id == course.id)
    )
    item_ids = items_res.scalars().all()
    if not item_ids:
        return False
    progress_res = await db.execute(
        select(func.count()).select_from(models.LessonProgress).where(
            models.LessonProgress.user_id == user_id,
            models.LessonProgress.is_completed == True,  # noqa: E712
            models.LessonProgress.content_item_id.in_(item_ids),
        )
    )
    return int(progress_res.scalar() or 0) == len(item_ids)


async def course_duration_minutes(db: AsyncSession, course: models.Course) -> int:
    result = await db.execute(
        select(func.coalesce(func.sum(models.ContentItem.duration), 0))
        .join(models.Module, models.ContentItem.module_id == models.Module.id)
        .where(models.Module.course_id == course.id)
    )
    return int(result.scalar() or 0)


async def course_completed_at(db: AsyncSession, user_id: int, course: models.Course) -> datetime:
    if (course.course_type or "") == "coding":
        result = await db.execute(
            select(func.max(models.ChallengeProgress.solved_at)).where(
                models.ChallengeProgress.user_id == user_id,
                models.ChallengeProgress.is_solved == True,  # noqa: E712
                models.ChallengeProgress.challenge_id.in_(
                    select(models.CourseChallenge.id).where(models.CourseChallenge.course_id == course.id)
                ),
            )
        )
    else:
        item_ids = select(models.ContentItem.id).join(
            models.Module, models.ContentItem.module_id == models.Module.id
        ).where(models.Module.course_id == course.id)
        result = await db.execute(
            select(func.max(models.LessonProgress.completed_at)).where(
                models.LessonProgress.user_id == user_id,
                models.LessonProgress.is_completed == True,  # noqa: E712
                models.LessonProgress.content_item_id.in_(item_ids),
            )
        )
    stamp = result.scalar()
    return stamp or datetime.utcnow()


def compose_course_body(course: models.Course, duration_minutes: int = 0) -> str:
    return build_course_body(
        title=course.title or "this programme",
        description=course.description,
        duration_minutes=duration_minutes,
        category=getattr(course, "category", None),
        language=getattr(course, "language", None),
    )


async def get_user_certificate(
    db: AsyncSession, user_id: int, course_id: int
) -> Optional[models.UserCertificate]:
    result = await db.execute(
        select(models.UserCertificate).where(
            models.UserCertificate.user_id == user_id,
            models.UserCertificate.course_id == course_id,
        )
    )
    return result.scalars().first()


def _pdf_path_for(cert: models.UserCertificate) -> Path:
    if cert.pdf_url:
        stored = Path(cert.pdf_url)
        if stored.is_absolute():
            return stored
        candidate = Path(__file__).resolve().parent / stored
        if candidate.exists():
            return candidate
    return GENERATED_DIR / f"{cert.certificate_id}.pdf"


def _pdf_is_ready(path: Path) -> bool:
    try:
        return path.exists() and path.stat().st_size > 0
    except OSError:
        return False


def _needs_pdf_generation(cert: models.UserCertificate, pdf_path: Path, *, created: bool, refresh_pdf: bool) -> bool:
    if created or refresh_pdf:
        return True
    if not _pdf_is_ready(pdf_path):
        return True
    return (cert.status or "").upper() == "FAILED"


def _needs_email_send(cert: models.UserCertificate, user: models.User, *, send_email: bool) -> bool:
    if not send_email or not user.email:
        return False
    return (cert.email_status or "PENDING") not in ("SENT", "SKIPPED")


async def render_certificate_pdf(
    db: AsyncSession,
    cert: models.UserCertificate,
    user: models.User,
    course: models.Course,
) -> Path:
    dest = _pdf_path_for(cert)
    dest.parent.mkdir(parents=True, exist_ok=True)
    body = (cert.body_text or "").strip() or default_body_text(course.title)
    path = await generate_certificate_pdf_with_browser(
        recipient_name=cert.recipient_name or user.full_name,
        course_title=course.title,
        credential_id=cert.certificate_id,
        issued_at=cert.issued_at,
        body_text=body,
        email=user.email,
        output_path=dest,
    )
    backend_root = Path(__file__).resolve().parent
    try:
        rel = path.relative_to(backend_root)
    except ValueError:
        rel = path
    cert.pdf_url = str(rel).replace("\\", "/")
    cert.status = "GENERATED"
    await db.commit()
    await db.refresh(cert)
    return path


async def email_certificate_if_configured(
    db: AsyncSession,
    cert: models.UserCertificate,
    user: models.User,
    course: models.Course,
    pdf_path: Path,
) -> None:
    if not user.email:
        cert.email_status = "SKIPPED"
        await db.commit()
        return
    try:
        await asyncio.to_thread(
            send_certificate_email,
            to_email=user.email,
            name=user.full_name or cert.recipient_name or "Learner",
            course_title=course.title,
            credential_id=cert.certificate_id,
            pdf_path=pdf_path,
        )
        cert.email_status = "SENT"
    except Exception as exc:
        logger.exception("Certificate email failed for %s: %s", cert.certificate_id, exc)
        cert.email_status = "FAILED"
    await db.commit()


async def issue_certificate_if_eligible(
    db: AsyncSession,
    user: models.User,
    course_id: int,
    *,
    generate_pdf: bool = True,
    send_email: bool = True,
    require_complete: bool = True,
) -> Optional[models.UserCertificate]:
    course_res = await db.execute(select(models.Course).where(models.Course.id == course_id))
    course = course_res.scalars().first()
    if not course:
        return None
    if require_complete and not await course_is_complete(db, user.id, course):
        return None

    cert = await get_user_certificate(db, user.id, course_id)
    created = False
    refresh_pdf = False
    if not cert:
        credential_id = await allocate_credential_id(db, course=course)
        completed_at = await course_completed_at(db, user.id, course)
        duration_minutes = await course_duration_minutes(db, course)
        cert = models.UserCertificate(
            user_id=user.id,
            course_id=course.id,
            certificate_id=credential_id,
            recipient_name=format_recipient_name(user.full_name, user.email),
            body_text=compose_course_body(course, duration_minutes),
            issued_at=completed_at,
            status="PENDING",
            email_status="PENDING",
        )
        db.add(cert)
        db.add(models.Notification(
            user_id=user.id,
            title="Certificate issued",
            message=f"Your Cloudvaathi certificate for {course.title} is ready. CERTIFICATION ID : {credential_id}",
            created_at=datetime.utcnow(),
        ))
        await db.commit()
        await db.refresh(cert)
        created = True
    elif not (cert.body_text or "").strip():
        duration_minutes = await course_duration_minutes(db, course)
        cert.body_text = compose_course_body(course, duration_minutes)
        if not cert.issued_at:
            cert.issued_at = await course_completed_at(db, user.id, course)
        await db.commit()
        await db.refresh(cert)
        refresh_pdf = True

    pdf_path = _pdf_path_for(cert)
    should_generate_pdf = generate_pdf and _needs_pdf_generation(
        cert, pdf_path, created=created, refresh_pdf=refresh_pdf
    )
    should_send_email = _needs_email_send(cert, user, send_email=send_email)

    if should_generate_pdf:
        try:
            pdf_path = await render_certificate_pdf(db, cert, user, course)
            if should_send_email:
                await email_certificate_if_configured(db, cert, user, course, pdf_path)
        except Exception as exc:
            logger.exception("Certificate PDF generation failed for %s: %s", cert.certificate_id, exc)
            cert.status = "FAILED"
            await db.commit()
    elif should_send_email and _pdf_is_ready(pdf_path):
        try:
            await email_certificate_if_configured(db, cert, user, course, pdf_path)
        except Exception as exc:
            logger.exception("Certificate email retry failed for %s: %s", cert.certificate_id, exc)
    return cert


async def ensure_certificate_pdf(
    db: AsyncSession,
    cert: models.UserCertificate,
    user: models.User,
    course: models.Course,
) -> Path:
    path = _pdf_path_for(cert)
    missing_body = not (cert.body_text or "").strip()
    if missing_body:
        cert.body_text = compose_course_body(course, await course_duration_minutes(db, course))
        if not cert.issued_at:
            cert.issued_at = await course_completed_at(db, user.id, course)
        await db.commit()
        await db.refresh(cert)
    if path.exists() and path.stat().st_size > 0 and not missing_body:
        return path
    return await render_certificate_pdf(db, cert, user, course)


async def public_certificate_payload(db: AsyncSession, credential_id: str) -> Optional[Dict[str, Any]]:
    result = await db.execute(
        select(models.UserCertificate).where(models.UserCertificate.certificate_id == credential_id)
    )
    cert = result.scalars().first()
    if not cert:
        return None
    course_res = await db.execute(select(models.Course).where(models.Course.id == cert.course_id))
    course = course_res.scalars().first()
    return {
        "valid": True,
        "credential_id": cert.certificate_id,
        "recipient_name": cert.recipient_name,
        "course_title": course.title if course else None,
        "issued_at": cert.issued_at.isoformat() if cert.issued_at else None,
        "status": cert.status or "GENERATED",
    }


async def issue_after_content_complete(db: AsyncSession, user: models.User, content_item_id: int) -> Optional[models.UserCertificate]:
    result = await db.execute(
        select(models.Module.course_id)
        .join(models.ContentItem, models.ContentItem.module_id == models.Module.id)
        .where(models.ContentItem.id == content_item_id)
    )
    course_id = result.scalar()
    if not course_id:
        return None
    return await issue_certificate_if_eligible(db, user, course_id)


async def issue_after_challenge_solved(db: AsyncSession, user: models.User, challenge_id: int) -> Optional[models.UserCertificate]:
    result = await db.execute(
        select(models.CourseChallenge.course_id).where(models.CourseChallenge.id == challenge_id)
    )
    course_id = result.scalar()
    if not course_id:
        return None
    return await issue_certificate_if_eligible(db, user, course_id)


def certificate_response_payload(cert: Optional[models.UserCertificate]) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"certificate_issued": bool(cert)}
    if cert:
        payload["certificate"] = serialize_certificate(cert)
    return payload
