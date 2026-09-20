# 마스터 — Technical Spec

> **Status:** v1, ready to build
> **Last updated:** 2026-09-20
> **Companion to:** [`req.md`](./req.md) — that document is the *what* and *why*, this one
> is the *how*. Section references like (req §5.2) point into it.
> **Governs the structure of:** [`../bingo/`](../bingo) and [`../yutnori/`](../yutnori).
> Where this spec and a game's `req.md` disagree, the game's `req.md` wins on **its own
> game rules** and this spec wins on **everything else**. §11 lists the divergences.

---

## 1. Design principle

**The host owns everything that is not a game rule. A game is a pure reducer plus screens.**

`yutnori/spec.md` §1 already established the right shape for one game:

```ts
apply(state, action, now): { state, events }
```

— framework-free, no I/O, no `Date.now()`, no socket awareness, time as an argument. The
single highest-value decision in this document is to **make that the contract for both
games** and to write the surrounding loop exactly once.

Everything else follows. If `apply` is pure and total, then the dispatch loop, the
serialization, the persistence, the recovery, the broadcast fan-out, the clock and the
invariant checks are all game-agnostic plumbing — which is precisely the thirteen rows of
req §9.1.

> Both games' specs reached this shape **independently**, before this document existed —
> `yutnori/spec.md` §1 and `bingo/spec.md` §1.1 declare the same signature, and bingo
> §1.2 independently arrived at an `Emit` union that carries its audience in the type.
> That is the evidence the contract is right, not a convenience: it is not being imposed on
> either game, it is being *extracted* from two specs that already agreed.

> Bingo's spec adds one refinement this document adopts wholesale: **the audience is a
> discriminated union, not a string**, so `cell:result` has no `to: 'room'` variant and
> broadcasting one is a compile error rather than a load-test finding (§6.2).

---

## 2. Workspace

```
SOONOT/
  package.json              # npm workspaces, one lockfile, one node_modules
  tsconfig.base.json        # strict; project references between packages
  README.md
  master/
    req.md  spec.md
    src/
      identity/
        passcode.ts         # scrypt hash + constant-time compare (req §8)
        session.ts          # sign / verify / rotate (§4.1)
        guard.ts            # handshake → socket.data.master (§4.3)
      event/
        code.ts             # 4-char A-Z minus I,O (req §4.1)
        event.ts            # Event, GameHandle, lifecycle + reveal machines (§5)
        registry.ts         # the one active event; per-game locks (§6.1)
      host/
        server.ts           # Express + Socket.IO bootstrap, static serving
        namespaces.ts       # /master /b /y /p wiring (§6.3)
        dispatch.ts         # the one loop: lock → apply → invariants → persist → emit (§6.1)
        emit.ts             # Emit union + audience routing (§6.2)
        clock.ts            # one interval; serverNow piggyback; per-game tick opt-in (§7)
        persist/
          db.ts             # one SQLite file, WAL, migrations
          snapshot.ts       # strategy A (bingo) (§8.2)
          eventlog.ts       # strategy B (yutnori) (§8.3)
        module.ts           # the GameModule contract (§3) — the load-bearing file
      console/
        App.tsx             # /master — sign-in + two panes (req §7)
        EventBar.tsx        # title, code, projector selector, sign-out
        GamePane.tsx        # frame: lifecycle buttons, reveal driver, blocking badge
        useConsole.ts       # one socket, both games
      projector/
        App.tsx             # /p/:code — channel switch, zero interactive elements (§9)
      shared/
        lifecycle.ts        # RoomState, ALLOWED base table, RevealStep — used by both games
        rank.ts             # RankEntry, the podium contract (§3.4)
        reveal/             # the one podium UI, both games
        i18n.ts             # { ko, en }, namespaced per game (req §9.1)
        tokens.css          # projector legibility + palette custom properties
      __tests__/
  bingo/                    # @soonot/bingo    — module.ts, shared/, engine/, client/, persist.ts
    req.md  spec.md
  yutnori/                  # @soonot/yutnori  — module.ts, shared/, engine/, client/, persist.ts
    req.md  spec.md
```

Package names: `@soonot/master`, `@soonot/bingo`, `@soonot/yutnori`.

