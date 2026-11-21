"""Side-by-side / diff helper for certificate alignment checks."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
REF = ROOT / "frontend" / "public" / "certificate" / "reference-certificate.png"
DEMO = ROOT / "backend" / "generated" / "demo-rubesh-azure.png"
OUT = ROOT / "backend" / "generated" / "compare-rubesh-vs-reference.png"


def main() -> None:
    ref = Image.open(REF).convert("RGB")
    demo = Image.open(DEMO).convert("RGB")
    # Normalize both to A4 pt * 2 (deviceScaleFactor=2) = 1684x1190 if demo is that size
    target = (1684, 1190)
    ref_r = ref.resize(target, Image.Resampling.LANCZOS)
    demo_r = demo.resize(target, Image.Resampling.LANCZOS)

    a = np.asarray(ref_r).astype(np.int16)
    b = np.asarray(demo_r).astype(np.int16)
    diff = np.abs(a - b).mean(axis=2)
    mean_diff = float(diff.mean())
    pct = float((diff > 25).mean() * 100)
    print(f"ref={ref.size} demo={demo.size} target={target}")
    print(f"mean abs diff={mean_diff:.2f}  pct pixels>25={pct:.2f}%")

    # Heatmap
    heat = (np.clip(diff, 0, 80) / 80.0 * 255).astype(np.uint8)
    heat_rgb = np.stack([heat, np.zeros_like(heat), 255 - heat], axis=2)
    heat_im = Image.fromarray(heat_rgb, "RGB")

    # Side-by-side strip
    canvas = Image.new("RGB", (target[0] * 2 + 40, target[1] + 60), (255, 255, 255))
    canvas.paste(ref_r, (0, 40))
    canvas.paste(demo_r, (target[0] + 40, 40))
    draw = ImageDraw.Draw(canvas)
    draw.text((20, 10), "REFERENCE", fill=(0, 0, 0))
    draw.text((target[0] + 60, 10), "GENERATED", fill=(0, 0, 0))
    canvas.save(OUT)
    heat_im.save(OUT.with_name("compare-diff-heatmap.png"))
    print("wrote", OUT)
    print("wrote", OUT.with_name("compare-diff-heatmap.png"))


if __name__ == "__main__":
    main()
