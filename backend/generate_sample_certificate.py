"""Generate a sample Cloudvaathi certificate PDF for flow verification."""
from __future__ import annotations

import asyncio
from datetime import datetime
from pathlib import Path

import models
from certificate_copy import build_course_body, format_recipient_name
from certificate_course_codes import build_certificate_prefix, resolve_course_certificate_code
from certificate_id import format_certificate_id
from certificate_html import build_certificate_html
from pdf_certificate import close_shared_browser, generate_certificate_pdf_with_browser


async def main() -> None:
    course = models.Course(
        id=1,
        title="Complete Python Bootcamp",
        description="Python programming, data structures, and practical projects.",
        category="programming",
        language="python",
        course_type="coding",
    )
    code = resolve_course_certificate_code(course)
    prefix = build_certificate_prefix(course)
    credential_id = format_certificate_id(prefix, 731)
    recipient = format_recipient_name("Jagathishwaran Parthiban", "learner@cloudvaathi.in")
    body = build_course_body(
        title=course.title,
        description=course.description,
        duration_minutes=480,
        category=course.category,
        language=course.language,
    )
    issued_at = datetime.utcnow()

    out_dir = Path(__file__).resolve().parent / "generated"
    out_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = out_dir / f"{credential_id}-SAMPLE.pdf"
    html_path = out_dir / f"{credential_id}-SAMPLE.html"

    html = build_certificate_html(
        recipient_name=recipient,
        course_title=course.title,
        credential_id=credential_id,
        issued_at=issued_at,
        body_text=body,
        email="learner@cloudvaathi.in",
    )
    html_path.write_text(html, encoding="utf-8")

    print("=== CLOUDVAATHI CERTIFICATE FLOW SAMPLE ===")
    print(f"Course:          {course.title}")
    print(f"Course code:     {code}")
    print(f"Certificate ID:  {credential_id}")
    print(f"Recipient:       {recipient}")
    print(f"Intro line:      Cloudvaathi certifies that")
    print(f"Body text:       {body}")
    print(f"Issued date:     {issued_at.strftime('%d %b %Y').upper()}")
    print(f"Verify URL:      https://lms.cloudvaathi.in/certificates/{credential_id}")
    print(f"HTML preview:    {html_path}")

    try:
        path = await generate_certificate_pdf_with_browser(
            recipient_name=recipient,
            course_title=course.title,
            credential_id=credential_id,
            issued_at=issued_at,
            body_text=body,
            email="learner@cloudvaathi.in",
            output_path=pdf_path,
        )
        print(f"PDF generated:   {path} ({path.stat().st_size:,} bytes)")
    except Exception as exc:
        print(f"PDF ERROR:       {type(exc).__name__}: {exc}")
    finally:
        await close_shared_browser()


if __name__ == "__main__":
    asyncio.run(main())