**Dependency direction, enforced by a lint rule:**

```
  bingo ──┐
          ├──► master/shared      (types, lifecycle, rank, i18n, tokens)
yutnori ──┘

  master/host ──► bingo, yutnori  (imports their GameModule, nothing else)
```

A game imports `master/shared` for types only and **never** imports `master/host`. The
host imports each game's module export and **nothing else from it** — no internals, no
state types beyond the opaque parameter. That boundary is what keeps req §9.1's "the host
contains no game rules" true as the code grows.

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript strict, everywhere | Both apps' data models are already TS; share them verbatim |
| Server | Node 20 + Express + Socket.IO | Both req documents specify Socket.IO event names directly |
| DB | `better-sqlite3` | Synchronous, single file, no daemon to run at a church |
| Client | Vite + React 18 | Four small surfaces; nothing to server-render on a LAN |
| Tests | Vitest | Engine tests are the deliverable (§10) |
| Build | One Vite build with four entries; Express serves the output | One command, one port, one thing to plug in |

**Not chosen, deliberately:** Next.js (no SSR need, and a build step is a liability at an
event), Redux (the reducers *are* the state management), Redis / clustering (bingo §16.0 —
one process is right at this scale, for both games together), Postgres (nobody runs a
database server from a laptop in a church basement), a real auth library (req §3.1 — one
passcode, one cookie; an auth framework here is more attack surface than it removes).

---

## 3. The `GameModule` contract

This is the interface that makes one host serve two games. It is deliberately small: six
functions and two constants.

```ts
// master/src/host/module.ts
export interface GameModule<S, A extends { t: string }> {
  readonly id: GameId;                    // 'bingo' | 'yutnori'

  /** Fresh state in SETUP for a new event. Pure; `now` is injected. */
  create(eventId: string, now: number): S;

  /** The rules. Pure: no I/O, no Date.now(), no socket awareness. */
  apply(state: S, action: A, now: number): { state: S; emits: Emit[] };

  /**
   * Where the host reads the shared lifecycle out of opaque game state.
   *
   * The host must answer "what state is this game in?" to apply the §5 guard
   * table and the two §5.1 rules, but game state is deliberately opaque to it
   * (req §4.1). One accessor is the whole of the host's read access into a
   * module — strictly less than the alternative, which is the host owning a
   * `RoomState` field it would then have to keep in sync with the game's own
   * idea of itself.
   */
  lifecycle(state: S): RoomState;

  /** req §4.2 — per-state action whitelist, merged with the host's base table. */
  readonly allowed: Record<RoomState, A['t'][]>;

  /** Socket event + payload + who sent it → an action, or null to reject. */
  route(ev: string, payload: unknown, viewer: Viewer): A | null;

  /** State → the payload each audience is allowed to see. §3.3 */
  project(state: S, viewer: Viewer): unknown;

  /** State → the ranked list the shared podium renders. §3.4 */
  rank(state: S): RankEntry[];

  /** Dev + test only. Throws on a violated invariant. */
  invariants(state: S): void;

  readonly persistence: SnapshotStrategy<S> | EventLogStrategy<S, A>;   // §8
  readonly ticks: boolean;                // subscribe to the 1 Hz clock? §7
}
```

Two modules implement it: `@soonot/bingo` and `@soonot/yutnori`. The host's only knowledge
of either game is this shape.

`EngineError` — the error a module throws from `apply` — lives in `shared/`, not `host/`,
because **games throw it**. A game importing it from `host/` would invert the one
dependency rule (§2) that keeps req §9.1 true. `HostError` stays in `host/`, where no game
can reach it.

### 3.1 Why `apply` and not "a service class"

Purity is what buys the shared loop. Because `apply` takes `now` and returns state plus a
list of things that happened:

- **Serialization is the host's job** — it holds the lock, so no game needs one.
- **Persistence is the host's job** — it sees every `(state, action, emits)` triple.
- **Recovery is free for event-sourced games** — replay is `history.reduce(apply)`.
- **Undo is free** for the same reason (yutnori spec §4.4) — it stays a game concern, but
  it needs nothing from the host.
