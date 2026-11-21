"""Audit certificate PNG assets for broken transparency / black boxes."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DIRS = [
    ROOT / "frontend" / "public" / "certificate",
    ROOT / "backend" / "assets" / "certificate",
]
NAMES = ["medal.png", "cloudvaathi-logo.png", "signature.png", "skill-india.png", "msme.png"]


def audit(path: Path) -> dict:
    im = Image.open(path).convert("RGBA")
    arr = np.asarray(im)
    rgb, a = arr[:, :, :3], arr[:, :, 3]
    total = arr.shape[0] * arr.shape[1]
    transparent = int((a < 16).sum())
    opaque = int((a >= 240).sum())
    black_opaque = int(((rgb < 20).all(axis=2) & (a >= 240)).sum())
    white_opaque = int(((rgb > 245).all(axis=2) & (a >= 240)).sum())
    edge = np.concatenate([
        a[0, :], a[-1, :], a[:, 0], a[:, -1]
    ])
    edge_opaque_pct = float((edge >= 240).mean() * 100)
    return {
        "size": im.size,
        "bytes": path.stat().st_size,
        "transparent_pct": round(transparent / total * 100, 1),
        "opaque_pct": round(opaque / total * 100, 1),
        "black_opaque_pct": round(black_opaque / total * 100, 1),
        "white_opaque_pct": round(white_opaque / total * 100, 1),
        "edge_opaque_pct": round(edge_opaque_pct, 1),
        "issue": (
            "BLACK_BOX" if black_opaque / total > 0.25
            else "NO_TRANSPARENCY" if transparent / total < 0.05
            else "OPAQUE_EDGES" if edge_opaque_pct > 40
            else "OK"
        ),
    }


def main() -> None:
    for base in DIRS:
        print(f"\n=== {base} ===")
        for name in NAMES:
            path = base / name
            if not path.exists():
                print(f"{name}: MISSING")
                continue
            info = audit(path)
            print(f"{name}: {info}")


if __name__ == "__main__":
    main()
