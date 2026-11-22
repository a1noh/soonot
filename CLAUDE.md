# soonot

Multiplayer web games and the show runner for church gatherings. Tonight's use: **어벤추수 땡스게임**
(Thanksgiving, ~60 people, 6 teams, MCs 효준 · 예진). One event, one master console, one projector, phones join by QR.
Everything for the event lives here: the games, the run of show, the intro video, its sound, the rehearsal tools.

Read `STATUS.md` first (where things stand, what's next). Then use the map below and open only what the task needs.

## Run it
```
npm install            # once; dependencies are never copied into the hub
npm run build          # client → master/dist/client (the server serves it)
npm start              # http://localhost:3000  /master (passcode soonot) · /p projector · /b phones · /rules
npx tsc -b master bingo yutnori stones && npx vitest run     # what scripts/verify.sh does (it fails on Windows bash)
node scripts/fetch-music.mjs                                 # the BGM tracks → master/media/bgm (git-ignored)
```
After `npm run build` the projector reloads itself and the console shows "새 버전이 있어요". Restart `npm start`
only when server code changed (`master/src/host`, `master/src/event`, any game's `engine` / `module.ts` / `project.ts`).

## The idea in one paragraph
The master runs the evening from **진행 순서**, a remote: one list of steps (빙고 → intro video → 빙고 1등 → 스톤
main board → seating → **one 스톤 step for all 6 rounds** → 최종 집계 → 시상 → 감사합니다). **다음 ▶** does the current
step's next action (start bingo, the 5분 timer, each reveal, …) and only then moves on; **◀ 이전** is its exact mirror
(takes back the last action, so the projector always matches). During the 스톤 rounds there is no 다음: the game is the
path (pick a stone → its game opens → tick winners → next round). The only taps besides ▶/◀ are the room's choices.

## Map: where to change what
| You want to… | Open |
|---|---|
| change the steps of the show (titles, notes, music, timers, which game) | `master/src/event/show.ts` — `scriptCues()`, `MUSIC`, `ROUNDS`, `AUTO` |
| change what 다음 ▶ / ◀ 이전 do inside a step | `master/src/console/autopilot.ts` — `nextAction`, `prevAction`, `AUTO_PLAN` |
| change the remote's layout / behaviour | `master/src/console/ShowPane.tsx` (remote + 순서 편집), `RemoteStatus.tsx` (game status panels), `console.css` |
| the console shell, tabs, event bar (타이머, 🔇, 더보기) | `master/src/console/App.tsx`, `EventBar.tsx`, `useConsole.ts` |
| server actions for the show (`show:*`, `event:restart`, `projector:*`) | `master/src/host/namespaces.ts` |
| uploads and `/media` serving | `master/src/host/server.ts` |
| the projector: slides, video, BGM, credit line | `master/src/projector/ShowLayer.tsx`, `show.css` |
| projector sound effects and when they fire | `master/src/projector/sound.ts`, `useSfx.ts`, effects in `sfx/` (made by `scripts/make-sfx.mjs`) |
| what the projector shows for each game state | `master/src/projector/App.tsx` (the `screen` switch), `StonesStage.tsx` |
| 스톤 rules (pick N opens game N, ties, 감사 스톤, rewind/back) | `stones/src/engine/apply.ts`, `ranking.ts`, defaults in `stones/src/shared/constants.ts` |
| what each viewer of 스톤 may see | `stones/src/project.ts` (the game order is master-only) |
| 스톤 controls in the remote / the 스톤 tab | `stones/src/client/RemotePane.tsx` / `MasterPane.tsx` |
| 빙고 rules / console / traits | `bingo/src/engine/apply.ts` / `master/src/console/BingoPane.tsx` / `bingo/src/shared/traits.ts` |
| 🤖 test bots (rehearse bingo without phones) | `master/src/console/bots.ts` |
| the MC intro video and its sound | `video/intro/README.md` |

## Workspaces
- `master/` — the host (Express + Socket.IO + SQLite), the console, projector, phone and rules pages (Vite + React).
- `bingo/`, `stones/`, `yutnori/` — one game each: `engine/` (pure rules + tests), `module.ts` (routing), `project.ts`
  (what each viewer sees), `client/` (their console panes). The host never reads game state directly.
- `video/intro/` — the intro's effects and mix recipe. Big media (videos, music) is in `master/media/` (git-ignored,
  served at `/media/…`).

## Scripts (`scripts/`)
| Script | What |
|---|---|
| `rehearse.mjs` | the whole show end to end through the remote only, with sound checks and screenshots → `scripts/shots/rehearsal/` |
| `rehearse-paths.mjs` | 14 other ways the evening can go (skips, ◀ everywhere, no tie, reset mid-show, …) |
| `add-bots.mjs` | bot phones for bingo from the command line (the console has a 🤖 button too) |
| `fetch-music.mjs` | download the BGM (Kevin MacLeod, CC BY) into `master/media/bgm` |
| `make-sfx.mjs` | regenerate the projector's effects with ffmpeg |
| `intro-picture.mjs` | the intro's picture effects (the Thanos-push explosion) |
| `intro-sfx.mjs` | mix the intro's effects onto the video (cue table inside) |
| `make-boom-sfx.mjs` | the explosion sound layers (ffmpeg) |
| `shoot*.mjs`, `perf-stones*.mjs`, `demo-*.mjs` | screenshots, performance and older demos |

Run the rehearsals against a **throwaway server** so the live event is untouched:
`cd master; $env:PORT='3100'; $env:DB_PATH='<scratch>/rehearsal.db'; $env:MEDIA_DIR=(Resolve-Path ./media); npx tsx src/index.server.ts`

## Hub toolbox (shared, use it yourself)
`C:/Users/17654/Projects/toolbox/TOOLS.md`: `earshot make` / `earshot timeline` (sound effects and their sync),
`hear` (listen), `video-sheet` (a video as timestamped frame sheets), `send-phone` (send a clip or screenshot to
Austin's iPhone), `notify`, `transcribe`, `speak`, `ffmpeg`, `flyctl`, `/watch`. Use them and decide; don't hand media
work to other sessions. One shared GPU: run `hear` / `transcribe` one at a time. A broken shelf tool ("uv trampoline
failed"): `tools/toolbox-sync.ps1` in the hub, never `uv tool install --reinstall`.

## Other docs here
`STATUS.md` (memory between sessions) · `RUNNING.md` (running an event) · `DEPLOY.md` (Fly.io; pushing `main` deploys)
· `SOUND-CREDITS.md` (music and effect licences) · `README.md`

## Notes for Claude
- Read STATUS.md before starting; update it with /handoff before ending.
- Pushing to `main` deploys live to Fly: ask Austin first. Work on `feat/script-alignment`.
- Secrets (.env etc.) stay where they are; never print or copy them.
- The hub's secret guard blocks shell commands whose text looks like `.key`; write such edits with the file editor
  or a script file instead.