- **Every rule is testable with a literal state and a literal action**, with no server, no
  browser and no clock. That is the deliverable that matters (§10).

### 3.2 `route` — the whole protocol, as data

Each game's `req` §10/§12 protocol table becomes one function. The host never switches on
event names:

```ts
// yutnori
route(ev, p, viewer) {
  if (!viewer.isMaster) return null;              // req §3 — teams have no client
  switch (ev) {
    case 'master:throw': return { t: 'THROW', roll: p.roll };
    case 'master:move':  return { t: 'MOVE',  malId: p.malId };
    case 'master:undo':  return { t: 'UNDO' };
    ...
  }
}
```

`null` → `error { code: 'NOT_MASTER' | 'UNKNOWN_EVENT' }` from the host. The master check
lives in one place per game rather than being repeated on every handler, and the player
namespaces have no master handlers registered at all (req §8).

**On `/master`, every game action carries `gameId`.** Both protocol tables use
`master:start`, `master:end` and `master:reveal` (bingo §10, yutnori §12) — unambiguous
when each game had its own console, ambiguous the moment one console drives both. The host
consults the named module alone rather than offering the event to each in turn and taking
the first action back, and an action without a `gameId` is refused `BAD_PAYLOAD`. On `/b`
and `/y` the namespace already names the game, so nothing changes there — and, crucially,
**neither game had to rename an event**. The discriminator is the envelope's, not theirs.

### 3.3 `project` — audience-scoped state

```ts
type Viewer =
  | { kind: 'master' }
  | { kind: 'player';    playerId: string }
  | { kind: 'spectator' };                    // board and projector
```

`project` is what makes "players can never see another player's card" (bingo §3) a
**structural** property rather than a discipline: the host only ever sends what `project`
returned for that viewer, so a card cannot leak into a broadcast by accident. Yutnori's
`project` ignores the viewer — its board is public by design (yutnori §12).

### 3.4 `rank` — one podium, two games

```ts
interface RankEntry {
  id: string;
  label: string;        // '민수 #042'        | '청년부 1조'
  detail: string;       // '4:12 · 2줄'       | '말 2개 집 · 12:03'
  medal?: 1 | 2 | 3;
  self?: boolean;       // renders the "나의 순위" band (bingo §9)
}
```

Both games sort their own way — bingo on `firstBingoAt` then `firstBingoSeq` (bingo §9),
yutnori on finisher tier then progress (yutnori §11) — and both hand back the same shape.
One reveal component, one `reveal:step` broadcast, one set of animations, one 나의 순위
band. req §4.2.

### 3.5 Adding a third game

Implement the interface, add one line to the module registry, add a surface route. The
host does not change. This is a **consequence** of the design, not a goal (req §13) — it
is stated so nobody adds an abstraction layer to achieve it.

---

## 4. Identity

### 4.1 Session tokens

No session store, no database row. The cookie **is** the session:

```
value  = base64url(payload) + '.' + base64url(HMAC-SHA256(secret, payload))
payload = { v: 1, iat, exp }        // 12h; no user id — there is one user (req §3.1)
```

| Property | Value |
|---|---|
| Cookie name | `soonot_master` |
| Flags | `HttpOnly; SameSite=Lax; Path=/; Secure` when `TLS=true` |
| Secret | `SESSION_SECRET` env; generated and written to the DB on first boot if unset |
| Verify | Constant-time HMAC compare, then `exp` |
| Rotate | `모든 기기에서 로그아웃` replaces the secret → every outstanding token fails (req §3.4) |

Stateless verification means a server restart mid-event does **not** sign the master out —
which matters, because req §12 requires master recovery with zero operator input.

### 4.2 Sign-in

`POST /master/auth { passcode }` → `scrypt` verify against `MASTER_PASSCODE_HASH` in
constant time → `Set-Cookie`. Rate-limited per IP: 5 attempts/minute, then a 15-minute
lockout (req §8). Failures return one generic message and are never distinguished.

### 4.3 The handshake guard

```ts
io.use((socket, next) => {
  const ns = socket.nsp.name;                       // '/master' | '/b' | '/y' | '/p'
  socket.data.master = ns === '/master' && verify(cookieOf(socket));
  if (ns === '/master' && !socket.data.master) return next(new Error('NOT_MASTER'));
  next();
});
```

