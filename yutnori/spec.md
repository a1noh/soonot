# 윷놀이 한마당 — Technical Spec

> **Status:** v1, ready to build
> **Last updated:** 2026-09-20
> **Companion to:** [`req.md`](./req.md) — that document is the *what* and *why*, this one
> is the *how*. Section references like (req §8.2) point into it. Where this spec and
> `req.md` disagree, `req.md` wins on behavior and this spec wins on structure; the two
> known intentional divergences are listed in §12.
> **Hosted by:** [`../master/spec.md`](../master/spec.md). This app is a `GameModule`
> (master spec §3) plugged into the shared host; everything that is not a 윷놀이 rule —
> identity, dispatch, persistence plumbing, clock, sockets, reveal, deployment — lives
> there and is written once. Changes that introduced are marked **(host)**.

---

## 1. Design principle

**The rules are a pure function. Everything else is plumbing.**

The entire game — board, throws, catching, turn order, clock expiry, ranking — lives in a
framework-free reducer with no I/O, no `Date.now()`, and no socket awareness:

```ts
apply(state: Room, action: Action, now: number): { state: Room; events: Emit[] }
```

Time is an **input**, not an ambient read. Randomness does not exist (req §7). That makes
every rule in `req.md` §6–§11 unit-testable without a server, a browser, or a clock, and it
makes undo trivial (§4.4). The server, the sockets, the database and the UI are all thin
layers around this one function.

Anything that cannot be tested by calling `apply` with a literal state and a literal
action is in the wrong module.

**This shape is now the contract for both games.** `apply`, `allowed`, `route`, `project`,
`rank`, `invariants` and a persistence strategy are the seven members of `GameModule`
(master spec §3); the host supplies the loop around them. That is what lets one process
serve 윷놀이 and 빙고 without either knowing the other exists. **(host)**

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript, strict, everywhere | The data model in req §5 is already TS; share it verbatim between server and client |
| Engine | Plain TS, zero dependencies | §1 |
| Server | **the shared host** (`@soonot/master`) | Node 20 + Express + Socket.IO, written once for both games (master spec §6) **(host)** |
| DB | the host's single SQLite file | `better-sqlite3`; synchronous, one file, no daemon to run at a church (master spec §8) **(host)** |
| Client | Vite + React 18 | Two small screens; no SSR need — this never sees the public internet |
| Board rendering | Inline SVG | 20 stations on a ring is geometry (§7.1), not layout. Scales to any projector. |
| Styling | CSS custom properties + plain CSS | Projector legibility is a font-size and contrast problem, not a framework problem |
| Tests | Vitest | Engine tests are the deliverable that matters (§9) |

**Not chosen, deliberately:** Next.js (nothing to server-render, and a build step for a LAN
app is a liability at an event), Redux (the reducer *is* the state management), a canvas
board (SVG text scales and stays legible; canvas text does not), Postgres (nobody is
running a database server from a laptop in a church basement).

Everything ships as **one process for both games**: the host serves the built static assets
for all four surfaces and hosts the Socket.IO endpoint on the same port. One command, one
port, one database, one thing to plug in (master spec §12). **(host)**

---

## 3. Repo layout

The workspace and the dependency rules are master spec §2. 윷놀이's own package:

```
yutnori/                        # @soonot/yutnori
  req.md
  spec.md
  package.json
  src/
    module.ts          # the GameModule export (master spec §3) — the only host-facing file
    shared/
      types.ts          # req §5 verbatim: Room, Team, Mal, TurnEvent, Roll, …
      board.ts          # geometry + progress helpers (§7.1). Pure, shared with the client.
      constants.ts      # ROLL_STEPS, STATION_COUNT=20, TEAM_COLORS, …
    engine/
      actions.ts        # the Action union (§4.2)
      apply.ts          # the reducer (§4.3) — the heart of the app
      candidates.ts     # legal-move computation (req §8.1)
      ranking.ts        # req §11 sort order
      invariants.ts     # assertions run in dev + in every test (§4.5)
      replay.ts         # rebuild a Room from its event log (§4.4, §8.3)
      __tests__/        # §9
    persist.ts        # the EventLogStrategy implementation (§8)
    client/
      board/            # BoardSvg, MalMarker, HomeTray, CaptureBanner, Standings
      master/           # ThrowPad, MalPicker, ClockControls, UndoButton — the console pane
      useRoom.ts        # subscribes to the host's room:state → local Room mirror
```

