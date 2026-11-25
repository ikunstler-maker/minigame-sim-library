# Split the reference take's audio into stems with Demucs (htdemucs_6s:
# drums / bass / other / vocals / guitar / piano). Game SFX land mostly in
# "drums" and "other"; music in bass / piano / guitar / other.
# Usage: powershell -File tools/asset-pipeline/separate_audio.ps1
$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot/../.."
$video = Join-Path $root 'Assets/ref CV 1125.mp4'
$out = Join-Path $root 'Assets/ref-audio'
New-Item -ItemType Directory -Force $out | Out-Null
$ff = python -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"
& $ff -v error -y -i $video -vn -ac 2 -ar 44100 (Join-Path $out 'full-mix.wav')
python -m demucs -n htdemucs_6s -o (Join-Path $out 'stems') (Join-Path $out 'full-mix.wav')
