# Stage 3b — element-based Coin Volcano (variant "code")

Goal (user, 2026-11-25): no video under the coins. Every symbol and number is our own
element, so all values can change in Studio with no overlap artefacts. The plate
variant stays for side-by-side comparison (Studio → Game → Version).

## What is drawn from where
| Layer | Source | Notes |
|---|---|---|
| Board backgrounds (purple base, red bonus) incl. empty 3x3 cells, grid frame | Cut from reference frames; empty cells rebuilt by taking each cell from a frame where it is empty (per-cell median) | Static images |
| Jackpot plates GRAND/MAJOR/MINOR/MINI without digits | Already built (inpainted patches) → full plate images | Numbers = our text |
| Logo + volcano | `Assets/Logos/logo_en*.png` + volcano cut from frames | Bonus volcano glow = code |
| Bottom UI bar, Spin / Auto / Turbo / Menu / Sound / Bet buttons, respin pips | Cut from frames | Spin shows respin digit as text |
| Coins gold / red, MINI / MINOR / MAJOR, Mystery, Mystery Jackpot, Coin Collect whirl | `Assets/Symbols/sym1..8` | Exact art from the kit |
| Spin drop, landing bounce, coin pulse/flare, Mystery reveal, whirl spin, fire trails to the whirl and to the total bar, respin counter, X4 punch, total bar count, coin dimming | Code (PixiJS), timings measured from the reference frame by frame | Close to the original, not frame-identical |
| Full-screen moments with no configurable symbols: base→bonus sun-burst transition, BONUS GAME splash, SIZZLING eruption + coin fountain | Video segments of the reference (identical), our numbers on top | Same as now |
| Sound | Current soundtrack (full / effects only), events synced to the script | Unchanged |

## Script
The take becomes data (`script.json`): board before the spin, what lands per column,
Mystery results, whirl collects, respins, multiplier cell, collect order. Values come
from Studio; totals are computed (total = Σ coins, win = total × multiplier).
Multiplier becomes configurable too (X2…X10), since it is drawn by code.

## Limits
- Fire trails, flares and the volcano glow are coded effects: very close, not identical.
- Static layers cut from video frames are as sharp as the video (H.264 1080 px).

## Work split (orchestration)
1. Layers: board backgrounds with empty cells, plates, UI, logo/volcano → PNGs.
2. Engine: symbol grid, script runner, animations, counters, Studio fields.
3. Effects: fire trails, flare, whirl, X4 punch, transitions/video inserts.
Integration, comparison against the reference and publishing: orchestrator.