**Deleted, because the host has them** (master spec §6, §8, §9): `server/index.ts`,
`server/rooms.ts`, `server/handlers.ts`, `server/guards.ts`, `server/clock.ts`, the router,
`reveal/`, `i18n.ts`, and `public/`. `handlers.ts` collapses into `module.ts`'s `route`
(master spec §3.2); `guards.ts` into the handshake guard and the merged `ALLOWED` table;
`reveal/` into the one shared podium fed by `rank()` (master spec §3.4). **(host)**

`shared/` is imported by `engine/` and `client/`. `engine/` imports nothing from
`client/` and nothing from the host beyond types — enforced by a lint rule, because this
is the boundary that keeps §1 true.

---

## 4. The engine

### 4.1 State

`Room` exactly as declared in req §5. No additional fields. The engine treats it as
immutable: `apply` returns a new object and never mutates its input, so the previous state
stays valid for diffing and for tests.

### 4.2 Actions

```ts
type Action =
  | { t: 'SETUP';    teams: { name: string; roster?: string }[]; malPerTeam: 1 | 2; timeLimitMin: number }
  | { t: 'START' }
  | { t: 'THROW';    roll: Roll }
  | { t: 'MOVE';     malId: string }
  | { t: 'UNDO' }
  | { t: 'PAUSE' }
  | { t: 'RESUME' }
  | { t: 'EXTEND';   minutes: number }
  | { t: 'END';      reason: EndReason }
  | { t: 'RESUME_FROM_ENDED' }
  | { t: 'REVEAL';   step: number }
  | { t: 'TICK' };                      // clock expiry is an action, not a side effect
```

`TICK` carrying no payload is the point: `now` is already a parameter of `apply`. The clock
running out is therefore a **pure, testable state transition** (req §10), not something
that happens in a `setInterval` somewhere and is discovered later.

### 4.3 The reducer

```ts
function apply(state: Room, action: Action, now: number):
  { state: Room; events: Emit[] }
```

- Rejects an illegal action by throwing `EngineError(code)`; the server turns that into the
  `error` socket event (req §12). The engine never silently no-ops.
- `Emit[]` is the list of things that happened, in order — `throw:recorded`,
  `board:update`, `capture:announced`, `turn:changed`, `team:finished`, `undo:applied`,
  `game:ended`, `reveal:step`. That is every req §12 server→client event except the three
  the engine cannot know about (§6). The server broadcasts them; the engine does not know
  what a socket is.
- Guard table = req §4 transition table, implemented as data, not scattered `if`s:

```ts
const ALLOWED: Record<RoomState, Action['t'][]> = {
  SETUP:   ['SETUP'],
  LOBBY:   ['START'],
  RUNNING: ['THROW','MOVE','UNDO','PAUSE','RESUME','EXTEND','END','TICK'],
  ENDED:   ['RESUME_FROM_ENDED','REVEAL'],
  REVEAL:  ['REVEAL'],
};
```

**`THROW` order of operations** (req §7–§9), the one sequence worth writing down:

1. assert `throwQueue > 0` and `pendingThrow === null`
2. `throwQueue -= 1`
3. compute candidates (§4.6) and **always** emit `throw:recorded` — the board shows every
   roll large (req §13.1), including the ones that carry no choice
4. if exactly one candidate, fall straight through to `MOVE`; otherwise set `pendingThrow`
   and wait for the master

**`MOVE`:**

1. assert the `malId` is in `pendingThrow.candidates` — never trust a client-supplied move
2. apply `to = min(from + steps, 20)`
3. resolve captures: every **opposing** 말 whose `progress === to` and `1 <= to <= 19` goes
   to 0; record each one's `from` in the `TurnEvent`
