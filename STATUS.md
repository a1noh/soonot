# SOONOT — status (pick-up notes)

_Last updated: 2026-09-21._

## TL;DR
Everything builds and **282 tests pass** (`npm run verify`). The app is feature-complete for a
church 한마당 and **deploy-ready** (Dockerfile + Fly config + GitHub Actions). The former
follow-ups (fullscreen + 참여 코드 gate) are now **done**; the only thing left before going live is
the one-time Fly setup (see "To go live").

## What works (verified)
- **윷놀이** — authentic **29-밭 윷판** with real **지름길**: 20 outer 밭 + two diagonals
  (4 밭 each) + centre 방. Landing exactly on 모/뒷모/방 opens the shortcut and the move
  picker offers *both* paths (지름길/바깥길). Throw pad, labelled move picker, 1 Hz clock with
  time-up auto-end, pause/extend, undo, reveal podium. Mario-Party **mini-games** on ★ 밭
  (roulette → master judges 성공/실패; fail reverts the 말 & passes the turn). **미니게임
  데이터베이스** is editable per event in the 윷놀이 setup.
- **빙고** — 5×5 card, join by **닉네임**, fill by number/name/초성, ambiguous-name picker,
  reconnect-restore, reveal. Master console: traits, start, live who's-online, dashboard.
- **Projector `/p`** — the single presentation screen: the board, roulette, podium, a prominent
  **⛶ 전체화면** button, a **QR** to join, a bottom-left **"who's online" box** (접속 N명 +
  names), and **Kahoot-style emoji reactions** that rise up the **right-side column** each with
  the **sender's nickname**. Anti-도배: per-phone cooldown + rolling budget on the phone, plus a
  per-socket throttle and a global cap on the host. `/y` aliases `/p`.
- **Join by 참여 코드** — the projector QR encodes `/{code}`; scanning goes straight to the
  nickname screen. Opening bare `/b` first asks for the 참여 코드 shown on the projector, so
  random visitors can't wander into a live event.
- **Open the projector from the console** — the master top bar has a **🖥 발표 화면 열기**
  button that opens `/p` in a new window (then one tap of ⛶ there goes fullscreen).
- **Master console** — drives both games; per-game **다시 하기** reset + **새 행사**; the
  **순위** shown during reveal for suspense.
- **Host** — one process, SQLite persistence + recovery, cache-busting HTML (no more stale
  builds), crash-safe (a player acting before an event no longer kills the server).

Visual proof: `node scripts/shoot.mjs` drives real Chrome and writes PNGs to `scripts/shots/`
(board, roulette, podium, setup form, card, emoji reactions) — asserts zero page errors.

## Deploy-ready (the overnight ask)
- `Dockerfile` (multi-stage, builds client + native better-sqlite3), `.dockerignore`.
- `fly.toml` (one always-on machine, `/data` volume for SQLite, TLS).
- `.github/workflows/ci.yml` — push/PR → tsc + vitest (280) + build.
- `.github/workflows/deploy.yml` — green `main` → `flyctl deploy`, **gated on a repo variable
  `DEPLOY_ENABLED=true`** so a push runs CI green without deploying until you opt in.
- **DEPLOY.md** — full step-by-step (create app + volume, set `MASTER_PASSCODE_HASH`,
  add `FLY_API_TOKEN` repo secret).

### To go live (≈10 min)
```sh
fly launch --no-deploy            # pick app name (soonot)
fly volumes create soonot_data --size 1 --region nrt
npm run -s hash-passcode          # → copy hash
fly secrets set MASTER_PASSCODE_HASH="<hash>"
fly tokens create deploy          # → add as GitHub secret FLY_API_TOKEN
# then in GitHub → Settings → Secrets and variables → Actions → Variables:
#   DEPLOY_ENABLED = true          # flips on the auto-deploy job
fly deploy                        # first deploy (CI auto-deploys on green main after)
```

## Next up (small, not blocking)
1. **Verify the Docker build locally** — Docker Desktop was off during authoring, so the
   image build wasn't run here (config is standard; CI/Fly will build it). First real proof
   is `fly deploy` (or `docker build .` once Desktop is running).
2. Optional: bundle a Korean display font so the projector title looks identical on any laptop.

## Run locally
`npm install && npm run build && npm start` → `/master` (passcode `soonot`), `/p`, `/b`.
See RUNNING.md.
