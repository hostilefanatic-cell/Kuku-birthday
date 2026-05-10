"""
AI-based subject isolator for the birthday invite.

Sends each image in ./raw/ to an OpenRouter image-editing model with a
prompt that strips out everything except the baby (and the cake, for the
final shot) on a pure white background. Saves results to ./photos/ with
the names the website expects:

  photos/photo-1.png, photo-2.png, ...   <- flip-card slots
  photos/cake.png                        <- final hero card

Naming rules for files in raw/:
  - Any filename containing "cake" (case-insensitive) becomes cake.png
    and gets the cake-keeping prompt.
  - Everything else is sorted alphabetically and numbered photo-N.png.
    Prefix with 01_, 02_, ... to control order.

Setup:
  1. Get an OpenRouter API key: https://openrouter.ai/keys
  2. Set it in your shell:
       PowerShell:  $env:OPENROUTER_API_KEY = "sk-or-..."
       cmd:         set OPENROUTER_API_KEY=sk-or-...
  3. (Optional) Pick a model:
       $env:OPENROUTER_MODEL = "openai/gpt-5-image-mini"   # cheaper
       $env:OPENROUTER_MODEL = "openai/gpt-5-image"        # higher quality
       $env:OPENROUTER_MODEL = "google/gemini-2.5-flash-image"  # fallback
     Default: openai/gpt-5-image-mini
  4. pip install requests
  5. python ai_isolate.py

Pass --dry-run to print what would happen without spending API credits.
Pass --keep-bg to skip the rembg post-pass that removes any leftover
near-white border (on by default since the model occasionally emits
faint off-white edges).
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
import time
from pathlib import Path

import requests
from PIL import Image

ROOT = Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT / "photos"
SUPPORTED = {".jpg", ".jpeg", ".png", ".webp"}

API_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-5-image-mini"

# Prompt for ordinary flip-card photos: strip everything except the baby.
PROMPT_BABY = """Take the baby in this reference photo and place her on a pure white background. Keep her exactly as she appears in the original photo: same face, same expression, same pose, same outfit, same hair, same skin tone, same lighting on her body. Do not stylize. Do not redraw. Do not change her appearance. The output must look photographic and identical to the reference, just with everything except the baby removed.

REMOVE every other person (parents, siblings, any hands holding her), all props and toys, all furniture, all scenery, all walls, floor, sky, plants, any patterns, text, or watermarks.

KEEP the baby exactly as photographed: same skin tone, same outfit colors, same hair, same expression, same pose, same proportions, with all visible limbs and feet present and uncropped. Leave a small margin of empty white space around her on all sides.