4. bonuses: `+1` if the roll was 윷/모, `+1` more if anything was captured
5. update `lastProgressAt`; set `finishedAt` if every 말 of the team is home
6. append the `TurnEvent`, clear `pendingThrow`
7. if `throwQueue === 0`, advance `turnIndex` to the next team with an unfinished 말
8. if every team has finished → `END('allFinished')`

### 4.4 Undo: replay, not inverse

`UNDO` is implemented as **truncate the event log and replay from scratch**, not as an
inverse operation:

```ts
function undo(room: Room): Room {
  return replay(setupOf(room), room.history.slice(0, -1));
}
```

`setupOf` extracts everything **no `TurnEvent` can determine**: `eventId`, team
names/colors/order and 말 ids, `malPerTeam`, the clock (`timeLimitMs`, `startedAt`,
`pausedAt`, `totalPausedMs`) and the lifecycle (`state`, `endedAt`, `endReason`,
`revealStep`, `createdAt`). (It no longer carries a code or a passcode hash: both moved to
the event and the host. **(host)**) What the log *does* determine — 말 positions,
`finishedAt`, `lastProgressAt`, `turnIndex`, `throwQueue`, `history` — is rebuilt from
대기 upward.

The clock belongs in the carried set, not the derived one: a paused timer is not a
consequence of any throw, and a replay that "derived" it would silently reset it.

Undo takes no `now` — it moves backwards, so it invents no new timestamps.

The alternative — writing an inverse for every event — means hand-maintaining a second,
subtly different implementation of the rules, and it is where undo bugs live: a restored
말 that lands on the wrong station, a bonus throw that was not removed, a `finishedAt` that
was not cleared. req §17 lists five distinct undo cases, and replay satisfies all five for
free, by construction.

The cost is O(n) per undo where n is the number of events in the game — a few hundred at
most, each a handful of arithmetic operations. This is not a performance question.

This is what makes `TurnEvent.at` load-bearing: replay must be **deterministic**, so every
event carries the timestamp it originally happened at, and replay feeds each event's own
`at` back in as `now` rather than using the current clock.

### 4.5 Invariants

`invariants.ts` exports `assertInvariants(room)`, called after every `apply` in dev and in
every test:

- `progress` of every 말 is an integer in `0..20`
- every team has exactly `malPerTeam` 말
- `throwQueue >= 0`
- `pendingThrow !== null` implies `state === 'RUNNING'`
- while `RUNNING` and not every team has finished, `teams[turnIndex]` has an unfinished 말
- `history` is `seq`-contiguous and `at`-monotonic
- team names are unique

### 4.6 Candidate computation

```ts
function candidates(room: Room, teamId: string, roll: Roll): MoveCandidate[]
```

One entry per 말 with `progress < 20`. For each: `to = min(progress + steps, 20)`,
`captures` = opposing 말 at `to` when `to` is a real station, `finishes = to === 20`.

**This function is the single source of truth for legality**, used by the engine to
validate a `MOVE`, by the master screen to render the 말 picker, and by the board to
highlight destinations (req §12). It is never reimplemented on the client.

Because of overshoot-goes-home (req §6), `candidates` returns a non-empty array whenever
the team has an unfinished 말 — the "no legal move" branch does not exist, and there is a
test asserting that over all 20 × 5 combinations (§9).

---

## 5. Host integration

> This section used to specify 윷놀이's own server. It is now the list of what the host
> does on its behalf — master spec §6 is the implementation, written once and shared with
> bingo. **(host)**

### 5.1 Dispatch & serialization

The host holds `Map<GameId, state>` plus a **per-game** promise chain that serializes every
action (master spec §6.1). Socket.IO callbacks are async and a master double-tapping 윷
must not interleave two `THROW`s against the same state:

```ts
await lock('yutnori', async () => {
  const { state, emits } = apply(current, action, now);   // now = the host's one clock read
  assertInvariants(state);
  commit('yutnori', state);
  persist.enqueue('yutnori', state, action, emits);
  route(emits, 'yutnori', state);
});
```

