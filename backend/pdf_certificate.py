from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import Optional

from certificate_html import build_certificate_html
from certificate_layout import CANVAS_HEIGHT, CANVAS_WIDTH
from template_assets import resolve_certificate_asset

GENERATED_DIR = Path(__file__).resolve().parent / "generated"

_browser = None
_browser_lock = asyncio.Lock()


def _launch_args() -> list[str]:
    args = [
        "--disable-dev-shm-usage",
        "--font-render-hinting=medium",
        "--hide-scrollbars",
    ]
    if sys.platform.startswith("linux"):
        args.extend(["--no-sandbox", "--disable-gpu"])
    extra = (os.getenv("CHROMIUM_FLAGS") or "").strip()
    if extra:
        args.extend(extra.split())
    return args


def _executable_path() -> Optional[str]:
    for key in ("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", "CHROME_PATH", "CHROMIUM_PATH"):
        value = (os.getenv(key) or "").strip()
        if value and Path(value).exists():
            return value
    return None


async def launch_headless_browser():
    from playwright.async_api import async_playwright

    try:
        playwright = await async_playwright().start()
    except Exception as exc:
        raise RuntimeError(
            "Playwright is not ready for certificate PDF generation. "
            "Run: python -m playwright install chromium"
        ) from exc
    launch_kwargs = {
        "headless": True,
        "args": _launch_args(),
    }
    executable = _executable_path()
    if executable:
        launch_kwargs["executable_path"] = executable
    try:
        browser = await playwright.chromium.launch(**launch_kwargs)
    except Exception as exc:
        await playwright.stop()
        raise RuntimeError(
            "Chromium is not installed for certificate PDF generation. "
            "Run: python -m playwright install chromium"
        ) from exc
    browser._playwright = playwright  # type: ignore[attr-defined]
    return browser


async def _shared_browser():
    global _browser
    async with _browser_lock:
        if _browser is None or not _browser.is_connected():
            _browser = await launch_headless_browser()
        return _browser


async def close_shared_browser() -> None:
    global _browser
    async with _browser_lock:
        if _browser is None:
            return
        playwright = getattr(_browser, "_playwright", None)
        await _browser.close()
        if playwright is not None:
            await playwright.stop()
        _browser = None


def _ensure_assets() -> None:
    for name in ("medal", "logo", "signature", "skillIndia", "msme"):
        resolve_certificate_asset(name)


async def generate_certificate_pdf_with_browser(
    *,
    recipient_name: str,
    program_name: Optional[str] = None,
    course_title: Optional[str] = None,
    certificate_id: Optional[str] = None,
    credential_id: Optional[str] = None,
    issued_at=None,
    duration_hours: Optional[int] = None,
    subject_area: Optional[str] = None,
    body_text: Optional[str] = None,
    email: Optional[str] = None,
    category: Optional[str] = None,
    language: Optional[str] = None,
    output_path: Optional[Path] = None,
    browser=None,
    also_png: Optional[Path] = None,
) -> Path:
    _ensure_assets()
    cert_id = certificate_id or credential_id or "UNKNOWN"
    html = build_certificate_html(
        recipient_name=recipient_name,
        program_name=program_name or course_title,
        course_title=course_title,
        certificate_id=cert_id,
        credential_id=cert_id,
        issued_at=issued_at,
        duration_hours=duration_hours,
        subject_area=subject_area,
        body_text=body_text,
        email=email,
        category=category,
        language=language,
    )
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    dest = output_path or (GENERATED_DIR / f"{cert_id}.pdf")

    owned_browser = browser is None
    if owned_browser:
        browser = await _shared_browser()

    page = await browser.new_page(
        viewport={"width": CANVAS_WIDTH, "height": CANVAS_HEIGHT},
        device_scale_factor=2,
    )
    try:
        await page.set_content(html, wait_until="domcontentloaded")
        try:
            await page.evaluate("() => document.fonts.ready")
            await page.evaluate("() => (typeof fitCertificateText === 'function' ? fitCertificateText() : null)")
            await page.wait_for_timeout(250)
        except Exception:
            await page.wait_for_timeout(800)
        await page.pdf(
            path=str(dest),
            format="A4",
            landscape=True,
            print_background=True,
            prefer_css_page_size=True,
            margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
        )
    finally:
        await page.close()

    if also_png is not None:
        also_png.parent.mkdir(parents=True, exist_ok=True)
        try:
            import fitz  # pymupdf

            doc = fitz.open(dest)
            pix = doc[0].get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            pix.save(str(also_png))
            doc.close()
        except Exception:
            # Fallback: leave PNG unavailable rather than a CSS-pt skewed screenshot.
            pass

    return dest


async def generate_certificate_pdf(
    *,
    recipient_name: str,
    program_name: Optional[str] = None,
    course_title: Optional[str] = None,
    certificate_id: Optional[str] = None,
    credential_id: Optional[str] = None,
    issued_at=None,
    duration_hours: Optional[int] = None,
    subject_area: Optional[str] = None,
    body_text: Optional[str] = None,
    email: Optional[str] = None,
    category: Optional[str] = None,
    language: Optional[str] = None,
    output_path: Optional[Path] = None,
    browser=None,
) -> Path:
    """Prefer Playwright; fall back to ReportLab when Chromium is unavailable (common on Render)."""
    try:
        return await generate_certificate_pdf_with_browser(
            recipient_name=recipient_name,
            program_name=program_name,
            course_title=course_title,
            certificate_id=certificate_id,
            credential_id=credential_id,
            issued_at=issued_at,
            duration_hours=duration_hours,
            subject_area=subject_area,
            body_text=body_text,
            email=email,
            category=category,
            language=language,
            output_path=output_path,
            browser=browser,
        )
    except Exception as browser_exc:
        import logging

        from pdf_certificate_reportlab import generate_certificate_pdf_with_reportlab

        logging.getLogger(__name__).warning(
            "Playwright certificate PDF failed (%s); using ReportLab fallback.",
            browser_exc,
        )
        return await asyncio.to_thread(
            generate_certificate_pdf_with_reportlab,
            recipient_name=recipient_name,
            program_name=program_name or course_title,
            course_title=course_title,
            certificate_id=certificate_id or credential_id,
            credential_id=credential_id or certificate_id,
            issued_at=issued_at,
            duration_hours=duration_hours,
            subject_area=subject_area,
            body_text=body_text,
            email=email,
            output_path=output_path,
        )