BACKGROUND must be pure flat white (#FFFFFF), completely empty. No drop shadow under or behind her. No gradient, no vignette, no texture. Hard, clean edge between the baby and the white. No soft halo, no leftover color from the original background.

FORMAT: portrait orientation, roughly 4:5 aspect ratio, high resolution."""

# Prompt for the cake-blowing final hero shot: keep baby + cake + candle.
PROMPT_CAKE = """Take this reference photo and place the baby on a pure white background. Keep her exactly as she appears in the original photo: same face, same expression, same pose, same outfit, same hair, same skin tone, same lighting. Do not stylize. Do not redraw. The output must look photographic and identical to the reference, just with everything except the baby and her birthday cake removed.

KEEP the baby exactly as photographed AND keep the small birthday cake with its lit candle in front of her. The cake stays in its original photographic style with the candle's small warm flame visible.

REMOVE every other person (parents, siblings, hands), all furniture, all room background, walls, decorations behind, plates other than the cake's plate, drinks, and any text or watermarks.

BACKGROUND must be pure flat white (#FFFFFF), completely empty around the baby and cake. No drop shadow, no gradient, no vignette, no leftover color halo. Hard clean edge.

FORMAT: portrait orientation, roughly 4:5 aspect ratio, high resolution."""


def encode_image_data_url(path: Path) -> str:
    suffix = path.suffix.lower().lstrip(".")
    mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
    mime = mime_map.get(suffix, "application/octet-stream")
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def call_openrouter(image_path: Path, prompt: str, model: str, api_key: str) -> dict:
    payload = {
        "model": model,
        "modalities": ["image", "text"],
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": encode_image_data_url(image_path)}},
                ],
            }
        ],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://localhost/varnika-invite",
        "X-Title": "Varnika Birthday Invite",
    }
    resp = requests.post(API_URL, headers=headers, data=json.dumps(payload), timeout=300)
    if resp.status_code >= 400:
        raise RuntimeError(f"OpenRouter HTTP {resp.status_code}: {resp.text[:600]}")
    return resp.json()


def extract_image_bytes(api_response: dict) -> bytes | None:
    """Pull the first image out of an OpenRouter chat-completion response."""
    try:
        msg = api_response["choices"][0]["message"]
    except (KeyError, IndexError, TypeError):
        return None

    candidates = []

    # Format A: msg["images"] list with image_url entries
    for item in msg.get("images") or []:
        if isinstance(item, dict):
            url = (item.get("image_url") or {}).get("url") or item.get("url")
            if url:
                candidates.append(url)
        elif isinstance(item, str):
            candidates.append(item)

    # Format B: content array with image_url parts
    content = msg.get("content")
    if isinstance(content, list):
        for part in content:
            if isinstance(part, dict):
                if part.get("type") in ("image_url", "output_image", "image"):
                    url = (part.get("image_url") or {}).get("url") or part.get("url") or part.get("image")
                    if url:
                        candidates.append(url)

    for url in candidates:
        if url.startswith("data:"):
            try:
                _, b64data = url.split(",", 1)
                return base64.b64decode(b64data)
            except Exception:
                continue
        if url.startswith("http"):
            try:
                r = requests.get(url, timeout=120)
                r.raise_for_status()
                return r.content
            except Exception:
                continue
    return None


def maybe_clean_white(png_bytes: bytes, threshold: int = 245, padding: int = 12) -> bytes:
    """Convert near-white pixels to transparent, then auto-trim the alpha
    bbox and add a small uniform margin. Removes faint halos and lets
    the comic panel's color show through fully where the model left
    not-quite-pure-white."""
    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r >= threshold and g >= threshold and b >= threshold:
                px[x, y] = (r, g, b, 0)
    bbox = img.split()[-1].getbbox()
    if bbox:
        img = img.crop(bbox)
        if padding > 0:
            cw, ch = img.size
            padded = Image.new("RGBA", (cw + padding * 2, ch + padding * 2), (0, 0, 0, 0))
            padded.paste(img, (padding, padding))
            img = padded
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def main() -> int:
    ap = argparse.ArgumentParser(description="AI-isolate baby photos via OpenRouter.")
    ap.add_argument("--dry-run", action="store_true", help="List what would be processed, no API calls.")
    ap.add_argument("--keep-bg", action="store_true", help="Skip the near-white-to-transparent post-pass.")
    ap.add_argument("--model", default=os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL),
                    help=f"OpenRouter model id (default: {DEFAULT_MODEL}).")
    args = ap.parse_args()

    if not RAW.exists():
        print(f"raw/ folder not found at {RAW}. Create it and drop your photos in.")
        return 1

    files = sorted(p for p in RAW.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED)
    if not files:
        print(f"No images found in {RAW}. Drop JPG/PNG/WEBP files in there and re-run.")
        return 1

    cake_files = [p for p in files if "cake" in p.stem.lower()]
    flip_files = [p for p in files if p not in cake_files]

    print(f"Model: {args.model}")
    print(f"Found: {len(flip_files)} flip-card photo(s){' + 1 cake photo' if cake_files else ''}.\n")
    print("Will write:")
    for i, src in enumerate(flip_files, start=1):
        print(f"  raw/{src.name}  ->  photos/photo-{i}.png")
    if cake_files:
        print(f"  raw/{cake_files[0].name}  ->  photos/cake.png")
    print()

    if args.dry_run:
        print("Dry run only. Set OPENROUTER_API_KEY and re-run without --dry-run to actually generate.")
        return 0

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print("ERROR: OPENROUTER_API_KEY is not set.")
        print("Get a key at https://openrouter.ai/keys and set it:")
        print('  PowerShell: $env:OPENROUTER_API_KEY = "sk-or-..."')
        return 2

    OUT.mkdir(parents=True, exist_ok=True)

    jobs = [(src, OUT / f"photo-{i}.png", PROMPT_BABY) for i, src in enumerate(flip_files, start=1)]
    if cake_files:
        jobs.append((cake_files[0], OUT / "cake.png", PROMPT_CAKE))

    failures = []
    for src, dst, prompt in jobs:
        print(f"[{src.name}] -> {dst.name} ... ", end="", flush=True)
        t0 = time.time()
        try:
            resp = call_openrouter(src, prompt, args.model, api_key)
            img_bytes = extract_image_bytes(resp)
            if not img_bytes:
                # Model refused or returned no image. Show the text reply for diagnosis.
                text = ""
                try:
                    text = resp["choices"][0]["message"].get("content")
                    if isinstance(text, list):
                        text = " ".join(p.get("text", "") for p in text if isinstance(p, dict))
                except Exception:
                    pass
                print("NO IMAGE in response.")
                if text:
                    snippet = (text or "").strip()[:300]
                    print(f"   model said: {snippet}")
                failures.append(src.name)
                continue
            if not args.keep_bg:
                img_bytes = maybe_clean_white(img_bytes)
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(img_bytes)
            print(f"ok ({time.time() - t0:.1f}s, {len(img_bytes) // 1024} KB)")
        except Exception as e:
            print(f"FAILED: {e}")
            failures.append(src.name)

    print()
    if failures:
        print(f"{len(failures)} file(s) failed: {', '.join(failures)}")
        print("Common causes: model declined to process child imagery, network error, ")
        print("or wrong model id. Try a different model with --model or env var.")
        return 3

    print(f"Done. {len(flip_files)} flip card(s){' + cake' if cake_files else ''} written to {OUT}.")
    print(f"Set 'Number of flip cards' in the Tweaks panel to {len(flip_files)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
