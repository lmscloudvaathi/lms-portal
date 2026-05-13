"""
Gmail SMTP–based email OTP for student self-service signup.
Stores pending signups in memory (TTL). Configure GMAIL_USER and GMAIL_APP_PASSWORD.
"""
from __future__ import annotations

import asyncio
import hashlib
import os
import random
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Optional

OTP_TTL_SEC = 600
RESEND_COOLDOWN_SEC = 60
MAX_VERIFY_ATTEMPTS = 8

_lock = asyncio.Lock()
_pending: dict[str, dict[str, Any]] = {}


def _norm_email(email: str) -> str:
    return email.strip().lower()


def _hash_otp(raw: str) -> str:
    pepper = (os.getenv("SECRET_KEY") or "change-me-in-production").encode()
    return hashlib.sha256(pepper + b":" + raw.strip().encode()).hexdigest()


def _purge_expired_unlocked() -> None:
    now = time.time()
    for key in list(_pending.keys()):
        if _pending[key]["expires_at"] < now:
            del _pending[key]


def _smtp_send_sync(to_email: str, subject: str, html_body: str, text_body: str) -> None:
    gmail_user = (os.getenv("GMAIL_USER") or "").strip()
    app_password = (os.getenv("GMAIL_APP_PASSWORD") or "").strip()
    if not gmail_user or not app_password:
        raise RuntimeError("Gmail SMTP is not configured (GMAIL_USER / GMAIL_APP_PASSWORD).")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = gmail_user
    msg["To"] = to_email
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as server:
        server.starttls()
        server.login(gmail_user, app_password)
        server.sendmail(gmail_user, [to_email], msg.as_string())


def build_otp_email(name: str, otp: str) -> tuple[str, str, str]:
    subject = "Your verification code — Cloud Vaathi LMS"
    safe_name = name.strip() or "there"
    text_body = (
        f"Hello {safe_name},\n\n"
        f"Your verification code is: {otp}\n\n"
        "This code expires in 10 minutes.\n\n"
        "If you did not request this, you can ignore this email.\n\n"
        "Did not receive the message? Check your Spam or Junk folder — "
        "legitimate messages are sometimes filtered there.\n"
    )
    html_body = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#334155;">
  <p>Hello <strong>{safe_name}</strong>,</p>
  <p>Your verification code is:</p>
  <p style="font-size:28px;letter-spacing:8px;font-weight:bold;color:#0f172a;">{otp}</p>
  <p style="font-size:14px;">This code expires in <strong>10 minutes</strong>.</p>
  <p style="font-size:14px;">If you did not request this, you can ignore this email.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
  <p style="font-size:13px;color:#64748b;">
    <strong>Did not receive the email?</strong> Check your <strong>Spam</strong> or <strong>Junk</strong> folder —
    messages from new senders are sometimes filtered there by mistake.
  </p>
</body>
</html>
"""
    return subject, html_body, text_body


async def begin_signup_otp(
    email: str,
    *,
    password_hash: str,
    full_name: str,
    phone_number: Optional[str],
    role: str,
) -> None:
    """Create or replace pending signup and send OTP. Raises ValueError with user-safe message on failure."""
    key = _norm_email(email)
    otp = f"{random.randint(0, 999999):06d}"
    now = time.time()

    async with _lock:
        _purge_expired_unlocked()
        if key in _pending and now - _pending[key]["last_sent"] < RESEND_COOLDOWN_SEC:
            wait = int(RESEND_COOLDOWN_SEC - (now - _pending[key]["last_sent"]))
            raise ValueError(f"Please wait {wait} seconds before requesting another code.")

        _pending[key] = {
            "otp_hash": _hash_otp(otp),
            "password_hash": password_hash,
            "full_name": full_name.strip(),
            "phone_number": (phone_number or "").strip() or None,
            "role": role,
            "expires_at": now + OTP_TTL_SEC,
            "last_sent": now,
            "attempts": 0,
        }

    subject, html_body, text_body = build_otp_email(full_name, otp)
    try:
        await asyncio.to_thread(_smtp_send_sync, key, subject, html_body, text_body)
    except Exception:
        async with _lock:
            _pending.pop(key, None)
        raise


async def resend_signup_otp(email: str) -> None:
    key = _norm_email(email)
    now = time.time()
    otp = f"{random.randint(0, 999999):06d}"

    async with _lock:
        _purge_expired_unlocked()
        if key not in _pending:
            raise ValueError("No pending signup for this email. Go back and submit your details again.")
        if now - _pending[key]["last_sent"] < RESEND_COOLDOWN_SEC:
            wait = int(RESEND_COOLDOWN_SEC - (now - _pending[key]["last_sent"]))
            raise ValueError(f"Please wait {wait} seconds before resending.")
        rec = _pending[key]
        rec["otp_hash"] = _hash_otp(otp)
        rec["expires_at"] = now + OTP_TTL_SEC
        rec["last_sent"] = now
        rec["attempts"] = 0
        full_name = rec["full_name"]

    subject, html_body, text_body = build_otp_email(full_name, otp)
    try:
        await asyncio.to_thread(_smtp_send_sync, key, subject, html_body, text_body)
    except Exception:
        raise


async def verify_signup_otp_and_consume(email: str, otp: str) -> dict[str, Any]:
    """
    Validates OTP and removes pending entry. Returns keys: password_hash, full_name,
    phone_number, role. Raises ValueError on failure.
    """
    key = _norm_email(email)
    async with _lock:
        _purge_expired_unlocked()
        if key not in _pending:
            raise ValueError("No pending signup for this email. Request a new code.")
        rec = _pending[key]
        if time.time() > rec["expires_at"]:
            del _pending[key]
            raise ValueError("This code has expired. Request a new one.")
        if rec["attempts"] >= MAX_VERIFY_ATTEMPTS:
            del _pending[key]
            raise ValueError("Too many incorrect attempts. Request a new code.")
        rec["attempts"] += 1
        if _hash_otp(otp) != rec["otp_hash"]:
            raise ValueError("Invalid verification code.")
        out = {
            "password_hash": rec["password_hash"],
            "full_name": rec["full_name"],
            "phone_number": rec["phone_number"],
            "role": rec["role"],
        }
        del _pending[key]
        return out
