from __future__ import annotations

import html
import re
from datetime import datetime
from typing import Optional


def clean_text(value: Optional[str], *, fallback: str = "") -> str:
    text = " ".join(str(value or "").split()).strip()
    if not text or text.lower() in {"undefined", "null", "none"}:
        return fallback
    return text


def format_recipient_name(full_name: Optional[str], email: Optional[str] = None) -> str:
    name = clean_text(full_name)
    if not name and email:
        local = email.split("@", 1)[0].replace(".", " ").replace("_", " ")
        name = clean_text(local)
    if not name:
        name = "Learner"
    return name.upper()


def format_issued_month_year(issued_at: Optional[datetime] = None) -> str:
    """UPPERCASE 'MONTH YYYY', e.g. JULY 2025."""
    moment = issued_at or datetime.utcnow()
    return f"{moment.strftime('%B').upper()} {moment.year}"


def format_issued_date(issued_at: Optional[datetime] = None) -> str:
    """Legacy day-month-year label; prefer format_issued_month_year for the new template."""
    moment = issued_at or datetime.utcnow()
    return f"{moment.day} {moment.strftime('%b').upper()} {moment.year}"


def normalize_program_name(program_name: Optional[str]) -> str:
    name = clean_text(program_name, fallback="Program")
    # Avoid “the The Azure…” in the body sentence.
    if name.lower().startswith("the "):
        name = name[4:].strip() or name
    return name


def resolve_subject_area(
    *,
    subject_area: Optional[str] = None,
    program_name: Optional[str] = None,
    category: Optional[str] = None,
    language: Optional[str] = None,
) -> str:
    explicit = clean_text(subject_area)
    if explicit:
        return explicit
    lang = clean_text(language)
    if lang and lang.lower() not in {"other", "n/a", "na", "none"}:
        return lang.title() if lang.islower() else lang
    cat = clean_text(category)
    if cat and cat.lower() not in {"other", "n/a", "na", "none"}:
        return cat.replace("_", " ").title()
    program = normalize_program_name(program_name)
    return program or "the subject"


def duration_hours_from_minutes(duration_minutes: Optional[int], *, default_hours: int = 30) -> int:
    try:
        minutes = int(duration_minutes or 0)
    except (TypeError, ValueError):
        minutes = 0
    if minutes <= 0:
        return max(1, int(default_hours))
    hours = int(round(minutes / 60.0))
    return max(1, hours)


def build_course_body(
    *,
    title: Optional[str] = None,
    program_name: Optional[str] = None,
    duration_hours: Optional[int] = None,
    duration_minutes: Optional[int] = None,
    subject_area: Optional[str] = None,
    description: Optional[str] = None,
    category: Optional[str] = None,
    language: Optional[str] = None,
) -> str:
    """
    Body paragraph for the new certificate layout.

    Template (curly quotes):
    for successfully completing the {hours}-hour “{program}” program and demonstrating
    proficiency in foundational and advanced competencies of {subjectArea}.
    """
    _ = description  # kept for call-site compatibility
    program = normalize_program_name(program_name or title)
    hours = int(duration_hours) if duration_hours is not None else duration_hours_from_minutes(duration_minutes)
    subject = resolve_subject_area(
        subject_area=subject_area,
        program_name=program,
        category=category,
        language=language,
    )
    return (
        f"for successfully completing the {hours}-hour “{program}” program and demonstrating "
        f"proficiency in foundational and advanced competencies of {subject}."
    )


def default_body_text(
    course_title: str,
    *,
    duration_hours: int = 30,
    subject_area: Optional[str] = None,
) -> str:
    return build_course_body(
        title=course_title,
        duration_hours=duration_hours,
        subject_area=subject_area,
    )


def markdown_bold_to_html(text: str) -> str:
    """Escape user/body text; convert legacy **title** markup to curly-quoted titles."""
    escaped = html.escape(text or "", quote=False)
    escaped = escaped.replace("\n", "<br/>")
    return re.sub(
        r"\*\*(.+?)\*\*",
        lambda match: f"“{html.escape(match.group(1).strip(), quote=False)}”",
        escaped,
    )
