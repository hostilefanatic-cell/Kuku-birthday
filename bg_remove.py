"""
Batch background remover for the birthday invite.

Reads images from ./raw/, strips the background with rembg, auto-crops
transparent margins, and writes them into ./photos/ with the names the
website expects:

  photos/photo-1.png, photo-2.png, ...   <- flip-card slots
  photos/cake.png                        <- final hero card

Naming rules for files in raw/:
  - Any filename containing "cake" (case-insensitive) becomes cake.png.
  - Everything else is sorted alphabetically and numbered photo-N.png.
    Tip: prefix with 01_, 02_, ... to control order.

Run:  python bg_remove.py
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

from PIL import Image
from rembg import new_session, remove

ROOT = Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT / "photos"
SUPPORTED = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".bmp"}
MODEL = "u2net"  # general-purpose; "u2net_human_seg" or "isnet-general-use" also work


def autocrop_alpha(img: Image.Image, padding: int = 8) -> Image.Image:
    """Trim fully transparent border, then add a small uniform padding."""
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    bbox = img.split()[-1].getbbox()
    if bbox is None:
        return img
    cropped = img.crop(bbox)
    if padding <= 0:
        return cropped
    w, h = cropped.size
    padded = Image.new("RGBA", (w + padding * 2, h + padding * 2), (0, 0, 0, 0))
    padded.paste(cropped, (padding, padding))
    return padded


def process(src: Path, dst: Path, session) -> None:
    print(f"  -> {src.name}", flush=True)
    with src.open("rb") as f:
        raw_bytes = f.read()
    out_bytes = remove(raw_bytes, session=session)
    img = Image.open(io.BytesIO(out_bytes))
    img = autocrop_alpha(img, padding=12)
    dst.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst, format="PNG", optimize=True)


def main() -> int:
    if not RAW.exists():
        print(f"raw/ folder not found at {RAW}. Create it and drop your photos in.")
        return 1

    files = sorted(p for p in RAW.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED)
    if not files:
        print(f"No images found in {RAW}. Drop JPG/PNG/WEBP files in there and re-run.")
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    print(f"Loading rembg session (model: {MODEL})... first run downloads ~170MB.", flush=True)
    session = new_session(MODEL)

    cake_files = [p for p in files if "cake" in p.stem.lower()]
    flip_files = [p for p in files if p not in cake_files]

    print(f"\nProcessing {len(flip_files)} flip-card photo(s):", flush=True)
    for i, src in enumerate(flip_files, start=1):
        process(src, OUT / f"photo-{i}.png", session)

    if cake_files:
        print(f"\nProcessing cake photo: {cake_files[0].name}", flush=True)
        process(cake_files[0], OUT / "cake.png", session)
    else:
        print("\nNo file containing 'cake' in its name — skipping cake.png.")

    print(f"\nDone. {len(flip_files)} flip card(s) + {1 if cake_files else 0} cake photo written to {OUT}.")
    print(f"Set 'Number of flip cards' in the Tweaks panel to {len(flip_files)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
