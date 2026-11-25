# Key decisions — Coin Volcano presentation prototype

Date: 2026-11-25. Source: review of an external chatbot plan + user answers.

## D1. Purpose and scope
Internal company presentation of Coin Volcano (user's own game), for approval of
development in markets where it is allowed. Not a public ad tool.

## D2. No bank simulation
Removed from the external plan: bank app templates (CommBank, Revolut, monobank),
bank push with card digits, transactions, tax/net-win math.
Replaced by: a game push (custom text/icon) that opens a blank layout page the user
assembles in Studio (own background, image/text blocks, amount field with
animation modes: counter / spinner → instant / pull-to-refresh).

**Update 2026-11-25 (Stage 5):** the notification and the page are the game's own
virtual-money wallet (user: "internal interface for virtual money, design not
finished"). Templates fill {win} (game big win), {balance} (wallet balance before +
win), {start}, {id} (random per take), {currency}; amounts follow Region & currency
(Intl). Defaults are game-branded. No bank templates, card wording or bank logos
are shipped by the app.

## D3. Stack
Vite + TypeScript + PixiJS v8. Studio = plain HTML/TS panel (no React).
Preview = one PixiJS canvas, 1080x1920 logical portrait space.
Everything visible in a recording is drawn on the canvas; the secret exit
(triple-tap on the clock) is a DOM overlay above it, so it is never recorded.

## D4. Recording on iPhone
`canvas.captureStream(60)` + one `AudioContext` routed to both speakers and
`createMediaStreamDestination()` → `MediaRecorder`, prefer `video/mp4`.
Save via `navigator.share` (files) → Photos. Needs HTTPS → GitHub Pages.
Target device: iPhone (Safari / home-screen PWA). Proven first, in Stage 1.

## D5. Assets
Source: `Assets/` (3OAKS media kit: symbols, logos, backgrounds, screens,
paytables). Missing layers (empty coins, jackpot plates, 3x3 frame, Coin Collect
whirl, volcano, purple portrait background, UI buttons) are rebuilt identical to
the reference screens. All reference screens are landscape 1280x720; the portrait
layout is composed from layers.
Sounds: none in the kit; synthesized or provided later.

## D6. Privacy of assets
The assets belong to the game's studio. Keep the GitHub repository private.
GitHub Pages sites are public on the internet even from a private repo, unless the
org has Enterprise Cloud with private Pages. Open question for the user: does the
company plan include private Pages access control? If not: unlisted URL only,
`noindex`, and no publishing anywhere else (no itch.io).

**Update 2026-11-25:** the user chose to publish the game's site assets
(`public/private/`: plate video, soundtrack, patches, icon) with the public repo and
GitHub Pages, so the game runs on the iPhone from the site ("the repo is a prototype,
I do not mind if someone sees it"). The raw kit `Assets/` (reference video, audio
stems, press kit) stays local and gitignored.

## D7. Storage
IndexedDB autosave + JSON preset export/import. No GitHub token in the browser
(dropped from the external plan).

## D9. Stage size and iOS look (Stage 2)
Stage is 1080x2340 (iPhone 19.5:9), not 1080x1920, so the home screen fills the
phone without bars. Geometry is in points × `PT` (1080/402).
Defaults: time 10:37, battery 42 %, status bar per the iOS 27 reference (Dynamic
Island, fill-style battery). Weather widget: Toronto, late autumn, Mostly Cloudy.
Live weather for the current day (Open-Meteo, no key) is planned for later.
iOS icons are cut from the user's sheet by `tools/asset-pipeline/cut_ios_icons.py`
(watermark removed, rounded mask) into `public/ios/icons/`. Maps keeps faint
watermark traces; it is not used by default.
Game art (e.g. the Coin Volcano icon) lives in `public/private/` (gitignored), so
the public GitHub Pages build shows a lettered placeholder instead.

## D8. Kept ideas from the external plan
Plugin interface per game (crash, roulette later); calibration overlay with a
reference image; stage-by-stage check on the real phone; data-driven presets
(currency, locale, labels, jackpots, scripted outcome).