Broadcast happens **after** persistence is enqueued and state is committed, so a client can
never observe an event that a reconnect would not reproduce.

The lock is per *game*, not per event, so a bingo cell fill never waits on a 윷 throw — the
two games are independent writers in one process (master req §5.1, §11). And `now` is read
by the host and injected, so req §5's "every timestamp is set by the server" is a property
of the architecture rather than a rule this app has to remember. **(host)**

### 5.2 Routing

`module.ts`'s `route` (master spec §3.2) is a table, not a switch — each req §12 client
event maps to one action. The master check is made once, at the top of `route`, because
teams have no client (req §3):

| Socket event | Action | Guard |
|---|---|---|
| `board:watch` | — (host: join the channel, send `room:state`) | none |
| `master:setup` | `SETUP` | master |
| `master:start` | `START` | master |
| `master:throw` | `THROW` | master |
| `master:move` | `MOVE` | master |
| `master:undo` | `UNDO` | master |
| `master:pause` / `master:resume` | `PAUSE` / `RESUME` | master |
| `master:extend` | `EXTEND` | master |
| `master:end` | `END('master')` | master |
| `master:resumeFromEnded` | `RESUME_FROM_ENDED` | master |
| `master:reveal` | `REVEAL` | master |

State guards are **not** written here — they come from the engine's `ALLOWED` table
(§4.3), merged with the host's base table (master spec §5), so there is exactly one place
where "can this happen right now?" is answered.

Two guards the host applies *before* `apply` runs, because neither is a 윷놀이 rule and
this app cannot see its sibling: **the reveal is exclusive** across the two games, and a
reveal **seizes the projector** (master spec §5.1). **(host)**

### 5.3 Auth — entirely the host's **(host)**

- One master user, one passcode, one signed session cookie, covering both games on every
  device for the whole event (master req §3, spec §4).
- Privilege is set on the **socket handshake** and is immutable for the life of the socket.
  `master:auth` does not exist; neither does its rate limiter, its error path, or the
  "re-enter the passcode after a crash" step.
- Rate limiting moves to `POST /master/auth`: 5 attempts per IP per minute, then a
  15-minute lockout. A 4-character event code is guessable; the passcode must not be
  brute-forceable from it, and it is now never accepted on a code-scoped surface at all.
- `/y` and `/p` are granted **read-only** sockets with no master handlers registered, and
  `/p` ignores the session cookie outright — so an unattended projector laptop has no
  privileged channel even if the master signed in on it earlier (master spec §4.3, §6.3).

### 5.4 Clock

One `setInterval(1000)` for the whole process, shared with bingo — and 윷놀이 is the only
subscriber, because this module sets `ticks: true` while bingo sets `ticks: false`
(master spec §7; bingo §16.4 is explicit that pushing an elapsed clock to 100 clients costs
more than the entire rest of that game). Each tick, for this game:

1. if `RUNNING` and unpaused: emit `clock:tick { remainingMs, paused }`
2. if `remainingMs <= 0`: dispatch `TICK`, which the engine turns into `END('timeup')` —
   **only if `throwQueue === 0 && pendingThrow === null`**. Otherwise the tick is a no-op
   and the end fires on the first tick after the queue drains (req §10). The board's
   `마지막 차례` state is **derived** by the client from
   `state === 'RUNNING' && remainingMs <= 0` — it adds no field to req §5.

Clients interpolate between ticks from their own `performance.now()` so the projected
countdown stays smooth if a tick is dropped (req §10). The server value always wins on
arrival.

---

## 6. Emit → broadcast mapping

The engine's `Emit` union maps 1:1 onto the req §12 server→client events, with three
exceptions the engine has no business producing:

| Event | Produced by | Why not the engine |
|---|---|---|
| `room:state` | the host, from `project()` | It is a projection of the state `apply` returned, not a thing that happened |
| `clock:tick` | the host's clock (§5.4) | Wall-clock cadence; the engine only sees `now` as an argument |
| `error` | the host, from a thrown `EngineError` (§4.3) | — |

