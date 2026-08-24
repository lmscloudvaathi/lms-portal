import os

DEFAULT_SUPER_ADMINS = "jagathishwaranparthiban@iqmath.in,lmscloudvaathi@gmail.com"


def super_admin_emails() -> set[str]:
    raw = (os.getenv("SUPER_ADMIN_EMAILS") or DEFAULT_SUPER_ADMINS).strip()
    return {part.strip().lower() for part in raw.split(",") if part.strip()}


def is_super_admin_email(email: str | None) -> bool:
    return str(email or "").strip().lower() in super_admin_emails()
