from __future__ import annotations

import html
import re
from datetime import datetime
from typing import Optional

def format_recipient_name(full_name: Optional[str], email: Optional[str] = None) -> str:
    name = " ".join((full_name or "").split())
    if not name and email:
        local = email.split("@", 1)[0].replace(".", " ").replace("_", " ")
        name = " ".join(part for part in local.split() if part)
    if not name:
        name = "Learner"
    return name.upper()


def format_issued_date(issued_at: Optional[datetime] = None) -> str:
    moment = issued_at or datetime.utcnow()
    return f"{moment.day} {moment.strftime('%b').upper()} {moment.year}"


def _quoted_course_name(name: str) -> str:
    cleaned = (name or "").strip()
    if len(cleaned) >= 2 and cleaned[0] in {"'", "’", "‘", '"', "“"} and cleaned[-1] in {"'", "’", "‘", '"', "”"}:
        cleaned = cleaned[1:-1].strip()
    return f"‘{cleaned}’"


def markdown_bold_to_html(text: str) -> str:
    """Render certificate body copy. Legacy **title** markup becomes quoted titles."""
    escaped = html.escape(text or "", quote=False)
    escaped = escaped.replace("\n", "<br/>")
    return re.sub(r"\*\*(.+?)\*\*", lambda match: _quoted_course_name(match.group(1)), escaped)


def build_course_body(
    *,
    title: str,
    description: Optional[str] = None,
    duration_minutes: Optional[int] = None,
    category: Optional[str] = None,
    language: Optional[str] = None,
) -> str:
    """Standard certificate body for all courses. Extra kwargs kept for call-site compatibility."""
    _ = (description, duration_minutes, category, language)
    course_name = (title or "this programme").strip() or "this programme"
    return (
        f"for successfully completing the {course_name}. "
        "The recipient has demonstrated dedication, active participation, and a strong understanding "
        "of the concepts and skills covered throughout the program. "
        "This achievement reflects their commitment to continuous learning and professional development."
    )


def default_body_text(course_title: str) -> str:
    return build_course_body(title=course_title)
