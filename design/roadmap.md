# Roadmap — Coin Volcano internal presentation prototype

Goal: a phone-first web app (iPhone) that plays a scripted Coin Volcano session
inside a simulated iOS home screen and records it to an mp4 on the device, for an
internal company presentation. Key decisions: `design/decisions.md`.

Each stage ends with a check on the real iPhone before the next one starts.

## Stage 1 — Skeleton + on-device recording (highest risk)
- Vite + TypeScript + PixiJS v8 project, PWA manifest, GitHub Pages deploy.
- Two modes: Studio (HTML settings panel) and Preview (one 1080x1920 canvas).
- Test animation + synthesized test sound recorded via `canvas.captureStream` +
  `AudioContext.createMediaStreamDestination` + `MediaRecorder` (mp4 on iOS).
- Secret exit: triple-tap on the status-bar clock (DOM overlay, never recorded).
- Export screen: play back, Save/Share (`navigator.share` → Photos), Record again,
  Back to Studio.
- Done when: an mp4 recorded in Preview is saved to Photos on the iPhone.

## Stage 2 — iOS home screen
- Wallpaper, status bar (time, signal, battery), 4x6 icon grid, dock,
  2x2 weather widget (manual values).
- Studio: drag-and-drop icons, custom PNG icons, labels, weather fields.
- iOS-style zoom animation when the game icon is tapped.

## Stage 3 — Game: base mode
- Asset layers rebuilt identical to the reference (see decisions D5).
- Portrait 3x3 grid, logo, jackpot plates (Grand/Major/Minor/Mini), balance, bet,
  bottom UI bar; currency, locale and labels from the preset.
- Scripted spins: N spins before bonus, chosen landing coins.
- Calibration overlay: reference image at adjustable opacity over the canvas.

## Stage 4 — Game: bonus and big win
- BONUS GAME splash (TAP ANYWHERE TO START), respin counter 3-2-1.
- Coin Collect whirl absorbs coins, multiplier cells (x2/x3/...), total count-up.
- Big-win screen: volcano eruption, coin fountain particles, fast counter to target.
- Web Audio SFX mixed into the recording.

## Stage 5 — Push + custom layout page
- After the win: iOS push banner slides in (custom icon, title, body with
  `{{win}}` / `{{balance}}` placeholders).
- Tap on the push opens a blank layout page the user builds in Studio:
  own background, free-placed image and text blocks, one amount field.
- Amount animation modes: counter, spinner → instant, pull-to-refresh.
- Optional second push from the game ~3 s later.

## Stage 6 — Presets and polish
- Several presets (geo, currency, language); autosave in IndexedDB;
  JSON export/import.
- Timing pass, texture memory check for repeated takes on iPhone Safari.
- Game plugin template ready for the next games (crash, roulette).
