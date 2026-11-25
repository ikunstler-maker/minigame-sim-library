"""Cut a 5x8 iOS icon sheet into clean, transparent-cornered PNGs.

Usage: python -I cut_ios_icons.py <sheet.jpg> <out_dir>

- Finds the grid from the dark icon bodies.
- Removes the translucent "@ApplesClubs" watermark pill over row 4 by
  inverting the alpha blend (per-channel constants measured on the sheet).
- Applies an anti-aliased rounded-square mask so no white sheet corners remain.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

NAMES = [
    "books", "calculator", "calendar", "camera", "clock",
    "facetime", "files", "find-my", "notes", "contacts",
    "health", "phone", "home", "itunes-store", "photos",
    "maps", "wallet", "messages", "music", "mail",
    "reminders", "safari", "settings", "shortcuts", "app-store",
    "weather", "airdrop", "tv", "voice-memos", "watch",
    "translate", "testflight", "magnifier", "freeform", "fitness",
    "measure", "news", "passwords", "stocks", "podcasts",
]
LABELS = {
    "find-my": "Find My", "itunes-store": "iTunes Store", "app-store": "App Store",
    "voice-memos": "Voice Memos", "tv": "TV", "testflight": "TestFlight",
}
OUT_SIZE = 192
RADIUS = 0.235  # iOS icon corner radius as a fraction of the side
INSET = 4       # px trimmed from each edge so no sheet-white fringe survives

# Watermark blend constants: observed = orig * (1 - a) + k, per channel (R, G, B).
WM_A = np.array([0.223, 0.201, 0.219])
WM_K = np.array([30.2, 14.6, 29.1])


def runs(v, th, min_len=60):
    out, s = [], None
    for i, x in enumerate(v):
        if x > th and s is None:
            s = i
        if x <= th and s is not None:
            out.append((s, i))
            s = None
    if s is not None:
        out.append((s, len(v)))
    return [r for r in out if r[1] - r[0] > min_len]


def remove_watermark(a: np.ndarray, row: tuple[int, int]) -> None:
    """Invert the pill blend in the top band of one icon row (in place)."""
    y0 = row[0] - 2
    # Pill rows: find where the band above the icons is tinted (not pure white).
    probe = a[row[0] - 18]  # a line inside the pill, above the icons
    pill_x = (probe.min(axis=1) < 246) & (probe.min(axis=1) > 150)
    # Bottom edge of the pill inside the icons: where the pink tint stops.
    y1 = y0
    for y in range(row[0], row[0] + 60):
        line = a[y, pill_x]
        tint = (line[:, 0] - line[:, 1]).mean()
        if tint < 6:
            break
        y1 = y
    band = a[y0:y1 + 1, :][:, pill_x].astype(float)
    fixed = (band - WM_K) / (1 - WM_A)
    a[y0:y1 + 1, pill_x] = np.clip(fixed, 0, 255).astype(a.dtype)
    # Text residue: where the icon body is plain, copy the mirrored clean bottom edge
    # (icons are vertically symmetric in shape). Saturated artwork is left as is.
    h = y1 + 1 - y0
    top = a[y0:y1 + 1]
    mirror = a[row[1] - 1 - np.arange(h) + (y0 - row[0])][:, :]
    m_lum = mirror.mean(axis=2)
    m_sat = mirror.max(axis=2) - mirror.min(axis=2)
    t_sat = top.max(axis=2) - top.min(axis=2)
    plain = (m_lum < 45) & (m_sat < 15) & (t_sat < 90)
    outside = (m_lum > 200) & (m_sat < 20)  # sheet white beyond the rounded corner
    plain |= outside
    plain[:, ~pill_x] = False
    top[plain] = mirror[plain]


def mask(size: int) -> Image.Image:
    ss = 4
    m = Image.new("L", (size * ss, size * ss), 0)
    inset = INSET * ss
    ImageDraw.Draw(m).rounded_rectangle(
        (inset, inset, size * ss - inset - 1, size * ss - inset - 1),
        radius=int(size * ss * RADIUS), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def main(sheet: str, out_dir: str) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    a = np.asarray(Image.open(sheet).convert("RGB")).copy()
    dark = a.max(axis=2) < 120
    cols = runs(dark.mean(axis=0), 0.15)
    rows = runs(dark.mean(axis=1), 0.15)
    assert len(cols) == 5 and len(rows) == 8, (cols, rows)
    remove_watermark(a, rows[3])
    img = Image.fromarray(a)
    m = mask(OUT_SIZE)
    manifest = []
    for r, (y0, y1) in enumerate(rows):
        for c, (x0, x1) in enumerate(cols):
            # Tight box of this icon: non-white pixels inside the padded cell.
            pad = 18
            cell = a[y0 - pad:y1 + pad, x0 - pad:x1 + pad]
            ink = cell.min(axis=2) < 200
            ys, xs = np.where(ink)
            # Ignore thin noise: use rows/cols with a solid run of ink.
            rows_ok = np.where(ink.sum(axis=1) > 60)[0]
            cols_ok = np.where(ink.sum(axis=0) > 60)[0]
            ty0, ty1 = rows_ok[0] + y0 - pad, rows_ok[-1] + y0 - pad + 1
            tx0, tx1 = cols_ok[0] + x0 - pad, cols_ok[-1] + x0 - pad + 1
            if r == 3:  # watermark rows are not reliable for the top edge
                ty0 = ty1 - (tx1 - tx0)
            cx, cy = (tx0 + tx1) / 2, (ty0 + ty1) / 2
            side = max(tx1 - tx0, ty1 - ty0)
            box = (round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2))
            icon = img.crop(box).resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS).convert("RGBA")
            icon.putalpha(m)
            name = NAMES[r * 5 + c]
            icon.save(out / f"{name}.png", optimize=True)
            label = LABELS.get(name, name.replace("-", " ").title())
            manifest.append({"id": name, "label": label, "file": f"{name}.png"})
    (out / "icons.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(f"wrote {len(manifest)} icons to {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
