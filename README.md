# SOONOT

Small multiplayer web games for church gatherings. **One event, one master user, one
process, two games.**

| Project | What it is | Status |
|---|---|---|
| [`master/`](./master) | 마스터 — the shared master user and event host: identity, the event code, the lifecycle and reveal machines, dispatch, persistence, the projector, deployment | **Milestones 1–2 built** — contract, dispatch, identity, namespaces, console shell |
| [`bingo/`](./bingo) | 교회 사람 빙고 — a real-time 9×9 human-bingo icebreaker for 100+ people | Spec complete, no code yet |
| [`yutnori/`](./yutnori) | 윷놀이 한마당 — a projector-driven board and scoreboard, run from the stage | Spec complete, no code yet |

Bingo and yutnori are **game modules**; `master/` is the host they plug into. The master
signs in once and runs both games simultaneously from one console, against one 4-character
code, out of one process. See [`master/req.md`](./master/req.md) §9 for what that shares
and [`master/spec.md`](./master/spec.md) §3 for the contract that makes it possible.

## Running it

Node 20 or newer.

```sh
npm install
npm run hash-passcode          # prints MASTER_PASSCODE_HASH=...
MASTER_PASSCODE_HASH=... npm start   # host on :3000, console at /master
npm test                       # the whole workspace
```

Milestones 1–2 boot the host with stub game modules in both slots; the real games plug in
at milestones 3 and 4 by swapping two lines in `master/src/index.server.ts`.

## Document convention

Each project keeps two documents, in this order:

| File | Role |
|---|---|
| `req.md` | **The ask.** Raw requirements, as first written. Edited only to add or change what is wanted — never to record how it will be built. |
| `spec.md` | **The build spec.** The expansion of `req.md`: data model, protocol, architecture, edge cases. The single source of truth for implementation. |

Where the two disagree, `spec.md` wins — it carries the decisions made after the
original ask, and each one records why. `spec.md` restates the full original `req.md`
in its Appendix A, so it stands alone.

A project gets a `spec.md` once its `req.md` has enough in it to expand. All three now have
one.

## Authority between projects

`master/` is authoritative over the games on everything that is **not a game rule** —
identity, the event code, the shared lifecycle and reveal, dispatch, persistence plumbing,
the clock, fan-out routing, and deployment. Each game is authoritative over **its own
rules** and nothing else.

Changes `master/` introduced into the game documents are marked **(host)** inline, and the
complete list is [`master/req.md`](./master/req.md) §10. The one genuine reversal is
yutnori's former "shares no code with the bingo app" non-goal — reversed on demonstrated
duplication, with the reasoning kept in `yutnori/req.md` §18.
