from __future__ import annotations

import os
import re
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.exc import StaleDataError

import models
from certificate_course_codes import build_certificate_prefix, resolve_course_certificate_code

START_NUMBER = 100
_ID_TAIL = re.compile(r"-(\d+)$")


def certificate_id_base() -> str:
    return (os.getenv("CERTIFICATE_ID_BASE") or os.getenv("CERTIFICATE_ID_PREFIX") or "CV").strip().upper() or "CV"


def default_prefix() -> str:
    """Legacy fallback prefix when no course context is available."""
    base = certificate_id_base()
    return f"{base}-GEN"


DEFAULT_PREFIX = "CV-GEN"


def _id_number(credential_id: str, prefix: str) -> Optional[int]:
    if not credential_id:
        return None
    normalized = credential_id.strip().upper()
    if not normalized.startswith(prefix + "-"):
        return None
    match = _ID_TAIL.search(normalized)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


async def _highest_issued_number(db: AsyncSession, prefix: str) -> int:
    result = await db.execute(
        select(models.UserCertificate.certificate_id).where(
            models.UserCertificate.certificate_id.like(f"{prefix}-%")
        )
    )
    highest = START_NUMBER - 1
    for credential_id in result.scalars().all():
        number = _id_number(str(credential_id or ""), prefix)
        if number is not None:
            highest = max(highest, number)
    return highest


async def allocate_credential_id(
    db: AsyncSession,
    *,
    course: Optional[models.Course] = None,
    prefix: Optional[str] = None,
) -> str:
    if course is not None:
        clean_prefix = build_certificate_prefix(course, base=certificate_id_base())
    else:
        clean_prefix = (prefix or default_prefix()).strip().upper().replace(" ", "-")

    highest = await _highest_issued_number(db, clean_prefix)

    result = await db.execute(
        select(models.CertificateIdSequence).where(models.CertificateIdSequence.prefix == clean_prefix)
    )
    row = result.scalars().first()
    if not row:
        row = models.CertificateIdSequence(prefix=clean_prefix, next_number=START_NUMBER)
        db.add(row)
        await db.flush()

    number = max(int(row.next_number or START_NUMBER), highest + 1, START_NUMBER)
    row.next_number = number + 1
    try:
        await db.flush()
    except StaleDataError:
        await db.refresh(row)
        number = max(int(row.next_number or START_NUMBER), highest + 1, START_NUMBER)
        row.next_number = number + 1
        await db.flush()
    return f"{clean_prefix}-{number}"


def describe_course_certificate_code(course: models.Course) -> dict[str, str]:
    """Useful for admin/debug responses."""
    code = resolve_course_certificate_code(course)
    prefix = build_certificate_prefix(course, base=certificate_id_base())
    return {
        "course_code": code,
        "certificate_prefix": prefix,
        "sample_id": f"{prefix}-{START_NUMBER}",
    }
