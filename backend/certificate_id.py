from __future__ import annotations

import os
import re
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.exc import StaleDataError

import models
from certificate_course_codes import build_certificate_prefix, resolve_course_certificate_code

START_NUMBER = 100


def certificate_id_base() -> str:
    return (os.getenv("CERTIFICATE_ID_BASE") or os.getenv("CERTIFICATE_ID_PREFIX") or "CV").strip().upper() or "CV"


def default_prefix() -> str:
    """Legacy fallback prefix when no course context is available."""
    base = certificate_id_base()
    return f"{base}-GEN"


DEFAULT_PREFIX = "CV-GEN"


def compact_prefix(prefix: str) -> str:
    """CV-PYT -> CVPYT, CV-GEN -> CVGEN."""
    return re.sub(r"[^A-Za-z0-9]", "", (prefix or "").strip().upper()) or "CVGEN"


def format_certificate_id(prefix: str, number: int) -> str:
    """Build display ID without hyphens, e.g. CVPYT731."""
    return f"{compact_prefix(prefix)}{number}"


def _id_number(credential_id: str, prefix: str) -> Optional[int]:
    if not credential_id:
        return None
    compact = compact_prefix(prefix)
    normalized = re.sub(r"[^A-Z0-9]", "", credential_id.strip().upper())
    if not normalized.startswith(compact):
        return None
    tail = normalized[len(compact):]
    if not tail.isdigit():
        return None
    try:
        return int(tail)
    except ValueError:
        return None


async def _highest_issued_number(db: AsyncSession, prefix: str) -> int:
    compact = compact_prefix(prefix)
    result = await db.execute(
        select(models.UserCertificate.certificate_id).where(
            or_(
                models.UserCertificate.certificate_id.like(f"{prefix}-%"),
                models.UserCertificate.certificate_id.like(f"{compact}%"),
            )
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

    sequence_key = compact_prefix(clean_prefix)
    highest = await _highest_issued_number(db, clean_prefix)

    result = await db.execute(
        select(models.CertificateIdSequence).where(
            or_(
                models.CertificateIdSequence.prefix == clean_prefix,
                models.CertificateIdSequence.prefix == sequence_key,
            )
        )
    )
    row = result.scalars().first()
    if not row:
        row = models.CertificateIdSequence(prefix=sequence_key, next_number=START_NUMBER)
        db.add(row)
        await db.flush()
    elif row.prefix != sequence_key:
        row.prefix = sequence_key

    number = max(int(row.next_number or START_NUMBER), highest + 1, START_NUMBER)
    row.next_number = number + 1
    try:
        await db.flush()
    except StaleDataError:
        await db.refresh(row)
        number = max(int(row.next_number or START_NUMBER), highest + 1, START_NUMBER)
        row.next_number = number + 1
        await db.flush()
    return format_certificate_id(clean_prefix, number)


def describe_course_certificate_code(course: models.Course) -> dict[str, str]:
    """Useful for admin/debug responses."""
    code = resolve_course_certificate_code(course)
    prefix = build_certificate_prefix(course, base=certificate_id_base())
    return {
        "course_code": code,
        "certificate_prefix": compact_prefix(prefix),
        "sample_id": format_certificate_id(prefix, START_NUMBER),
    }
