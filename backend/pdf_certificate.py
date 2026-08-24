from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import Optional

from certificate_html import build_certificate_html
from certificate_layout import CANVAS_HEIGHT, CANVAS_WIDTH
from template_assets import resolve_template_png

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

    playwright = await async_playwright().start()
    launch_kwargs = {
        "headless": True,
        "args": _launch_args(),
    }
    executable = _executable_path()
    if executable:
        launch_kwargs["executable_path"] = executable
    browser = await playwright.chromium.launch(**launch_kwargs)
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


async def generate_certificate_pdf_with_browser(
    *,
    recipient_name: str,
    course_title: str,
    credential_id: str,
    issued_at=None,
    body_text: Optional[str] = None,
    email: Optional[str] = None,
    output_path: Optional[Path] = None,
    browser=None,
) -> Path:
    resolve_template_png()
    html = build_certificate_html(
        recipient_name=recipient_name,
        course_title=course_title,
        credential_id=credential_id,
        issued_at=issued_at,
        body_text=body_text,
        email=email,
    )
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    dest = output_path or (GENERATED_DIR / f"{credential_id}.pdf")

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
            width=f"{CANVAS_WIDTH}px",
            height=f"{CANVAS_HEIGHT}px",
            print_background=True,
            margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            prefer_css_page_size=True,
        )
    finally:
        await page.close()

    return dest
