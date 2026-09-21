# Running SOONOT locally

Requires **Node 18+** (`nvm use 20`).

```bash
npm install
npm run verify                 # tsc -b + vitest (284 tests) — both must pass
npm run build                  # builds all four client surfaces
npm start                      # http://localhost:3000
```

`npm run dev` (in `master/`) gives the hot-reloading Vite version on :5173.

| Surface | URL | Who |
|---|---|---|
| **Master console** | `/master` | The operator. Drives both games. Dev passcode `soonot`. |
| **Bingo card** | `/b` (also `/`, `/:code`) | Each player, on their phone. Bare `/b` first asks for the **참여 코드** on the projector; the QR opens `/{code}` and skips straight to the **닉네임** join. |
| **Projector** | `/p` (also `/y`) | The room screen: the full 윷놀이 board, the mini-game roulette, the reveal podium, a bottom-left who's-online box, and right-side emoji reactions. One presentation screen; a **⛶ 전체화면** button (top-right) goes fullscreen. |

Set `MASTER_PASSCODE_HASH` before a real event (`npm run hash-passcode`).

## How to run an event

1. Open `/master`, sign in (`soonot`), press **행사 만들기** (create event).
2. Both panes appear (빙고 + 윷놀이) with their setup forms.
   - **윷놀이**: type team names, 말 per team, time limit, tick **미니게임 켜기**, and edit
     the **미니게임 데이터베이스** (one per line, `이름 | 설명`). Press 준비 완료 → 게임 시작.
   - **빙고**: keep/edit the 25 traits → 25개로 준비 완료 → 게임 시작 (needs ≥2 players).
3. Put `/p` on the big screen — tap **⛶ 전체화면** (top-right), or use the console's **🖥 발표
   화면 열기** button to open it in a new window. Players scan the projector **QR** (or open `/b`
   and type the 참여 코드).

## Features (current)

- **윷놀이** — team setup, throw pad (도·개·걸·윷·모), move picker labelled by 말/destination/잡기,
  1 Hz clock with time-expiry auto-end, pause/resume/extend, undo, reveal podium.
  - **미니게임 (Mario-Party)**: 6 ★ spots (stations 6, 8, 11, 13, 16, 18 — all past the start,
    so a 말 leaving 대기 never lands on one). Landing triggers a **roulette** that picks a game
    from the event's editable **미니게임 데이터베이스**; the master judges 성공/실패. **Fail =
    the 말 reverts to where it was and the turn passes** (it never goes back to 대기).
  - Board is a traditional 윷판: paper, brown lines, the **X** through the centre 방, big corner 밭.
- **빙고** — **5×5** card, kawaii-pastel and phone-fitted (the grid fills the screen); join by
  닉네임 → number; fill by number / name / 초성; cute stamps + a confetti bingo celebration;
  reconnect-restore; reveal. **Ranking: most bingos (lines) first, then finish time.**
- **Master console** — drives both games; per-game **다시 하기** (reset that game to setup, which
  also bounces connected phones back to waiting) and **새 행사** (reset the whole event); a live
  **who's-online** list showing only **connected** players; the **순위** during reveal.
- **Projector `/p`** — always shows the board once a game exists; roulette; podium; a prominent
  **⛶ 전체화면** button; **Kahoot-style emoji reactions** (rise up the right column with the
  sender's nickname; 도배 guard = per-phone cooldown + rolling budget + host cap).
  - **Bingo screens are kawaii-pastel** (matching `/b`); 윷놀이 keeps its gold paper look.
  - **Anonymous bingo suspense**: a bingo triggers a momentary **green flash** and a live
    **anonymous chart** (1줄 N명 / 2줄 N명 …) — counts only, **no names** until the reveal.
  - **Who's-online box** (bottom-left): only **connected** players — offline/ghosts never show.
    Full name list on the bingo screen; a compact **접속 N명** count on the 윷놀이 board so it
    never covers the map. Latecomers can always scan the persistent join **QR + 참여 코드** chip.
- **Persistence** — one SQLite file; a restart recovers the event and both games. A bingo game
  **in progress** (RUNNING/reveal) recovers its roster so phones reconnect and the podium survives;
  a game that **never started** (setup/lobby) comes back with its trait list but a **clean roster**,
  so a fresh server never shows people from a previous session.

## Verifying

- `npm run verify` — tsc + **284 tests** (engines, host, both e2e suites, multi-user + time-skip
  simulations, mini-game engine + socket tests, and jsdom UI tests for the card, console panes,
  and projector).
- **Real-browser screenshots**: `node scripts/shoot.mjs` drives the system Chrome against the
  running server and writes PNGs to `scripts/shots/` (projector board / roulette / podium / setup
  form / bingo card / emoji reactions), asserting zero page errors. This is how the projector is
  visually confirmed (jsdom can't render CSS/SVG).
- Dev aids: `node scripts/demo-yutnori.mjs`, `node scripts/demo-bingo.mjs`.

## 윷놀이 board — authentic 29-밭 with 지름길

The board is the real 윷판: 20 outer 밭 + two diagonals (4 밭 each) crossing at 방. Landing
EXACTLY on 모/뒷모/방 opens a **지름길** — the move picker then offers both the diagonal and
the outer path. Shortest course out is 11칸. (**업기** and **백도** remain out of scope,
`yutnori/req.md §18`.)

## Deploying

See **DEPLOY.md**. One process + SQLite + a public TLS/WebSocket host (Fly.io reference).
`Dockerfile`, `fly.toml`, and GitHub Actions (`.github/workflows/`) are set up: push to `main`
runs CI (tsc + 280 tests + build); a green build deploys to Fly. The projector `/p` shows a
**QR** to the player card so the room joins by scanning.

## Notes

- One active event at a time. Use **새 행사** to start over (no process restart needed).
- HTML responses are `no-cache`, so a normal refresh always loads the latest build (hashed assets
  stay cached).
- On Windows, if a restart hits `EADDRINUSE`, an old `tsx` still holds port 3000 — stop it and rerun.