Every 윷놀이 emit carries `to: 'room'` — this board is public by design (req §12), and
`project()` ignores the viewer. The audience field is nonetheless **required** on every
emit, because the same routing layer carries bingo, where unicast is the one rule that
must not be got wrong (master spec §6.2). **(host)**

One ordering rule: **`room:state` is always sent last**, after the specific events, so a
client that ignores the granular events and just re-renders from state is still correct.
The granular events exist for animation (`capture:announced` drives the 잡혔다! banner),
not for state.

A reconnecting client gets `room:state` alone — no replayed animations.

---

## 7. Client

### 7.1 Board geometry

Stations are computed, never hand-placed. Corners at 0, 5, 10, 15; movement
counter-clockwise from 참 at the bottom right (req §6):

```ts
// shared/board.ts — unit square, [0,0] top-left
export function stationXY(i: number): [number, number] {
  const side = Math.floor(i / 5);
  const t = (i % 5) / 5;
  switch (side) {
    case 0:  return [1 - t, 1];   // bottom edge, right → left   (0..4,  참 at i=0)
    case 1:  return [0, 1 - t];   // left edge,   bottom → top   (5..9)
    case 2:  return [t, 0];       // top edge,    left → right   (10..14)
    default: return [1, t];       // right edge,  top → bottom   (15..19)
  }
}
```

The SVG uses `viewBox="0 0 100 100"` with `preserveAspectRatio`, so the same markup fills a
1280×720 projector and a phone with no breakpoints. Font sizes are in `viewBox` units,
which is what makes req §16's "readable at 10 m" a property of the geometry rather than
something to re-tune per venue.

Two 말 on one station (req §8.2) are drawn with a small fixed offset, up to 2 — the maximum
possible with 1–2 말 per team is bounded and does not need a general packing algorithm.

### 7.2 State handling

`useRoom.ts` keeps a local mirror of `Room` fed by `room:state`, and a small animation queue
fed by the granular events. **The client never computes game rules** — not candidates, not
rankings, not "can I throw now". It renders what the server sent and disables what the
server did not offer. The 말 picker renders `pendingThrow.candidates` verbatim.

The only client-side computation is the countdown interpolation (§5.4) and layout.

### 7.3 Screens

`/y/:code` — board view (req §13.1), and `/p/:code` — the shared projector surface, which
shows this board when 윷놀이 owns the channel (master req §5.2). Read-only by construction:
neither opens a master socket, and `/p` ignores the session cookie entirely, so there is no
privileged channel to misuse on an unattended projector laptop.

`/master` — the console (req §13.2), rendered as **one pane of two** (master req §7). It
prompts for nothing: the session cookie is already there. `ThrowPad`, `MalPicker`,
`ClockControls` and `UndoButton` are this module's contribution to that pane; the frame,
the lifecycle buttons, the reveal driver and the sign-out are the host's. **(host)**

### 7.4 Accessibility & legibility

Team identity is color **plus** a numeral baked into the 말 marker (req §16). Contrast
ratio ≥ 4.5:1 against the board background for every palette entry; the palette is fixed
and checked by a test, not chosen per event.

---

## 8. Persistence

### 8.1 Schema

In the host's single SQLite file, alongside `events` and bingo's tables (master spec §8.1).
No passcode is stored anywhere — it is deployment configuration. **(host)**

