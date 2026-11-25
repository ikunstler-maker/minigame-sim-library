# Stage 3–4 plan — rebuild of the reference take `Assets/ref CV 1125.mp4`

Reference: 40.7 s, 1080x2346, 30 fps, AAC stereo. It is an iPhone recording of the
mobile (portrait) game. Our stage (1080x2340) matches it 1:1 in width.

## Timeline of the reference (what we reproduce)
| t (s) | Scene | What happens |
|---|---|---|
| 0.0–1.0 | Base, purple | Board: MINOR coin, 200, 400. Jackpots GRAND 25,000 / MAJOR 2,500 / MINOR 1,000 / MINI 500. Bet 0.20 |
| 1.0–4.5 | Base spin | Symbols drop in per column; MYSTERY turns into 50.00; coins 150 / 50 / 100 land; Coin Collect whirl lands bottom-right |
| 5.0–7.0 | Trigger | 6+ coins flare and pulse (bonus trigger) |
| 7.5–8.0 | Transition | Coin ring spins, then a white-yellow sun burst fills the screen |
| 8.5–10.5 | BONUS GAME splash | Red intro: GRAND JACKPOT 500x, MAJOR x2, Coin Collect 1x/9x→60x, TAP ANYWHERE TO START |
| 10.5–19.5 | Bonus respins | Red board, respin pips 1-2-3, spin button shows 3→2→1; whirl pulls fire trails from coins, its value counts up to 900 |
| 20–23.5 | Respins land | New coins 100 / 50, MYSTERY reveal; counter resets to 3 |
| 24–25 | Multiplier | Full-screen flash, big **X4** in the centre cell |
| 25.5–30 | Collect | Fire trails pull every coin into the total bar under the grid: 100 → … → 1,950; coins dim |
| 30.5–38.5 | Big win "SIZZLING" | Volcano erupts, coin fountain, count-up 702 → 7,800.00 (= 1,950 × 4); balance 7,800 |
| 39.0–40.7 | Push + exit | In the reference a bank push appears — **replaced** by our game push and the user's own layout page (decision D2) |

## What I build (order of work)
1. **Layer extraction** (`tools/asset-pipeline/`): key frames from the video at full
   resolution → cut static layers: purple and red backgrounds, grid frame and cells,
   jackpot plates, volcano + logo, coins (gold / red / MINI / MINOR / MAJOR rims),
   Coin Collect whirl, spin / auto / turbo / menu / sound / bet buttons, respin pips,
   total bar, "BONUS GAME" splash parts, "SIZZLING" title, big-win volcano.
   Numbers are removed from plates and coins (clean-up / inpaint) and redrawn as text.
   `Assets/Symbols` and `Assets/Logos` are used where they match better.
2. **Number font**: the game font (rounded heavy, gold gradient, dark outline) as a
   PixiJS text style — gradient fill, stroke, drop shadow — for coins, plates, counters.
3. **Game plugin** `src/games/coin-volcano/` on a `GamePlugin` interface, driven by a
   **script** (JSON timeline): board states, landings, collects, multiplier, win.
   All values configurable in Studio: jackpots, bet, coin values, multiplier, currency.
   The final win is computed, e.g. sum × multiplier (1,950 × 4 = 7,800).
4. **Effects** with PixiJS: drop-in with bounce, coin flare, fire trails (particle
   ribbons), whirl rotation, sun burst, screen flash, X4 punch, coin fountain with
   gravity and spin (60 fps), count-ups with easing. Timings taken frame by frame from
   the reference.
5. **Sound** (see below) wired to the same script events, through the AudioBus so it
   is recorded.
6. **Calibration overlay** in Preview: the reference frame at 40 % opacity over the
   canvas, frame picker by time, to match positions pixel by pixel.
7. After the big win → our push (Stage 5) → the user's layout page.

## Limits — where "identical" needs more than the video
- **Animated effects** (fire trails, whirl, explosions, flames, coin spin) in the real
  game are sprite sheets / Spine animations. From a compressed video I can get the
  look close, not frame-identical. Identical needs the original animation files
  (Spine `.json/.atlas/.png`, sprite sheets, or After Effects exports).
- **Static layers** cut from video frames are softer than the originals (H.264,
  glow over edges). The originals (PSD / PNG layers) would be sharp.
- **Sounds**: the video has a continuous music bed under every effect (never below
  ~-48 dB), so clean separate SFX **cannot** be cut from it. Options:
  - A. Use the whole soundtrack of the take as one track, synced to our timeline
    (sounds identical; timeline lengths stay fixed to the reference).
  - B. Cut each effect as a segment with music under it (usable, not clean).
  - C. Machine separation (Demucs) — partial, artefacts likely.
  - D. Original sound files from the studio — clean and identical.
- **Font**: the game's number/title font file. Without it I use the closest free
  rounded heavy font plus gradient and outline.
