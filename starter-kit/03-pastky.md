# Пастки, на які ми вже наступили

Кожна з цих помилок коштувала нам часу в Rooftop Hide & Seek. Claude має прочитати цей файл на початку нового проєкту.

## Для тебе (простими словами)

- **Посилання на файл у чаті не запускає гру**, а лише показує її код. Гру запускає подвійний клік по `start.bat` у Провіднику Windows або по `index.html`.
- **itch.io не прийме файл, поки пошта не підтверджена.** Повідомлення «No file provided to embed» означає, що файл не завантажився або біля нього не стоїть галочка «played in the browser».
- **Команди з інструкцій сайтів не вставляй у PowerShell сама.** Наприклад, `claude mcp add …` не спрацювала, бо програма `claude` для терміналу не встановлена. Краще скажи Claude, і він підключить сам.
- **Ноутбук зависав двічі** під час генерації музики. Не запускай довгу генерацію й не відкривай нічого, поки вона йде.
- **Сайти змінюються.** Якщо кнопки немає там, де описано, надішли скріншот: Claude покаже, куди натиснути.

## For Claude (technical)

- **Zip for itch.io:** Windows PowerShell 5.1 `Compress-Archive` writes backslash paths (`vendor\three.js`) and itch.io then serves a dark empty frame. Use butler, or build the zip with `System.IO.Compression.ZipArchive` and forward-slash entry names.
- **three.js:** prefer `bash .claude/scripts/vendor-three.sh <game> loaders/GLTFLoader`, which bundles a global `THREE` (`vendor/three.js`). Then the game plays from a double-click and the check scripts can open it. Pack `.glb` models as base64 into `assets/models.js` (`pack-models.sh`) so they load without fetch from `file://`.
- **CanvasTexture updated every frame:** set `generateMipmaps = false` and `minFilter = LinearFilter`, or later updates may not reach the GPU.
- **Two WebGLRenderers sharing materials** (game + lobby preview): don't let the preview bind a live texture the game also updates. Give the preview a dummy texture; otherwise the game's copy can stop updating.
- **Merging parallel agent branches** that all edit one big `index.html`: expect conflicts in `startRound`, `makeSnap`/`applySnap`, `drawHud`, `drawFrame`, startup. Keep both sides, then check for semantic breaks outside the markers (changed signatures such as `canSee(v,x,z,tgt)`, `castRay` eye height, `collider` height). Run the game, the level self-test and a short sim after every merge. Strip leftover `>>>>>>>` lines.
- **Debug hooks** like `DBG.cam = [0]` can silently pin the camera; default debug values must be `null`.
- **Blender MCP safe mode:** no `import os`/`open`; export operators are allowed. Check world bounding boxes: parts made with `primitive_*_add(location=…)` then `transform_apply` sometimes end up with offset mesh data (floating blades, buried legs).
- **Blender + weak GPU:** use `look` with solid/material shading and `max_size ≤ 640`; rendered shots sparingly.
- **Browser pane hidden** → `requestAnimationFrame` stops; measure FPS only when the pane is visible. Use `one-shot-run.sh` / `page-shot.sh` for headless checks instead.
- **Headless checks have no audio:** say sounds are unverified.
- **Untracked files in the main checkout** (assets from a Blender agent) are not in agent worktrees: commit assets before starting worktree agents that need them.
- **The studio repo's `origin` is the studio author's repository.** Never push there; the game's backup lives in its own private repo (copied by `publish.ps1`).
- **Permissions:** `rm -rf`-style deletes and reading `.env` were denied; work around without them.
