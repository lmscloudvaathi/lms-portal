"""Crop certificate assets from the legacy full-page template.

Uses corner flood-fill so white interiors (medal center, logo gaps) stay opaque,
while only the exterior page background becomes transparent.
"""
from __future__ import annotations

import shutil
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "backend" / "assets" / "templates" / "default.png"
OUT = ROOT / "frontend" / "public" / "certificate"
BACKEND_OUT = ROOT / "backend" / "assets" / "certificate"


def flood_transparent_background(im: Image.Image, thresh: int = 245) -> Image.Image:
    """Make connected near-white background transparent, keep interior whites."""
    arr = np.asarray(im.convert("RGBA")).copy()
    h, w = arr.shape[:2]
    rgb = arr[:, :, :3]
    near_white = (rgb >= thresh).all(axis=2)
    visited = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()

    for y, x in ((0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)):
        if near_white[y, x]:
            q.append((y, x))
            visited[y, x] = True

    # Also seed along edges that are near-white
    for x in range(w):
        for y in (0, h - 1):
            if near_white[y, x] and not visited[y, x]:
                q.append((y, x))
                visited[y, x] = True
    for y in range(h):
        for x in (0, w - 1):
            if near_white[y, x] and not visited[y, x]:
                q.append((y, x))
                visited[y, x] = True

    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and near_white[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))

    arr[visited, 3] = 0
    return Image.fromarray(arr, "RGBA")


def trim_alpha(im: Image.Image, pad: int = 2) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    return im.crop(
        (max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad))
    )


def crop(src: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    return src.crop(box)


def save_asset(name: str, im: Image.Image) -> None:
    path = OUT / name
    im.save(path, optimize=True)
    shutil.copy2(path, BACKEND_OUT / name)
    print(f"{name}: {im.size} -> {path.stat().st_size} bytes")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    BACKEND_OUT.mkdir(parents=True, exist_ok=True)
    src = Image.open(SRC).convert("RGBA")

    # Pixel ROIs measured on default.png (1536x1024).
    crops = {
        # Full medal including ribbons; keep white center opaque.
        "medal.png": (100, 175, 360, 575),
        # Icon + CLOUD VAATHI wordmark (cut before SIDH ID text).
        "cloudvaathi-logo.png": (1255, 75, 1505, 250),
        # Signature ink only.
        "signature.png": (1215, 790, 1480, 900),
        "skill-india.png": (745, 930, 920, 990),
        "msme.png": (930, 900, 1065, 1000),
    }

    for name, box in crops.items():
        im = trim_alpha(flood_transparent_background(crop(src, box), thresh=242 if name == "medal.png" else 246))
        # Medal: ensure fully opaque white center (no accidental alpha holes).
        if name == "medal.png":
            arr = np.asarray(im).copy()
            rgb = arr[:, :, :3]
            a = arr[:, :, 3]
            # Any near-white with low alpha inside the circular body → force opaque white.
            near_white = (rgb >= 230).all(axis=2) & (a < 250) & (a > 0)
            arr[near_white, 3] = 255
            # Fill fully transparent holes that are fully enclosed (already handled by flood-fill).
            im = Image.fromarray(arr, "RGBA")
        save_asset(name, im)


if __name__ == "__main__":
    main()
