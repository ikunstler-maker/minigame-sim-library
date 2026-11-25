# Stage 3 — game layers: what exists, what must be rebuilt

Source: `Assets/` (3OAKS kit). All reference screens are landscape 1280x720
desktop/marketing shots; the phone build is portrait, so layers are re-composed.

## Screens seen in the kit
| Screen | Content |
|---|---|
| Screen_0 | Intro: Mystery → prizes, multiplier cells, Coin Collect → 60x. "TAP ANYWHERE TO START!" |
| screen_1 | Big-win splash: "COIN VOLCANO" medallion, coin burst |
| screen_2 | Base game, purple: 3x3 grid, Mystery Jackpot / Mystery / 90.00 coin with x3 |
| screen_3 | Ultra Bonus Game intro (red) |
| screen_4, 5, 6, 9 | Bonus game (red bg): coins with values, x2/x3/x4/x6 cell multipliers, Coin Collect whirl, RESPINS counter, MINI/MINOR/MAJOR coins, total bar 80.00 |
| screen_7 | "CASH EXPLOSION 1,865.12" big-win with volcano + coin fountain (the "Sizzling" equivalent) |
| screen_8 | Buy Bonus panel (Bonus Game $300 / Ultra $750) |

Common UI: jackpot plates GRAND / MAJOR / MINOR / MINI on top, volcano + logo left,
right rail (menu, sound, turbo, spin/respins, auto, bet), bottom labels
Total win / Balance / Bet. Labels and numbers are text → drawn by code.

## Layers available as files
- `Symbols/sym1..8.png` — symbol art, transparent (Mystery, Mystery Jackpot, coins, …).
- `Logos/logo_*.png` — logo in en / th / zh / zh-hunt.
- `Backgrounds/CV_background_*` — fire burst background (bonus / big win).
- `Icons/`, `Thumbs/` — store icon and thumbnails.

## Layers to rebuild (cut from screens + clean up, or redraw)
1. Purple base background, portrait.
2. Red bonus background, portrait.
3. 3x3 grid frame (gold rim, dark-red cells).
4. Empty coins: gold, red; MINI / MINOR / MAJOR / GRAND coin rims without text.
5. Jackpot plates GRAND / MAJOR / MINOR / MINI without numbers.
6. Volcano (left side) and volcano for the big win.
7. Coin Collect whirl.
8. Right-rail buttons (flat white icons → vector).
9. "CASH EXPLOSION" title, RESPINS badge, total-win bar.

Values on coins, plates, balance and bet are rendered as text with the game's
gradient/stroke style so currency and amounts stay configurable.
