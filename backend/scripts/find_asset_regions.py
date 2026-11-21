"""Find non-white content regions in the legacy certificate template."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "backend" / "assets" / "templates" / "default.png"


def main() -> None:
    im = Image.open(SRC).convert("RGB")
    arr = np.asarray(im)
    print("size", im.size)
    # non-near-white mask
    mask = (arr < 245).any(axis=2)
    # scan columns/rows density
    col_density = mask.mean(axis=0)
    row_density = mask.mean(axis=1)
    print("left content cols", np.where(col_density > 0.01)[0][[0, -1]] if col_density.any() else None)
    print("top content rows", np.where(row_density > 0.01)[0][[0, -1]] if row_density.any() else None)

    # Rough ROI guesses in px for A4 mapping using width scale only (template often width-locked)
    W, H = im.size
    print("W/H", W, H, "aspect", W / H, "target", 842 / 595)

    # Find medal-ish blob on left mid
    left = arr[:, :400]
    left_mask = (left < 240).any(axis=2)
    ys, xs = np.where(left_mask)
    if len(xs):
        print("left blob bbox px", xs.min(), ys.min(), xs.max(), ys.max())

    # Bottom logos strip
    bottom = arr[900:, :]
    bmask = (bottom < 240).any(axis=2)
    ys, xs = np.where(bmask)
    if len(xs):
        print("bottom blob bbox relative", xs.min(), ys.min() + 900, xs.max(), ys.max() + 900)

    # Top-right logo
    tr = arr[:350, 1100:]
    tmask = (tr < 240).any(axis=2)
    ys, xs = np.where(tmask)
    if len(xs):
        print("top-right blob", xs.min() + 1100, ys.min(), xs.max() + 1100, ys.max())

    # Signature area
    br = arr[750:, 1150:]
    smask = (br < 240).any(axis=2)
    ys, xs = np.where(smask)
    if len(xs):
        print("bottom-right blob", xs.min() + 1150, ys.min() + 750, xs.max() + 1150, ys.max() + 750)

    # Skill/MSME center-bottom: look at mid columns bottom
    mid = arr[900:, 700:1100]
    mm = (mid < 240).any(axis=2)
    ys, xs = np.where(mm)
    if len(xs):
        print("mid-bottom blob", xs.min() + 700, ys.min() + 900, xs.max() + 700, ys.max() + 900)
    else:
        print("no mid-bottom content in 900+")
        mid2 = arr[850:, 650:1150]
        mm2 = (mid2 < 240).any(axis=2)
        ys, xs = np.where(mm2)
        if len(xs):
            print("mid-bottom blob2", xs.min() + 650, ys.min() + 850, xs.max() + 650, ys.max() + 850)


if __name__ == "__main__":
    main()