- `/p` **ignores the cookie entirely**, so the projector laptop has no privileged channel
  even when the master signed in on that machine earlier (req §8). This is one line and it
  is the single most valuable line in the file.
- A socket's `master` flag is set once, at connect, and is never mutated afterwards. There
  is no upgrade path, so there is no upgrade bug (req §3.3).
- `master:auth` does not exist. It is deleted from both games' protocols.

---

## 5. Event & lifecycle

`event/event.ts` owns `Event`, `GameHandle` (req §4.1) and both shared machines.

```ts
const BASE_ALLOWED: Record<RoomState, string[]> = {
  SETUP:   ['SETUP'],
  LOBBY:   ['START'],
  RUNNING: ['END'],
  ENDED:   ['REVEAL'],
  REVEAL:  ['REVEAL'],
};
// effective = BASE_ALLOWED[state] ∪ module.allowed[state]
```

Yutnori adds `THROW MOVE UNDO PAUSE RESUME EXTEND TICK` to `RUNNING` and
`RESUME_FROM_ENDED` to `ENDED`; bingo adds `FILL CLEAR JOIN REJOIN` to `RUNNING` and
`JOIN` to `LOBBY`. The host answers "can this happen right now?" in exactly one place
(yutnori spec §5.2).

### 5.1 Two host-level rules

Both are checked in `dispatch` **before** the module's `apply` runs, because neither is a
game rule and neither game can see its sibling:

```ts
// req §5.3 — the reveal is exclusive
if (action.t === 'REVEAL' && sibling(game).state === 'REVEAL')
  throw new HostError('REVEAL_BUSY');       // '이미 다른 게임 순위를 발표 중이에요'

// req §5.2 — a reveal seizes the projector
if (action.t === 'REVEAL' && handle.state !== 'REVEAL')
  event.projectorLock = game.id;
```

`projectorLock` clears when that game leaves `REVEAL`, restoring the master's chosen
`projector` setting.

### 5.2 Projector arbitration

`'auto'` resolves server-side, not in the projector client, so every screen agrees:

- track `lastRoomWideEmitAt` per game (an emit with `to: 'room'` — see §6.2),
- switch only if the other game has been quiet for ≥ `PROJECTOR_HOLD_MS` (default 20 000,
  req §14.2),
- `projectorLock` (§5.1) overrides everything.

The resolved channel is broadcast as `projector:channel { gameId }`. The projector client
holds no policy at all — it renders what it is told (§9).

---

## 6. The host loop

### 6.1 Dispatch — written once, for both games

```ts
async function dispatch(gameId: GameId, action: Action, viewer: Viewer) {
  return lock(gameId, async () => {                  // per game, not per event:
    const mod  = modules[gameId];                    // bingo and yutnori never block
    const now  = Date.now();                         // the ONLY clock read (req §9.1)
    const hand = event.games[gameId];

    hostGuards(event, gameId, action, modules);      // §5.1
    assertAllowed(mod.lifecycle(hand.state), action, mod);   // §5

    const { state, emits } = mod.apply(hand.state, action, now);
    if (DEV) mod.invariants(state);

    commit(gameId, state);
    releaseProjectorLock(event, gameId, mod.lifecycle(state));  // §5.1
    persist.enqueue(gameId, state, action, emits);   // §8
    route(emits, gameId, state);                     // §6.2 — after commit, never before
  });
}
```

- **One lock per game**, so a bingo cell fill never waits on a yutnori throw. This is what
  makes req §11's "an action in one game never blocks the other" true by construction.
- `Date.now()` is read here and **nowhere else** in the entire system. Both games'
  "every timestamp is set by the server" requirement (bingo §5, yutnori §5) becomes a
  property of the architecture rather than a rule to remember.
- Broadcast strictly after commit and persist-enqueue, so no client can observe an event a
  reconnect would not reproduce (yutnori spec §5.1).
- The lock chains onto its tail **regardless of how the previous action settled**, so one
  rejected action cannot wedge a game for the rest of the event.

