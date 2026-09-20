# Running SOONOT locally

Requires **Node 18+** (`nvm use 20` — the repo's default shell may be older).

```bash
npm install
npm run verify                 # tsc -b + vitest, both must pass
cd master && npx vite build    # builds the console and board surfaces
npx tsx src/index.server.ts    # http://localhost:3000
```

| Surface | URL | Who |
|---|---|---|
| Master console | `/master` | The operator. Dev passcode is `soonot`. |
| 윷놀이 board | `/y` | The projector. Read-only by construction — `/y` registers no socket handlers. |
| Bingo card | `/` | **Not built yet** (404). |
| Projector switcher | `/p/:code` | Not built yet. |

Set `MASTER_PASSCODE_HASH` before a real event — `npm run hash-passcode`
prints one. Without it the host warns loudly and falls back to `soonot`.

## Seeing a game without a second person

```bash
node scripts/demo-yutnori.mjs
```

Signs in as the master, creates an event, sets up three teams and plays a
scripted sequence of throws — including two captures — so the board at `/y`
has something on it. Development aid only.

## What works today

- Both game engines, complete and tested (244 tests)
- The shared host: dispatch, per-game locks, identity, emit routing, rate limiting
- 윷놀이 end to end: setup → start → throw → move → undo → end → reveal
- Bingo end to end **over sockets** — join, fill, bingo, reveal — but with no UI

## What does not

- No bingo card UI, so bingo is only playable from a script or a test
- No projector surface, so no `'auto'` channel switching to watch
- No SQLite yet: state is in memory and a restart loses the game
  (the strategy interfaces and both schemas are written; it is wiring)
