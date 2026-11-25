"""Encode the Coin Volcano "video plate" from the reference take.

Usage: python -I build_plate_video.py [reference.mp4] [out_dir]

Defaults:
  reference = Assets/ref CV 1125.mp4           (proprietary, gitignored)
  out_dir   = public/private/coin-volcano/plate (gitignored, local builds only)

What it does:
- Crops 1080x2346 -> 1080x2340 (3 px off the top and the bottom) so the plate
  matches the stage 1:1.
- Keeps frames 0..LAST_FRAME only. The reference shows a bank push sliding in
  from the top at frame 1168 (38.933 s); the dark top band starts to brighten
  from frame 1161 (the push shadow), so the last clean frame is 1160 (38.667 s)
  and the plate is exactly 1161 frames = 38.7 s long. That also matches the
  separated soundtrack audio.m4a (38.70 s).
- No audio (the soundtrack is a separate file played through the AudioBus).
- H.264 High, yuv420p, 30 fps, CRF 23, GOP 30, +faststart.
- Writes poster.jpg = frame 0.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REF = ROOT / "Assets" / "ref CV 1125.mp4"
DEFAULT_OUT = ROOT / "public" / "private" / "coin-volcano" / "plate"

FPS = 30
LAST_FRAME = 1160  # last clean frame before the bank push (see docstring)
CROP = "crop=1080:2340:0:3"
CRF = 23  # the plate is fully preloaded into memory, so size matters more than seek speed
GOP = 30


def ffmpeg_exe() -> str:
    """$FFMPEG, else imageio-ffmpeg's bundled binary, else ffmpeg on PATH.

    Note: `python -I` hides user site-packages, so run this script without -I
    when imageio-ffmpeg is installed with `pip install --user`.
    """
    import os

    if os.environ.get("FFMPEG"):
        return os.environ["FFMPEG"]
    try:
        import imageio_ffmpeg  # pip install imageio-ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return "ffmpeg"


def run(args: list[str]) -> None:
    print(" ".join(f'"{a}"' if " " in a else a for a in args))
    subprocess.run(args, check=True)


def main() -> None:
    ref = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_REF
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT
    if not ref.is_file():
        sys.exit(f"reference not found: {ref}")
    out_dir.mkdir(parents=True, exist_ok=True)
    ff = ffmpeg_exe()
    frames = LAST_FRAME + 1

    run([
        ff, "-hide_banner", "-loglevel", "warning", "-y",
        "-i", str(ref),
        "-an",
        "-vf", f"{CROP},fps={FPS}",
        "-frames:v", str(frames),
        "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-preset", "slow", "-crf", str(CRF),
        "-g", str(GOP), "-keyint_min", str(GOP), "-sc_threshold", "0",
        "-r", str(FPS),
        "-movflags", "+faststart",
        str(out_dir / "plate.mp4"),
    ])
    run([
        ff, "-hide_banner", "-loglevel", "warning", "-y",
        "-i", str(ref),
        "-vf", CROP, "-frames:v", "1", "-q:v", "2",
        str(out_dir / "poster.jpg"),
    ])
    print(f"plate: {frames} frames = {frames / FPS:.3f} s -> {out_dir}")


if __name__ == "__main__":
    main()