### 6.2 Emit routing — bingo's fan-out discipline, enforced centrally

The host's router is audience-driven. Each module declares its own `Emit` union, and — per
`bingo/spec.md` §1.2 — declares it as a **discriminated union that pairs each event name
with its legal audience**, never as a loose `{ to: string }`:

```ts
// the host routes these; each module owns its own union
type Audience =
  | { to: 'player'; playerId: string }    // unicast
  | { to: 'room' }                        // everyone on that game's surface
  | { to: 'master' }                      // every master device (req §3.4)
  | { to: 'projector' };

// bingo, abbreviated — note cell:result has NO to:'room' variant
type BingoEmit =
  | { to: 'player'; playerId: string; ev: 'cell:result';      data: CellResult }
  | { to: 'room';                     ev: 'bingo:announced';  data: BingoAnnounce }
  | { to: 'master';                   ev: 'dashboard:update'; data: Dashboard };
```

Bingo §16.2 is the one mistake that would actually break the app: broadcasting
`cell:result` turns 8,100 events into 810,000 messages, and it looks free at ten players in
dev. Pairing the event with its audience in the type makes that a **compile error**. The
host's router is a single exhaustive switch over the audience and is the only place in the
codebase permitted to call `io.to(...)`; a lint rule forbids `io.emit` and
`socket.broadcast` everywhere else, in both games.

**The four audience tokens are normative.** These exact strings are the discriminant in
every module's `Emit` union, the cases of the host's router, and the vocabulary both
`req.md` protocol tables use. There is no `all` and no `socket`:

| `to` | Delivered to | Used by |
|---|---|---|
| `player` | one player's socket, by `playerId` | bingo only |
| `room` | every socket on that game's surface, projector included | both |
| `master` | every signed-in master device (req §3.4) | bingo |
| `projector` | the projector surface alone | reserved; nothing emits it in v1 |

| Emit | Game | `to` |
|---|---|---|
| `cell:result`, `cell:candidates`, `card:assigned`, `card:restore`, `roster:snapshot` | bingo | `player` |
| `dashboard:update` | bingo | `master` |
| `roster:delta`, `bingo:announced` | bingo | `room` |
| `throw:recorded`, `board:update`, `capture:announced`, `turn:changed`, `team:finished`, `undo:applied` | yutnori | `room` |
| `room:state`, `game:ended`, `reveal:step` | both | `room` |

`error` is **not** in any module's `Emit` union and is not routed. The host replies with it
directly on the socket that sent the offending action — written `origin` in the `req.md`
tables. This matters because a master may be signed in on two devices (req §3.4): a bad
action typed on the phone must not surface an error on the projector-attached laptop.

**`room:state` is always sent last**, after the granular events, so a client that ignores
them and re-renders from state is still correct. A reconnecting client gets `room:state`
alone — no replayed animations. (yutnori spec §6, now applied to both games.)

Coalescing is a host service too: `roster:delta` declares a 500 ms coalescing window
(bingo §16.3) and the host batches it. Per-socket token bucket, ~10 actions/sec
(bingo §16.6), sits in the same layer and therefore covers yutnori for free.

### 6.3 Namespaces

| Namespace | Viewer | Registered handlers |
|---|---|---|
| `/master` | `{ kind: 'master' }` | both modules' `route`, plus host ops (projector, event, sign-out) |
| `/b` | `{ kind: 'player', playerId }` | bingo's `route` only |
| `/y` | `{ kind: 'spectator' }` | **none** — subscribe only (yutnori §3) |
| `/p` | `{ kind: 'spectator' }` | **none** — subscribe only; cookie ignored (§4.3) |

A namespace with no handlers cannot be driven, which is stronger than a namespace whose
handlers check a flag.

---

## 7. Clock

One `setInterval(1000)` for the whole process — not one per game, not one per room
(yutnori spec §5.4, generalized).

Each tick, for the one active event:

1. For each module with `ticks: true` whose game is `RUNNING` and unpaused, dispatch
   `TICK`. Yutnori opts in (its clock expiry is a state transition, req §10); **bingo opts
   out** — bingo §16.4 is explicit that pushing an elapsed clock to 100 clients is more
   traffic than the entire rest of the game combined.
