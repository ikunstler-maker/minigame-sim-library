"""Side-by-side: reference frame | our canvas, for each ours_<t>.png in a folder.

Usage: python tools/qa/plate-compare.py <outDir> [crop x0 y0 x1 y1]
Writes <outDir>/cmp_<t>.jpg (and crops when a box is given).
"""
import glob
import os
import subprocess
import sys

import imageio_ffmpeg
from PIL import Image

out = sys.argv[1]
box = tuple(int(v) for v in sys.argv[2:6]) if len(sys.argv) >= 6 else None
ff = imageio_ffmpeg.get_ffmpeg_exe()
video = os.path.join(os.path.dirname(__file__), '..', '..', 'Assets', 'ref CV 1125.mp4')
for f in sorted(glob.glob(os.path.join(out, 'ours_*.png'))):
    t = os.path.basename(f)[5:-4]
    ref = os.path.join(out, f'ref_{t}.png')
    if not os.path.exists(ref):
        subprocess.run([ff, '-v', 'error', '-y', '-ss', t, '-i', video, '-frames:v', '1', '-vf', 'crop=1080:2340:0:3', ref], check=True)
    a, b = Image.open(ref).convert('RGB'), Image.open(f).convert('RGB')
    if box:
        a, b = a.crop(box), b.crop(box)
    w, h = a.size
    sheet = Image.new('RGB', (w * 2 + 10, h), 'white')
    sheet.paste(a, (0, 0))
    sheet.paste(b, (w + 10, 0))
    if not box:
        sheet = sheet.resize((sheet.width // 2, sheet.height // 2))
    name = f'cmp_{t}' + ('_crop' if box else '') + '.jpg'
    sheet.save(os.path.join(out, name), quality=85)
    print(name)
