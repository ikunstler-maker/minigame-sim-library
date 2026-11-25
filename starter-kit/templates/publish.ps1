# PROTOTYPE - NOT FOR PRODUCTION
# Question: Чи весело бігати й ховатися на хаотичному даху в трьох режимах, з живими гравцями й ботами?
# Date: 2026-11-18
#
# Sends the committed game to its two homes: the private GitHub copy (see $repo below) and itch.io.
#   powershell -ExecutionPolicy Bypass -File publish.ps1 -Message "iteration 7: ..."
# Run one-shot-share.sh first so dist/ is fresh.
param([Parameter(Mandatory = $true)][string]$Message)

$game = $PSScriptRoot
$repo = "C:\Users\Admin\Documents\GitHub\<NEW-GAME-REPO>"   # fill in: the private repo made in GitHub Desktop
$butler = "C:\Users\Admin\Documents\PROGRAMS\butler\butler.exe"
$itch = Join-Path $game "itch-build"

# 1. GitHub: copy the game (no build folders, no zips) and push.
robocopy $game $repo /E /XD dist itch-build node_modules /XF *.zip /NFL /NDL /NJH /NJS | Out-Null
git -C $repo add -A 2>$null
git -C $repo commit -q -m $Message -m "Copied from my-code-game/prototypes/rooftop-hide-and-seek. Brief: brief.md" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" 2>$null
$env:GCM_INTERACTIVE = "never"
git -C $repo push -q origin main 2>$null
Write-Output ("github: " + (git -C $repo log --oneline -1))

# 2. itch.io: exactly the files a player needs, then butler.
if (Test-Path $itch) { Get-ChildItem $itch -Recurse -File | Remove-Item -Force }
New-Item -ItemType Directory -Force (Join-Path $itch "vendor"), (Join-Path $itch "assets") | Out-Null
Copy-Item (Join-Path $game "dist\index.html"), (Join-Path $game "dist\config.js") $itch -Force
Copy-Item (Join-Path $game "dist\vendor\three.js") (Join-Path $itch "vendor") -Force
Copy-Item (Join-Path $game "dist\assets\models.js") (Join-Path $itch "assets") -Force
& $butler push $itch ikunstler/<itch-project-slug>:html5 2>&1 | Select-Object -Last 1