```sql
CREATE TABLE yut_rooms (
  event_id         TEXT PRIMARY KEY REFERENCES events(id),
  state            TEXT NOT NULL,
  mal_per_team     INTEGER NOT NULL,
  time_limit_ms    INTEGER NOT NULL,
  started_at       INTEGER,
  paused_at        INTEGER,
  total_paused_ms  INTEGER NOT NULL DEFAULT 0,
  ended_at         INTEGER,
  end_reason       TEXT,
  reveal_step      INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL
);

CREATE TABLE yut_teams (
  event_id   TEXT NOT NULL REFERENCES events(id),
  id         TEXT NOT NULL,
  ord        INTEGER NOT NULL,        -- turn order
  name       TEXT NOT NULL,
  roster     TEXT,
  color      TEXT NOT NULL,
  PRIMARY KEY (event_id, id)
);

CREATE TABLE yut_turn_events (
  event_id   TEXT NOT NULL REFERENCES events(id),
  seq        INTEGER NOT NULL,
  team_id    TEXT NOT NULL,
  roll       TEXT NOT NULL,
  mal_id     TEXT NOT NULL,
  payload    TEXT NOT NULL,           -- JSON: from, to, captures[], bonusGranted, finishedTeam
  at         INTEGER NOT NULL,
  PRIMARY KEY (event_id, seq)
);
```

### 8.2 Write-behind

This module supplies an `EventLogStrategy` (master spec §8.3); the host calls it inside the
game lock (§5.1), synchronously via `better-sqlite3`, so a write can never land out of
order relative to the state it describes. `yut_turn_events` is append-only; an undo issues a
single `DELETE … WHERE seq = ?`.

Bingo supplies a `SnapshotStrategy` instead. **Two strategies, deliberately** — forcing
this game to snapshot would create a second source of truth for 말 positions that can
disagree with the log after a crash, and forcing bingo to event-source would mean storing
~8,100 fill events to rebuild three flat arrays. The host unifies the plumbing (one file,
one connection, one enqueue, one boot path) and leaves the policy where it belongs
(master spec §8.3). **(host)**

### 8.3 Recovery

On boot the host loads the one event younger than 6 hours whose games are not all in
`REVEAL`, and asks each strategy to restore. Ours loads `yut_rooms` + `yut_teams`, then
**replays `yut_turn_events`** through the same `replay()` used by undo (§4.4). Recovery and
undo are the same code path, which means the recovery path is exercised by every undo test
in §9 rather than only by a disaster.

This is why there is **no `mal` table** — 말 positions are derived, never stored
(req §14, §12).

---

## 9. Testing

Engine tests are the deliverable. Target: **every row of req §17 is a named test.**

| Test group | Covers |
|---|---|
| `board.spec` | `stationXY` closes the ring; progress encoding boundaries at 0/19/20 |
| `candidates.spec` | Non-empty for every (progress 0–19 × roll) pair — the no-pass guarantee, req §9 |
| `throw.spec` | 윷/모 bonus; queue stacking; rejects a second throw while one is pending |
| `move.spec` | Overshoot → 20; own-말 co-location is a no-op; rejects a non-candidate malId |
| `capture.spec` | Multi-말 catch grants exactly one bonus; 대기 and 집 are uncatchable; catch chains |
| `undo.spec` | All five req §17 undo rows, each asserting **full state equality** with the pre-event state |
| `clock.spec` | End at 00:00; deferral while the queue is non-empty; pause/extend arithmetic |
| `ranking.spec` | Finisher tier ordering; 1-말-home beats split progress; all-zero tie; < 3 teams |
| `replay.spec` | Property: replaying any event log reproduces the state that produced it |
| `invariants.spec` | Random action sequences never violate §4.5 |

`replay.spec` is the highest-value test in the suite: it simultaneously validates undo
(§4.4) and crash recovery (§8.3).

Host-level suites — identity, dispatch, emit audiences, reveal exclusivity, projector
arbitration, recovery, and a `two-games.spec` that runs a bingo fill storm during a 윷
bonus chain — live in master spec §10 and are not duplicated here. **(host)**

Above the engine: one integration test driving two sockets (a master and a board) through a
full short game, and a manual projector checklist — **run the board at 1280×720, stand 10
metres back, and read the standings** (req §16). That one is not automatable and is the one
that actually matters on the day.

---

## 10. Build order

