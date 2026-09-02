from __future__ import annotations

import html
import re
from datetime import datetime
from typing import Optional

CATEGORY_LABELS = {
    "programming": "programming",
    "web-development": "web development",
    "data-science": "data science",
    "cloud-devops": "cloud and DevOps",
    "business": "business",
    "marketing": "marketing",
}


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


def _clean_topics(text: str, limit: int = 180) -> str:
    cleaned = re.sub(r"<[^>]+>", " ", text or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    if not cleaned:
        return ""
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[:limit].rsplit(" ", 1)[0].rstrip(",;:") + "…"


def _duration_phrase(duration_minutes: Optional[int]) -> str:
    if not duration_minutes or duration_minutes < 45:
        return ""
    hours = max(1, int(round(duration_minutes / 60.0)))
    return f"the {hours}-hour "


def build_course_body(
    *,
    title: str,
    description: Optional[str] = None,
    duration_minutes: Optional[int] = None,
    category: Optional[str] = None,
    language: Optional[str] = None,
) -> str:
    course_name = (title or "this programme").strip()
    topics = _clean_topics(description or "")
    if not topics:
        if language:
            topics = f"{language.strip()} and the practical skills taught in this programme"
        else:
            label = CATEGORY_LABELS.get((category or "").strip().lower())
            topics = (
                f"{label} concepts and the practical skills taught in this programme"
                if label
                else "the skills and outcomes taught in this Cloudvaathi programme"
            )
    return (
        f"has successfully completed {_duration_phrase(duration_minutes)}{_quoted_course_name(course_name)} "
        f"and demonstrated proficiency in {topics}."
    )


def default_body_text(course_title: str) -> str:
    return build_course_body(title=course_title)