2. Resolve the projector channel (§5.2) and broadcast on change only.

`serverNow` is piggybacked onto every outgoing message by the emit layer, for free, so
bingo clients correct drift without any server ticks at all (bingo §16.4) and yutnori
clients interpolate between ticks from `performance.now()` (yutnori §10).

---

## 8. Persistence

### 8.1 One database, two strategies

```sql
CREATE TABLE events (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  projector     TEXT NOT NULL DEFAULT 'auto',
  bingo_enabled INTEGER NOT NULL DEFAULT 1,
  yut_enabled   INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  closed_at     INTEGER
);

CREATE TABLE host_config (        -- SESSION_SECRET when not supplied by env (§4.1)
  k TEXT PRIMARY KEY, v TEXT NOT NULL
);
```

Each game keeps its own tables, `event_id`-scoped, exactly as its `req.md` §14 specifies.
`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL`, one file, one connection.

There is **no `master_passcode` table.** The passcode is configuration (req §3.1), hashed
in the environment, never written to the database and never logged.

### 8.2 Strategy A — snapshot (bingo)

```ts
interface SnapshotStrategy<S> {
  kind: 'snapshot';
  write(db, eventId, state: S): void;
  read(db, eventId): S | null;
  triggers: { onTransition: true; onEmits: string[]; debounceMs: number };
}
```

Bingo: `onEmits: ['bingo:announced']`, `debounceMs: 1000`. The host owns the debounce
timer, so bingo §14's "1-second debounce after any cell change, not per fill" is
implemented once, off the hot path, rather than being a discipline inside the game.

### 8.3 Strategy B — event log (yutnori)

```ts
interface EventLogStrategy<S, A> {
  kind: 'eventlog';
  append(db, eventId, action: A, at: number): void;
  truncate(db, eventId, seq: number): void;     // undo
  replay(db, eventId, apply): S | null;
}
```

Yutnori stores no 말 positions — they are derived by replaying the log, which is the same
code path as undo (yutnori spec §4.4, §8.3). Recovery is therefore exercised by every undo
test, not only by a disaster.

> **Why two strategies and not one.** Forcing bingo to event-source would mean storing
> ~8,100 fill events to reconstruct 300 flat arrays; forcing yutnori to snapshot would
> create a second source of truth for 말 positions that can disagree with its log after a
> crash. Each game's `req.md` reached its conclusion for a reason specific to that game.
> The host unifies the *plumbing* — one file, one connection, one enqueue, one boot
> path — and leaves the *policy* where it belongs. Unifying further would be sharing for
> its own sake, which is the failure mode this whole document is otherwise arguing against.

### 8.4 Recovery

On boot: load the one event younger than 6 hours whose games are not all in `REVEAL`;
restore each game by its own strategy; rebuild the registry. Connections are gone, so no
emits are replayed — clients reconnect and receive `room:state` (§6.2).

---

## 9. Clients

Four Vite entries, one shared component library under `master/src/shared/`.

| Entry | Route | Notes |
|---|---|---|
| `console` | `/master` | Sign-in gate + two panes (req §7). One socket on `/master`, both games. |
| `projector` | `/p/:code` | Subscribes to both games; renders the channel named by `projector:channel`. **Zero interactive elements** (yutnori §13.1). Both game boards are mounted and one is hidden, so a switch is instant and does not remount or refetch. |
| `player` | `/b/:code` | Bingo card (bingo §11.2, §12) |
| `board` | `/y/:code` | Yutnori spectator board |

`/` and `/:code` are **static HTML** with no server-rendered data — the path ~100 phones
hit inside a minute (bingo §16.5, req §6).

**Clients never compute game rules.** Not candidates, not rankings, not "can I act now".
They render what `project` returned and disable what the server did not offer
(yutnori spec §7.2). The two exceptions are both local: countdown/elapsed interpolation,
and bingo's client-side roster search — including 초성 matching (bingo §12), which must
stay local because it runs per keystroke against a cached roster.

The console's blocking-state badge (req §5.4) is derived from `project`'s output for the
master — e.g. yutnori's `pendingThrow !== null` — so the host needs no extra concept for
it.