| # | Milestone | Done when |
|---|---|---|
| 1 ✅ | `shared/` + `engine/` + tests | **Done.** A full game plays in `game.spec.ts`; 83 tests green, `tsc -b` clean. |
| 2 | `module.ts` against the host contract | The host drives a full game; ugly console pane |
| 3 | Board view + SVG geometry | A second tab mirrors the game live |
| 4 | Clock, end, ranking, reveal | A game ends by itself; the **shared** podium reveals 3rd → 2nd → 1st off `rank()` |
| 5 | `EventLogStrategy` + recovery | `kill -9` mid-game, restart, board is intact |
| 6 | Polish | Capture animation, home trays, projector type sizes |

This is **milestone 3 of the host's build order** (master spec §13), and it runs *before*
bingo is built: 윷놀이's rules are already fully specified and its engine is already the
shape of the contract, so it proves the contract cheaply. If the contract is wrong, it is
wrong before bingo is written against it. **(host)**

Milestone 1 carries the risk and none of the framework. If the engine is right, 2–6 are
mechanical; if it is wrong, no amount of UI saves the event.

**Dress rehearsal before the event**: run milestone 6 on the actual laptop, the actual
projector, and the actual wifi, with three volunteers throwing real sticks. Every failure
this spec cannot predict lives there.

---

## 11. Config & deployment

**Deferred entirely to the host** (master spec §12): one Node process, one port, one SQLite
file, serving both games and all four surfaces. This package contributes no env vars of its
own and has no `start` script — `npm run build && npm start` at the workspace root is the
whole operation. **(host)**

Runs on the operator's laptop; participants and the projector reach it over the venue LAN
by IP. No internet dependency at runtime — the room is offline more often than anyone
expects, and the game must not care.

---

## 12. Alignment with `req.md`

**There are no behavioral divergences.** Two structural refinements surfaced and were both
folded back into the requirements rather than left as mismatches:

- **No `mal` table.** Because undo is replay-based (§4.4), 말 positions are always derivable
  from the event log; storing them too would create a second source of truth that can
  disagree with it after a crash. `req.md` §14 now reads `rooms`, `teams`, `turn_events`,
  with recovery by replay.
- **This app is a `GameModule`, not a server.** Identity, dispatch, persistence plumbing,
  the clock, the sockets, the reveal and the deployment moved to the host and are shared
  with bingo. `req.md` §1, §3, §5, §12, §17 and §18 were updated accordingly, and the
  complete change list is master §10. The engine (§1, §4) is untouched by any of it — which
  is the evidence that the §1 boundary was drawn in the right place. **(host)**

Where this spec is silent, `req.md` is authoritative. Future changes to *behavior* belong
in `req.md` first and arrive here only as a structural consequence; changes to *structure*
start here and touch `req.md` only when they contradict it, as the one above did.

---

## 13. Traceability

| `req.md` | Implemented in |
|---|---|
| §4 lifecycle & transitions | `engine/apply.ts` `ALLOWED` table (§4.3) |
| §5 data model | `shared/types.ts`, verbatim |
| §6 board & overshoot | `shared/board.ts`, `engine/candidates.ts` (§4.6, §7.1) |
| §7 throws & bonuses | `engine/apply.ts` `THROW` (§4.3) |
| §7.1 undo | `engine/replay.ts` (§4.4) |
| §8 movement & catching | `engine/apply.ts` `MOVE` (§4.3) |
| §9 turn order, no-pass | `engine/candidates.ts` + `candidates.spec` (§9) |
| §10 clock & endings | `engine` `TICK` + `server/clock.ts` (§4.2, §5.4) |
| §11 ranking & reveal | `engine/ranking.ts`, `client/reveal/` |
| §12 protocol | `module.ts` `route` (§5.2), `Emit` mapping (§6) |
| §13 screens | `client/board/`, `client/master/` (§7.3) |
| §14 persistence | `src/persist.ts` `EventLogStrategy` (§8) |
| §15 i18n | the host's shared `i18n.ts`, 윷놀이 string namespace (master spec §2) |
| §16 legibility & a11y | `viewBox` units (§7.1), palette test (§7.4), manual check (§9) |
| §17 edge cases | One named test per row (§9) |
