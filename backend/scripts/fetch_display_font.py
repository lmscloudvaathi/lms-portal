"""Download the certificate display font (Norwester) and Source Serif if missing."""
from __future__ import annotations

import io
import zipfile
from pathlib import Path
from urllib.request import Request, urlopen

FONTS = Path(__file__).resolve().parents[1] / "assets" / "fonts"
UA = "Mozilla/5.0 (compatible; CloudVaathiCertBot/1.0)"

CANDIDATES = [
    # League of Moveable Type mirrors / known hosts
    ("https://github.com/theleagueof/norwester/releases/download/1.0/norwester.zip", "zip"),
    ("https://fontlibrary.org/assets/downloads/norwester/5902bb3c5f4a75f3ccac699bc116b41b/norwester.zip", "zip"),
    ("https://cdn.fontshare.com/wf/XXXX", "skip"),
    ("https://dl.dafont.com/dl/?f=norwester", "zip"),
]


def download(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=60) as resp:
        return resp.read()


def save_from_zip(data: bytes, dest_stem: str = "Norwester") -> Path | None:
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for name in zf.namelist():
            lower = name.lower()
            if lower.endswith((".otf", ".ttf")) and "norwester" in lower.replace(" ", ""):
                out = FONTS / f"{dest_stem}{Path(name).suffix.lower()}"
                out.write_bytes(zf.read(name))
                return out
            if lower.endswith((".otf", ".ttf")) and Path(name).name.lower().startswith("n"):
                out = FONTS / f"{dest_stem}{Path(name).suffix.lower()}"
                out.write_bytes(zf.read(name))
                return out
    return None


def main() -> None:
    FONTS.mkdir(parents=True, exist_ok=True)
    existing = list(FONTS.glob("Norwester.*")) + list(FONTS.glob("norwester.*"))
    if existing:
        print("already have", existing[0])
        return

    # Prefer a direct OTF if a public CDN has it.
    direct = [
        "https://cdn.jsdelivr.net/gh/pronaypeddiraju/fonts@master/Norwester.otf",
        "https://cdn.jsdelivr.net/gh/bitbybit-dev/fonts@main/Norwester.otf",
        "https://raw.githack.com/theleagueof/norwester/master/norwester.otf",
    ]
    for url in direct:
        try:
            data = download(url)
            if len(data) > 5000 and data[:4] in {b"OTTO", b"\x00\x01\x00\x00", b"true", b"wOFF"}:
                out = FONTS / ("Norwester.otf" if data[:4] == b"OTTO" else "Norwester.ttf")
                if data[:4] == b"wOFF":
                    out = FONTS / "Norwester.woff"
                out.write_bytes(data)
                print("saved", out, len(data), "from", url)
                return
            print("skip bad payload", url, len(data))
        except Exception as exc:
            print("fail", url, type(exc).__name__, exc)

    for url, kind in CANDIDATES:
        if kind == "skip":
            continue
        try:
            data = download(url)
            print("got", url, len(data), data[:4])
            if kind == "zip" or data[:2] == b"PK":
                path = save_from_zip(data)
                if path:
                    print("extracted", path, path.stat().st_size)
                    return
            elif len(data) > 5000:
                out = FONTS / "Norwester.otf"
                out.write_bytes(data)
                print("saved direct", out)
                return
        except Exception as exc:
            print("fail", url, type(exc).__name__, exc)

    print("FAILED to fetch Norwester; will fall back to Oswald at render time")


if __name__ == "__main__":
    main()
