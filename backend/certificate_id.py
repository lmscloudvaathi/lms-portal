from __future__ import annotations

import os
import re
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.exc import StaleDataError

import models

START_NUMBER = 10001
_ID_TAIL = re.compile(r"-(\d+)$")


def default_prefix() -> str:
    return (os.getenv("CERTIFICATE_ID_PREFIX") or "CV-LMS").strip().upper().replace(" ", "-") or "CV-LMS"


DEFAULT_PREFIX = "CV-LMS"


def _id_number(credential_id: str, prefix: str) -> Optional[int]:
    if not credential_id:
        return None
    match = _ID_TAIL.search(credential_id.strip().upper())
    if not match:
        return None
    if not credential_id.strip().upper().startswith(prefix + "-"):
        return None
    return int(match.group(1))


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


async def allocate_credential_id(db: AsyncSession, prefix: str | None = None) -> str:
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
