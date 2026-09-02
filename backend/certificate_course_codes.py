from __future__ import annotations

import re
from typing import Optional, Sequence, Tuple

import models

# (keyword phrases, 3-letter code) — first match wins; keep specific phrases first.
_COURSE_CODE_RULES: Sequence[Tuple[Tuple[str, ...], str]] = (
    (("power bi", "powerbi", "power-bi"), "PBI"),
    (("machine learning", "deep learning", "artificial intelligence", " ai ", " ai&", "generative ai"), "AIM"),
    (("data science", "data-science", "data analytics"), "DSC"),
    (("ms excel", "microsoft excel", "excel"), "EXL"),
    (("mysql", "postgresql", "postgres", "pl/sql", "tsql", " sql", "sql "), "SQL"),
    (("python", "pyspark"), "PYT"),
    (("javascript", "typescript", "react", "node.js", "nodejs", "frontend", "web development"), "WEB"),
    (("java",), "JAV"),
    (("c++", "cpp", "c plus plus"), "CPP"),
    (("aws", "azure", "gcp", "devops", "kubernetes", "docker", "cloud"), "CLD"),
    (("marketing", "seo", "digital marketing"), "MKT"),
    (("business", "finance", "accounting", "mba"), "BUS"),
)

_CATEGORY_CODES = {
    "programming": "PYT",
    "web-development": "WEB",
    "data-science": "DSC",
    "cloud-devops": "CLD",
    "business": "BUS",
    "marketing": "MKT",
    "general": "GEN",
}

_LANGUAGE_CODES = {
    "python": "PYT",
    "javascript": "WEB",
    "typescript": "WEB",
    "java": "JAV",
    "cpp": "CPP",
    "c++": "CPP",
    "sql": "SQL",
}


def _normalize(text: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _contains(haystack: str, phrase: str) -> bool:
    phrase = phrase.strip().lower()
    if not phrase:
        return False
    if len(phrase) <= 4 or phrase.isalpha():
        return re.search(rf"\b{re.escape(phrase)}\b", haystack) is not None
    return phrase in haystack


def _matches(haystack: str, phrases: Tuple[str, ...]) -> bool:
    return any(_contains(haystack, phrase) for phrase in phrases)


def _haystack(course: models.Course) -> str:
    parts = (
        course.title,
        course.description,
        course.category,
        course.language,
    )
    return f" {_normalize(' '.join(str(p) for p in parts if p))} "


def _fallback_code_from_title(title: Optional[str]) -> str:
    words = re.findall(r"[A-Za-z0-9]+", title or "")
    if not words:
        return "GEN"
    if len(words) == 1:
        token = re.sub(r"[^A-Za-z0-9]", "", words[0]).upper()
        return (token + "XXX")[:3]
    initials = "".join(word[0] for word in words[:3]).upper()
    if len(initials) >= 3:
        return initials[:3]
    token = re.sub(r"[^A-Za-z0-9]", "", words[0]).upper()
    return (token + initials + "XXX")[:3]


def resolve_course_certificate_code(course: models.Course) -> str:
    """Return a 3-letter course code such as PYT, EXL, or SQL."""
    haystack = _haystack(course)

    for phrases, code in _COURSE_CODE_RULES:
        if _matches(haystack, phrases):
            return code

    category = _normalize(course.category).replace("_", "-")
    if category in _CATEGORY_CODES:
        return _CATEGORY_CODES[category]

    language = _normalize(course.language)
    if language in _LANGUAGE_CODES:
        return _LANGUAGE_CODES[language]

    if (course.course_type or "").lower() == "coding" and language in _LANGUAGE_CODES:
        return _LANGUAGE_CODES[language]

    return _fallback_code_from_title(course.title)


def build_certificate_prefix(course: models.Course, *, base: str = "CV") -> str:
    code = resolve_course_certificate_code(course)
    clean_base = re.sub(r"[^A-Za-z0-9]", "", (base or "CV").upper()) or "CV"
    return f"{clean_base}-{code}"
