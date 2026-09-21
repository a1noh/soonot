# Deploying SOONOT

One Node process, one SQLite file, one public URL with TLS and WebSockets
(spec §11). Any host that runs a container with a persistent disk works —
**Fly.io** is the reference target below (Railway / Render / a VPS are equivalent).
**Not Vercel** (no WebSocket support).

## What's in the repo for deploy
- `Dockerfile` — multi-stage: builds the client, runs the host with `tsx`. Native
  `better-sqlite3` builds in the image.
- `fly.toml` — one always-on machine (WebSockets stay up), a `/data` volume for SQLite.
- `.github/workflows/ci.yml` — on every push/PR: `tsc -b` + vitest (280 tests) + build.
- `.github/workflows/deploy.yml` — after CI passes on `main`, `flyctl deploy`.

## One-time setup
1. **Push to GitHub** (this triggers CI):
   ```sh
   git add -A && git commit -m "deploy setup" && git push
   ```
2. **Create the Fly app + volume** (from the repo root, install flyctl first):
   ```sh
   fly launch --no-deploy          # pick a unique app name → updates fly.toml `app`
   fly volumes create soonot_data --size 1 --region nrt
   ```
3. **Set the master passcode** (never commit it — it's config, spec §4.2):
   ```sh
   npm run -s hash-passcode        # paste your passcode, copy the printed hash
   fly secrets set MASTER_PASSCODE_HASH="<the hash>"
   ```
4. **CI-driven deploys**: create a deploy token and add it to GitHub
   (Settings → Secrets and variables → Actions):
   ```sh
   fly tokens create deploy        # → paste as repo secret FLY_API_TOKEN
   ```
   Now every green push to `main` deploys. Or deploy by hand any time: `fly deploy`.

## After deploy
- Console: `https://<app>.fly.dev/master` (passcode you hashed).
- Projector: `https://<app>.fly.dev/p` — shows a QR to the player card.
- Players scan the QR → `https://<app>.fly.dev/b`.
- `GET /healthz` returns `{ ok, event }` for uptime checks.

## Notes
- The `/data` volume persists the event across restarts/redeploys (recovery, spec §8.4).
- `auto_stop_machines = false` keeps the socket server alive during an event.
- 512 MB / 1 shared vCPU is oversized for 300 players (bingo §16.0).
- Docker build not verified locally (daemon was off during authoring); it's standard
  and builds in CI/Fly. To verify locally: `docker build -t soonot . && docker run -p 3000:3000 -e MASTER_PASSCODE_HASH=... soonot`.
