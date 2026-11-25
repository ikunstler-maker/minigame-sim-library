# Project rules for Claude (from Rooftop Hide & Seek)

Read this at the start of a new game project, together with `starter-kit/03-pastky.md`. These rules sit on top of the studio's own `CLAUDE.md` and the user's global `~/.claude/CLAUDE.md`.

## The user
- Ukrainian speaker, motion designer, **not a programmer**. Reply in Ukrainian, plainly, step by step: where to click and what she will see. Never hand her raw terminal commands with placeholders; do the technical work yourself (with her OK for installs, accounts and anything outward-facing).
- She approves a roadmap once and then wants you to **continue without stopping**: check each change, commit it as `iteration N`, publish, move on. Stop only for things only she can do (sign-ups, OAuth "Authorize", phone tests, payments) and for anything risky to her laptop.
- She says "перемикайся на режим оркестрації" when she wants parallel agents (see Orchestration).
- Weak laptop GPU (NVIDIA Quadro M1200, 4 GB): long GPU jobs froze it twice. Keep quality settings, Blender views and AI generation light.

## Workflow
1. `/prototype` with her idea → one round of questions → brief `design/game-brief.md` (her words verbatim in "In your words"; "After play:" lines appended verbatim later; Keep / Avoid lists honoured).
2. Build a browser game in `prototypes/<name>/` (single `index.html`, every tuning value in `config.js` with value/min/max/step, seeded `rng()`, fixed step, `window.game` hooks, `?scene=figures` lineup, `tune.js` panel on backquote).
3. Every change: check in the browser (built-in browser pane, or `one-shot-run.sh` / `page-shot.sh` headless), look at the screenshot, zero uncaught errors, log a line in `evidence/changes.tsv`, commit `iteration N: …` with `Brief: design/game-brief.md` in the body.
4. Publish: `bash .claude/scripts/one-shot-share.sh prototypes/<name>`, then `powershell -ExecutionPolicy Bypass -File prototypes/<name>/publish.ps1 -Message "iteration N: …"` (copy from `starter-kit/templates/publish.ps1` and fill in the repo path and itch target).
5. Big work: write `design/roadmap.md` (template in `starter-kit/templates/roadmap.md`), get her approval, then go.

## Orchestration
- Mode line first (`Режим: A/B/C/D — …`), per her global rules.
- Independent tracks → background agents with `isolation: worktree`, model sonnet for implementation; each brief names the files/areas it may touch, how to check, and the commit message; agents don't push or publish.
- Only one agent drives Blender at a time (one live Blender).
- Commit shared assets before launching worktree agents that need them.
- You merge branches yourself, resolve conflicts keeping both features, re-run the game + self-tests + sim, then publish once. Hand a heavy multi-conflict merge to a dedicated agent with a full test list.

## Connectors (copy `starter-kit/templates/mcp.json` to the project root as `.mcp.json`)
- Godot MCP (`@coding-solo/godot-mcp` via `C:\Program Files\nodejs\npx.cmd`, `GODOT_PATH` = `C:\Users\Admin\Documents\PROGRAMS\Godot_v4.7.2-stable_win64\Godot_v4.7.2-stable_win64.exe`).
- MCP for Blender (`uvx mcp-for-blender`, `BLENDER_MCP_SAFE_MODE=1`, `DISABLE_TELEMETRY=true`); server starts with Blender; models exported as GLB with one `role_<name>` material per mesh so the game recolours by role.
- ElevenLabs hosted MCP (`https://api.elevenlabs.io/v1/mcp`, OAuth via `/mcp`); say how many credits a batch uses before generating.
- ACE-Step 1.5 at `C:\Users\Admin\Documents\PROGRAMS\ACE-Step-1.5`: REST API `start_api_server.bat` on port 8001 (`/release_task`, `/query_result`); only short clips, one at a time; never while she uses the laptop.
- GitHub: a private repo per game made in GitHub Desktop under `C:\Users\Admin\Documents\GitHub\`; Git Credential Manager holds her login, you push.
- itch.io: butler at `C:\Users\Admin\Documents\PROGRAMS\butler\butler.exe`, logged in; channel `html5`.
- Render: free web service from the game repo, Root Directory `server`, `node relay.js`, health `/health`; the game's `RELAY_URL` points at `wss://<service>.onrender.com/ws`.

## Never
- Push to the studio template's `origin` (the studio author's repo).
- Ship `references/` (third-party images) anywhere.
- Enter her passwords, keys or codes; create accounts for her.
- Copy a named game's characters, art or UI; references guide style only.