---

## 10. Testing

| Suite | Owner | Covers |
|---|---|---|
| `engine/**` | each game | Every row of that game's edge-case table, as a named test |
| `session.spec` | host | Sign / verify / expiry / tamper / rotation invalidates all (§4.1) |
| `guard.spec` | host | `/p` ignores a valid cookie; a socket's master flag is immutable |
| `lifecycle.spec` | host | Base ∪ module `ALLOWED`; illegal transitions rejected per game |
| `reveal.spec` | host | Exclusivity (req §5.3); projector seize and release (§5.1) |
| `projector.spec` | host | `'auto'` hold window; lock overrides; switch emits once |
| `dispatch.spec` | host | Serialization under concurrent master devices; commit-before-broadcast |
| `emit.spec` | host | **Every bingo emit's audience**, asserted against the §6.2 table |
| `persist.spec` | host | Both strategies round-trip; boot recovery with both games `RUNNING` |
| `two-games.spec` | host | Integration: both `RUNNING`, a bingo fill storm during a yutnori bonus chain, independent locks |

`emit.spec` is the highest-value host test: it is the automated form of bingo §16.2, the
one mistake that would break the event, and it fails loudly the day someone changes a
`socket` to an `all`.

**Load test** (bingo §16.9) runs against the combined host, not bingo alone: 150 headless
bingo clients plus a yutnori master driving throws plus a projector, concurrently. Pass
conditions are unchanged — p95 fill-ack < 300 ms, event-loop p99 < 50 ms.

**Dress rehearsal**, which is the test that actually matters: the real laptop, the real
projector, the real wifi. Sign in once, run both games at once, switch the projector,
reveal one podium while the other game is still running.

---

## 11. Alignment with the `req.md` documents

Behavioral divergences from the two game documents, all of them consequences of there
being one master user — each is folded back into that document by the change list in
req §10, so nothing is left as a silent mismatch:

| Divergence | Game doc | Resolution |
|---|---|---|
| `masterPasscodeHash` leaves `Room` | bingo §5, yutnori §5 | Passcode is deployment config (§4.2); rooms belong to an event |
| `joinCode` leaves `Room` | bingo §5, yutnori §5 | The event owns one code (req §4.1); games carry `eventId` |
| `master:auth` deleted | bingo §10, yutnori §12 | Handshake guard (§4.3) |
| Master reconnect re-enters the passcode | bingo §13, §18; yutnori §17 | Cookie restores it with zero input (req §12) |
| "Shares no code with the bingo app" | yutnori §1, §18 | Reversed (req §10), on demonstrated duplication |
| Per-game process/port/database | bingo §16.10, yutnori spec §11 | One process, one port, one file (§12) |

Where this spec is silent, the game documents are authoritative. Changes to a game's
*behavior* start in its `req.md`; changes to *structure* start here.

### 11.1 Refinements found while building milestones 1–2

Four, all structural, all folded back into the sections above rather than left as drift:

| Refinement | Why | Now in |
|---|---|---|
| `GameModule.lifecycle(state)` | The host has to read a game's `RoomState` to guard it, but game state is opaque. One accessor beats the host owning a duplicate field it must keep in sync. | §3 |
| `gameId` on every `/master` action | Both games use `master:start`, `master:end`, `master:reveal`. One console driving two games cannot disambiguate them by name. | §3.2 |
| `EngineError` moved to `shared/` | Games throw it; a game importing from `host/` would invert the §2 dependency rule. | §3 |
| Node 20 is a hard floor | Vite, Vitest and Socket.IO 4 all require ≥18; the repo's toolchain had 15. | §12 |

None touches a game rule, and none required either game to rename an event or change a
behavior — which is the evidence that the §1 boundary is in the right place.

---

## 12. Config & deployment

One process. One port. One SQLite file. `npm run build && npm start`.

**Node 20 or newer**, enforced by `engines` in the workspace root. Vite, Vitest and
Socket.IO 4 all require ≥18; this is not a preference.

