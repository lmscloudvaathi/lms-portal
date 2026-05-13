"""Learner Google Sign-In: verify GIS id_token, create or link student, return JWT."""
from __future__ import annotations

import os
import secrets
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env", override=False)

from fastapi import APIRouter, Depends, HTTPException
from google.auth.transport import requests as google_auth_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

import models
import schemas
from database import get_db
from password_utils import get_password_hash

router = APIRouter(prefix="/auth/google", tags=["auth-google"])


def _google_client_ids() -> list[str]:
    """Support one or more Web client IDs (comma-separated), e.g. dev + prod."""
    raw = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()
    if not raw:
        return []
    return [p.strip() for p in raw.split(",") if p.strip()]


def _verify_credential(credential: str) -> dict:
    client_ids = _google_client_ids()
    if not client_ids:
        raise HTTPException(
            status_code=503,
            detail="Google Sign-In is not configured (set GOOGLE_CLIENT_ID on the server).",
        )
    request = google_auth_requests.Request()
    # One verify with all audiences avoids edge cases where `aud` is an array or
    # the token was minted for one of several Web client IDs.
    audience: str | list[str] = client_ids[0] if len(client_ids) == 1 else client_ids
    try:
        idinfo = google_id_token.verify_token(
            credential,
            request,
            audience=audience,
            clock_skew_in_seconds=120,
        )
    except ValueError as e:
        # Helps operators correlate 401s with clock/audience/signature issues.
        print(f"[auth/google] verify_token failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid Google credential.") from e

    iss = idinfo.get("iss")
    if iss not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(status_code=401, detail="Invalid Google credential.")
    return idinfo


@router.post("/student")
async def google_student_auth(req: schemas.GoogleStudentAuthRequest, db: AsyncSession = Depends(get_db)):
    token = (req.credential or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Missing credential.")

    idinfo = _verify_credential(token)

    if not idinfo.get("email_verified", False):
        raise HTTPException(status_code=401, detail="Google email is not verified.")

    email = (idinfo.get("email") or "").strip().lower()
    sub = (idinfo.get("sub") or "").strip()
    name = (idinfo.get("name") or "").strip() or (email.split("@")[0] if email else "Student")
    name = name[:255]
    if not email or not sub:
        raise HTTPException(status_code=401, detail="Invalid Google profile.")

    result = await db.execute(select(models.User).where(models.User.email == email))
    user = result.scalars().first()

    if not user:
        if req.mode == "login":
            raise HTTPException(
                status_code=400,
                detail="No account found for this Google email. Register first using Create account (email code or Google), then use Google on Sign in.",
            )
        random_pw = secrets.token_urlsafe(32)
        user = models.User(
            email=email,
            hashed_password=get_password_hash(random_pw),
            full_name=name,
            role="student",
            phone_number=None,
            google_sub=sub,
            last_login=datetime.utcnow(),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        if user.role != "student":
            raise HTTPException(
                status_code=403,
                detail="This email is registered as an instructor or admin. Use the admin portal.",
            )
        if user.is_active is False:
            raise HTTPException(status_code=403, detail="Account deactivated. Contact support.")
        if user.google_sub and user.google_sub != sub:
            raise HTTPException(
                status_code=409,
                detail="This email is linked to a different Google account.",
            )
        if not user.google_sub:
            user.google_sub = sub
        user.last_login = datetime.utcnow()
        await db.commit()
        await db.refresh(user)

    import main as app_main

    access = app_main.create_access_token(data={"sub": user.email, "role": user.role})
    return {"access_token": access, "token_type": "bearer", "role": user.role}