| Env var | Default | Notes |
|---|---|---|
| `PORT` | `3000` | Express + Socket.IO + static assets, all of it |
| `TLS` | `false` | `true` adds `Secure` to the session cookie (§4.1) |
| `DB_PATH` | `./soonot.db` | Delete between events; nothing is meant to survive |
| `MASTER_PASSCODE_HASH` | — | **Required.** `npm run hash-passcode` prints it. |
| `SESSION_SECRET` | generated | Persisted to `host_config` on first boot if unset (§4.1) |
| `PROJECTOR_HOLD_MS` | `20000` | `'auto'` channel hold (§5.2, req §14.2) |
| `NODE_ENV` | `development` | `production` disables invariant throw-on-fail |

**Sizing:** a single machine, 1 shared vCPU / 512 MB, in the region nearest the church
(bingo §16.10). That was oversized for bingo's 300-player target on its own; yutnori adds
one writer and ~100 read-only subscribers, which is noise. Merging the deployments halves
the cost, halves the things that can be misconfigured on the day, and removes the class of
failure where one app is up and the other is not.

Runs equally well on Fly.io / Railway / Render, or on the operator's laptop reached by IP
over the venue LAN. **Not Vercel** — no WebSocket hosting. No internet dependency at
runtime: the room is offline more often than anyone expects, and neither game may care.

---

## 13. Build order

| # | Milestone | Done when |
|---|---|---|
| 1 | `shared/` + `host/module.ts` + `dispatch` + a stub module | A fake game transitions through the lifecycle in a test. No sockets, no UI. |
| 2 | Identity + namespaces + console shell | Sign in once; two empty panes; sign-out rotates |
| 3 | Yutnori module ported onto the contract | Full yutnori game playable through the host |
| 4 | Bingo module ported onto the contract | Both games playable, both `RUNNING` at once |
| 5 | Projector + arbitration + shared reveal | One screen, master switches it; one podium serves both |
| 6 | Persistence + recovery | `kill -9` with both games running; both come back |
| 7 | Load test + dress rehearsal | bingo §16.9 against the combined host, then the real room |

Milestone 1 carries the design risk and none of the framework. **Milestone 3 before
milestone 4 on purpose:** yutnori is the smaller surface — one writer, no unicast, no
roster, no burst — so it proves the contract cheaply. Bingo then exercises the parts
yutnori never touches: unicast routing, coalescing, the token bucket and the 100-client
burst. If the contract is wrong, it is wrong before the harder game is ported onto it.

---

## 14. Traceability

| `req.md` | Implemented in |
|---|---|
| §3.1 one user, no accounts | `identity/passcode.ts`, config only (§4.2, §8.1) |
| §3.2 sign-in, handshake session | `identity/session.ts`, `identity/guard.ts` (§4.1, §4.3) |
| §3.3 surface privileges | `host/namespaces.ts` (§6.3) |
| §3.4 multiple devices | Stateless tokens (§4.1) + per-game lock (§6.1) |
| §4.1 event & code | `event/event.ts`, `event/code.ts`, `events` table (§8.1) |
| §4.2 shared lifecycle & reveal | `shared/lifecycle.ts`, `shared/reveal/`, `rank()` (§3.4, §5) |
| §5.1 both games running | Per-game locks (§6.1), independent handles |
| §5.2 projector arbitration | `event.projector` + `projectorLock` (§5.1, §5.2, §9) |
| §5.3 exclusive reveal | `hostGuards` `REVEAL_BUSY` (§5.1) |
| §5.4 attention budget | `project()` output → console badge (§9) |
| §6 surfaces | Four Vite entries + static `/:code` (§9) |
| §7 console | `console/` (§9) |
| §8 security | §4.1–§4.3, §6.3, §8.1 |
| §9.1 host owns non-rules | §3 contract; lint-enforced dependency direction (§2) |
| §9.2 games keep rules & strategy | `GameModule` (§3), two persistence strategies (§8.2–§8.3) |
| §9.3 one dispatch loop | `host/dispatch.ts` (§6.1) |
| §9.4 one database | `host/persist/` (§8) |
| §10 migration | §11 divergence table |
| §11 NFRs | §6.1 locks, §6.2 fan-out, §7 clock, §10 load test |
| §12 edge cases | One named test per row across §10's suites |
