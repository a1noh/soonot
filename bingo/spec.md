# 교회 사람 빙고 — Technical Spec

> **Status:** v1, ready to build
> **Last updated:** 2026-09-20
> **Companion to:** [`req.md`](./req.md) — that document is the *what* and *why*, this one
> is the *how*. Section references like (req §7.2) point into it. Where this spec and
> `req.md` disagree, `req.md` wins on behavior and this spec wins on structure; the known
> intentional divergences are listed in §12.
> **Hosted by:** [`../master/spec.md`](../master/spec.md). This app is a `GameModule`
> (master spec §3) plugged into the shared host; everything that is not a bingo rule —
> identity, dispatch, fan-out routing, rate limiting, coalescing, persistence plumbing,
> the reveal and deployment — lives there and is written once, shared with 윷놀이. Changes
> that introduced are marked **(host)**.

---

## 1. Design principles

**1. The rules are a pure function.**

Resolution, validation, line detection and ranking live in a framework-free reducer with
no I/O, no `Date.now()`, and no socket awareness:

```ts
apply(state: Room, action: Action, now: number): { state: Room; emits: Emit[] }
```

Time is an **input**, not an ambient read. That makes every rule in req §7–§9
unit-testable without a server, a browser, or a clock.

**2. Every emit declares its audience, in the type system.**

This is the principle specific to *this* app. req §16.2 identifies the one mistake that
would actually break it: broadcasting `cell:result`. At 100 players there are ~8,100
fills per game; broadcast, that is **810,000 messages**. At 10 players in development it
looks free, which is exactly why it survives code review.

So fan-out is not a call-site decision. Every `Emit` carries its audience as data:

```ts
type Emit =
  | { to: 'player';  playerId: string; ev: 'cell:result';      data: CellResult }
  | { to: 'player';  playerId: string; ev: 'cell:candidates';  data: Candidates }
  | { to: 'player';  playerId: string; ev: 'card:assigned';    data: CardAssign }
  | { to: 'room';    ev: 'bingo:announced'; data: BingoAnnounce }
  | { to: 'room';    ev: 'roster:delta';    data: RosterDelta }
  | { to: 'room';    ev: 'reveal:step';     data: RevealStep }
  | { to: 'master';  ev: 'dashboard:update'; data: Dashboard };
```

`cell:result` has no `to: 'room'` variant, so broadcasting one is a **compile error**, not
a load test finding. The broadcaster is a single exhaustive `switch` over `to` and is the
only place that may call `io.to(...)`; a lint rule forbids `io.emit`/`socket.broadcast`
anywhere else.

That broadcaster is now **the host's** (master spec §6.2), shared with 윷놀이 — which is
why the audience field is required on every emit in both games even though 윷놀이's are all
`to: 'room'`. The type union above stays here, in this module: the host routes audiences,
this app decides which audience each of its events has. **(host)**

Anything that cannot be tested by calling `apply` with a literal state and a literal
action is in the wrong module.

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript, strict, everywhere | The data model in req §5 is already TS; share it verbatim between server and client |
| Engine | Plain TS, zero dependencies | §1 |
| Server | **the shared host** (`@soonot/master`) | Node 20 + Express + Socket.IO, written once for both games (master spec §6) **(host)** |
| DB | the host's single SQLite file | `better-sqlite3`; synchronous, one file, no daemon to run at a church (master spec §8) **(host)** |
| Client | Vite + React 18 | Two screens; the join page must be a static asset (req §16.5) |
| Styling | CSS custom properties + plain CSS | An 81-tile grid is `grid-template-columns: repeat(9, 1fr)`, not a framework problem |
| Tests | Vitest + a `socket.io-client` load harness | Engine tests and the 150-client run are both deliverables (§9) |

**Not chosen, deliberately:** Next.js (nothing to server-render — the join page is static
and everything after it is a socket; req §16.10 already rules out Vercel, which is most of
Next's reason to exist here), Redux (the reducer *is* the state management), a canvas grid
(81 DOM tiles is nothing, and DOM gives text selection, a11y and hit-testing for free),
Postgres (§11), Redis (req §16.0 — the whole point is that one process suffices).

Everything ships as **one process for both games**: the host serves the built static assets
for all four surfaces and hosts the Socket.IO endpoint on the same port. One command, one
port, one database, and **one URL and one code** to put on a slide for the whole afternoon
(master spec §12, req §6). **(host)**

---

## 3. Repo layout

The workspace and the dependency rules are master spec §2. Bingo's own package:

```
bingo/                          # @soonot/bingo
  req.md
  spec.md
  package.json
  src/
    module.ts          # the GameModule export (master spec §3) — the only host-facing file
    project.ts         # audience-scoped state (master spec §3.3) — §7.6
    persist.ts         # the SnapshotStrategy (master spec §8.2) — §8
    shared/
      types.ts          # req §5 verbatim: Room, Player, Trait, BingoEvent, …
      hangul.ts         # NFC normalization + 초성 decomposition (req §7.1, §12)
      lines.ts          # the 20 line definitions + index→(row,col). Pure, shared.
      traits.ts         # the 104-trait starter pack (req §19)
      constants.ts      # GRID=9, CELLS=81, LINES=20, MAX_PLAYERS=999
    engine/
      actions.ts        # the Action union (§4.2)
      apply.ts          # the reducer (§4.3) — the heart of the app
      resolve.ts        # number/nickname → playerId (req §7.0, §7.2)
      bingo.ts          # incremental line detection (§4.5)
      ranking.ts        # req §9 sort order, seq-stable
      invariants.ts     # assertions run in dev + in every test (§4.6)
      __tests__/        # §9
    persist.ts        # the SnapshotStrategy implementation (§8)
    client/
      useRoom.ts        # subscribes to the host's room:state → local mirror
      search.ts         # client-side roster search, incl. 초성 (§7.2) — stays local
      join/             # JoinForm, NumberReveal
      card/             # CardGrid, CellSheet, PersonPicker, ProgressHeader
      master/           # TraitCurator, Dashboard, EndControls — the console pane
```

**Deleted, because the host has them** (master spec §6, §8, §9): `server/index.ts`,
`server/rooms.ts`, `server/handlers.ts`, `server/guards.ts`, `server/fanout.ts`,
`server/ratelimit.ts`, `server/coalesce.ts`, the router, `reveal/`, `i18n.ts` and
`public/`. `handlers.ts` collapses into `module.ts`'s `route` (master spec §3.2);
`guards.ts` into the handshake guard and the merged `ALLOWED` table; `reveal/` into the one
shared podium fed by `rank()` (master spec §3.4). The token bucket and the coalescing
timers become host services, which means **윷놀이 gets both for free**. **(host)**

`shared/` is imported by `engine/` and `client/`. `engine/` imports nothing from `client/`
and nothing from the host beyond types — enforced by a lint rule, because this is the
boundary that keeps §1 true.

---

## 4. The engine

### 4.1 State

`Room` exactly as declared in req §5, including the `byNumber` and `nameIndex` lookup maps
and the per-player parallel arrays. No additional fields. `apply` returns a new object and
never mutates its input.

The parallel arrays (`permutation` / `fills` / `filledAt`) are not a micro-optimization —
they are the wire format (§7.1). Storing 81 `Cell` objects per player and then packing them
on every send is the version of this that allocates during the reconnect storm.

### 4.2 Actions

```ts
type Action =
  | { t: 'SET_TRAITS'; texts: string[] }          // exactly 81
  | { t: 'JOIN';       playerId: string; nickname: string }
  | { t: 'REJOIN';     playerId: string }
  | { t: 'DISCONNECT'; playerId: string }
  | { t: 'START' }
  | { t: 'FILL';       playerId: string; cellIndex: number; query: string }
  | { t: 'FILL_PICK';  playerId: string; cellIndex: number; targetId: string }
  | { t: 'CLEAR';      playerId: string; cellIndex: number }
  | { t: 'END' }
  | { t: 'REVEAL';     step: number };
```

There is no `TICK`. Unlike yutnori, this game has no server-side clock: it ends when the
master says so, and the elapsed display is computed client-side (req §16.4). The absence of
a tick loop is why one process serves 300 players comfortably.

### 4.3 The reducer

```ts
function apply(state: Room, action: Action, now: number):
  { state: Room; emits: Emit[] }
```

- Rejects an illegal action by throwing `EngineError(code)`; the server turns that into the
  `error` socket event (req §10). The engine never silently no-ops.
- Guard table = req §4 transition table, implemented as data, not scattered `if`s:

```ts
const ALLOWED: Record<RoomState, Action['t'][]> = {
  SETUP:   ['SET_TRAITS'],
  LOBBY:   ['JOIN','REJOIN','DISCONNECT','START'],
  RUNNING: ['JOIN','REJOIN','DISCONNECT','FILL','FILL_PICK','CLEAR','END'],
  ENDED:   ['REJOIN','DISCONNECT','REVEAL'],
  REVEAL:  ['REJOIN','DISCONNECT','REVEAL'],
};
```

`JOIN` is legal during `RUNNING` — late joiners are a designed-for case (req §4), flagged
`lateJoin` and clocked from their own `joinedAt`.

**`FILL` order of operations** (req §7.2), the one sequence worth writing down:

1. assert `RUNNING`, assert `fills[cellIndex] === null`
2. `resolve(query)` → `Hit` | `Ambiguous` | `Miss` (§4.4)
3. `Miss` → emit `cell:result{ok:false, reason:'NO_SUCH_PERSON'}`, stop
4. `Ambiguous` → emit `cell:candidates`, stop. **State is unchanged** — no cell is reserved
   while the picker is open, so two cells can be in flight at once without interacting.
5. assert `targetId !== playerId` (`SELF`), assert `!usedPlayerIds.has(targetId)` (`REUSED`)
6. commit: `fills[i] = targetId`, `filledAt[i] = now`, `usedPlayerIds.add(targetId)`
7. run line detection (§4.5) → zero or more `BingoEvent`
8. emit `cell:result{ok:true}` **to the player**, plus one `bingo:announced` **to the room**
   per new line

`FILL_PICK` re-enters at step 5 with an explicit `targetId`. It re-validates everything —
the candidate list the client holds may be stale, and a client-supplied id is never trusted.

### 4.4 Resolution

```ts
type Resolved =
  | { k: 'hit';       playerId: string }
  | { k: 'ambiguous'; playerIds: string[] }
  | { k: 'miss' };

function resolve(room: Room, query: string): Resolved
```

- all-digits query → `byNumber.get(parseInt(q))`, O(1)
- otherwise → `nameIndex.get(nfc(q))`, O(1), returning a **list**; one entry is a hit,
  several is `ambiguous` (req §7.0)

Both indexes are maintained incrementally on `JOIN`. Nothing in the fill path scans the
player list, which is what keeps a fill O(1) at 300 players as at 3.

Numbers come from `nextNumber++` and are never reused, so `byNumber` is append-only.

### 4.5 Line detection

```ts
function linesThrough(i: number): LineId[]   // ≤ 4, precomputed at module load
```

On a successful fill only the ≤ 4 lines through cell `i` can have changed (req §8). Each
check is 9 array reads. ~36 reads per fill; ~300k reads across a full 100-player game,
spread over 20 minutes.

`LINES` and `linesThrough` are built once into flat `Int8Array` tables in `shared/lines.ts`
and shared with the client, which uses the same table to highlight the closest-to-complete
line (req §12). The rule is computed in one place.

A newly completed line appends a `BingoEvent` carrying `seq = room.seq++`, and sets
`firstBingoAt` / `firstBingoSeq` if this is the player's first.

### 4.6 Invariants

`invariants.ts` exports `assertInvariants(room)`, called after every `apply` in dev and in
every test:

- `fills.length === filledAt.length === permutation.length === 81`
- `permutation` is a permutation of `0..80` — every trait exactly once
- `fills[i] !== null` ⟺ `filledAt[i] !== null`
- `usedPlayerIds` equals the set of non-null `fills` — **no duplicates** (req §7.2 rule 5)
- no player's `fills` contains their own id
- `byNumber.size === players.size`; numbers are unique and ≤ 999
- `nameIndex` values partition the player set exactly
- `firstBingoAt !== null` ⟺ `completedLines.length > 0`
- `bingoEvents` is `seq`-contiguous and `at`-monotonic

The `usedPlayerIds` invariant is the one that catches real bugs: the set and the array are
two representations of the same fact, and `CLEAR` has to update both.

### 4.7 Ranking

`ranking.ts` implements req §9 exactly, including the `firstBingoSeq` tie-break. It is a
pure function of `Room` and is called on `END` — never incrementally, never on the hot
path. The dashboard's live top-10 (§5.5) is a separate, cheaper structure; the *official*
ranking is computed once, from scratch, when the game ends.

Two code paths for one thing would be a bug factory, so the dashboard's structure is
asserted equal to `rank(room).slice(0,10)` in tests.

---

## 5. Host integration

> This section used to specify bingo's own server. It is now the list of what the host does
> on its behalf — master spec §6 is the implementation, written once and shared with
> 윷놀이. **(host)**

### 5.1 Dispatch & serialization

The host holds `Map<GameId, state>` plus a **per-game** promise chain that serializes every
action (master spec §6.1). Socket.IO callbacks are async, and two players filling cells in
the same millisecond must not interleave against the same state:

```ts
await lock('bingo', async () => {
  const { state, emits } = apply(current, action, now);   // now = the host's one clock read
  assertInvariants(state);          // dev + test only
  commit('bingo', state);
  persist.enqueue('bingo', state, action, emits);
  route(emits, 'bingo', state);     // §6 — the only broadcaster
});
```

Broadcast happens **after** state is committed, so a client can never observe an event that
a reconnect would not reproduce.

The lock is per *game*, not global and not per room: a 윷 throw never waits on a cell fill,
and vice versa (master req §5.1, §11). It is also what makes `room.seq` a genuine total
order (req §9) — the counter is incremented inside the critical section, so "who got there
first" is decided by the single-threaded event loop and is reproducible. And because `now`
is read by the host and injected, req §5's "every timestamp is set by the server" is a
property of the architecture rather than a rule to remember. **(host)**

### 5.2 Routing

`module.ts`'s `route` (master spec §3.2) is a table, not a switch — each req §10 client
event maps to one action:

| Socket event | Action | Guard |
|---|---|---|
| `room:join` | `JOIN` | rate-limited |
| `room:rejoin` | `REJOIN` | rate-limited |
| `cell:fill` | `FILL` | player, bucket |
| `cell:fillResolved` | `FILL_PICK` | player, bucket |
| `cell:clear` | `CLEAR` | player, bucket |
| `master:setTraits` | `SET_TRAITS` | master |
| `master:start` | `START` | master |
| `master:end` | `END` | master |
| `master:reveal` | `REVEAL` | master |

State guards are **not** written here — they come from the engine's `ALLOWED` table (§4.3),
merged with the host's base table (master spec §5), so there is exactly one place where
"can this happen right now?" is answered.

Two guards the host applies *before* `apply` runs, because neither is a bingo rule and this
app cannot see its sibling: **the reveal is exclusive** across the two games, and a reveal
**seizes the projector** (master spec §5.1). **(host)**

### 5.3 Auth — the master half is entirely the host's **(host)**

- One master user, one passcode, one signed session cookie, covering this game and 윷놀이
  on every device for the whole event (master req §3, spec §4). No per-room passcode.
- Privilege is set on the **socket handshake** and is immutable for the life of the socket.
  `master:auth` does not exist; neither does its rate limiter, its error path, or the
  "re-enter the passcode after a crash" step (req §18).
- Rate limiting moves to `POST /master/auth`: 5 attempts per IP per minute, then a
  15-minute lockout. A 4-character event code is guessable; the passcode must not be
  brute-forceable from it, and it is now never accepted on a code-scoped surface at all.
- The player half is unchanged. Players are not authenticated. `playerId` is a bearer token in `localStorage`; possession
  is identity. This is deliberate and its failure mode is documented in req §13 — a church
  icebreaker does not warrant more, and numbers are public by design.

### 5.4 Rate limiting — a host service **(host)**

Token bucket per socket, 10 actions/sec, burst 20 (req §16.6). Specified by this app's
threat model, implemented once in the host, and therefore covering 윷놀이 too. Excess is **dropped
silently** with a `retryAfter` hint rather than answered with an error — an error reply to a
retry-looping client is itself traffic, which is the failure mode being defended against.

`room:join` is bucketed per-IP as well, since a pre-join socket has no player identity.

### 5.5 Coalescing — a host service **(host)**

Declared by this module per stream, timed by the host (master spec §6.2). Two emitters
never fire on the hot path:

| Stream | Mechanism | Rate |
|---|---|---|
| `roster:delta` | accumulate `{added, removed, changed}` in a pending buffer; flush on a 500ms timer, skip the flush if empty | ≤ 2 Hz |
| `dashboard:update` | recompute top-10 from the incremental structure; flush on a 1s timer | ≤ 1 Hz |

Thirty people joining in the same half-second produce **one** `roster:delta` (req §16.3).
The timers are per-room and stop when a room has no connected sockets.

Everything else is event-driven: there is no periodic tick (§4.2, req §16.4).

---

## 6. Fan-out

The host's router is the only module permitted to touch `io` (master spec §6.2). It is an
exhaustive switch over `Emit['to']`:

```ts
function route(gameId: GameId, emits: Emit[]) {
  for (const e of emits) {
    switch (e.to) {
      case 'player': sockOf(e.playerId)?.emit(e.ev, e.data); break;
      case 'room':   io.of(ns(gameId)).to(code).emit(e.ev, e.data); break;
      case 'master': io.of('/master').emit(e.ev, e.data); break;
    }
  }
}
```

`to: 'master'` reaches **every** master device (master req §3.4) — the laptop driving
윷놀이 and the phone watching this dashboard from the back of the room both get it.

**(host)** — this used to be `server/fanout.ts` here and a separate broadcaster in
윷놀이. One router, one lint rule, one `emit.spec` asserting every audience in the table
below (master spec §10). That test is the automated form of req §16.2.

**The volume table this exists to protect** (req §16.2), per 100-player game:

| Emit | Events | Recipients | Messages |
|---|---|---|---|
| `cell:result` | ~8,100 | 1 | **~8,100** |
| `bingo:announced` | ~50 | 100 | ~5,000 |
| `roster:delta` | ~200 | 100 | ~20,000 |
| `dashboard:update` | ~1,200 | 1 | ~1,200 |

~34,000 messages across a 20-minute game — about 28/sec. If `cell:result` were a
broadcast, the first row alone becomes 810,000 and the total goes up ~24×.

A test asserts that no `Emit` variant with `ev: 'cell:result'` can be constructed with
`to: 'room'`; it is a type-level test (`expectTypeOf`), so it fails at build time.

---

## 7. Client

### 7.1 Wire format

Per req §16.1, a card is never sent as 81 strings:

1. `traits:dict` — `string[81]`, once per connection, ~3KB
2. `card:assigned` — `{ permutation: number[81], number }`, ~200 bytes

The client renders cell `i` as `traits[permutation[i]]`. On reconnect, `card:restore` adds
`fills` (81 player ids or nulls) and `filledAt`. ~1KB per restore, which is what makes 100
simultaneous reconnects an ~80KB event rather than an ~800KB one (req §13).

`permutation` is transmitted as a plain number array; at 81 small ints, JSON is ~200 bytes
and a binary encoding would save bytes that do not matter while costing debuggability.

### 7.2 Search

`search.ts` runs entirely client-side against the cached roster (req §12). Three modes:

```ts
function search(roster: RosterEntry[], q: string): RosterEntry[]
```

| Input | Match |
|---|---|
| `/^\d+$/` | exact player number |
| contains Hangul/Latin | substring on `nicknameKey` |
| all 초성 jamo (`ㅁㅅ`) | prefix match on the cached 초성 string |

초성 decomposition (`민수` → `ㅁㅅ`) is computed **once per roster entry at insert**, from
`(code - 0xAC00) / 588`, and cached on the entry. Re-deriving it per keystroke over 300
entries would be the one place a phone could feel slow.

`shared/hangul.ts` owns both NFC normalization and 초성 extraction and is used by the engine
(for `nicknameKey`) and the client (for search), so the two can never disagree about what
`민수` is.

Results always render `name + #number`, because two rows may read `민수` (req §7.0).

### 7.3 Grid & sheet

- `CardGrid` is 81 `<button>`s in a CSS grid. No virtualization — 81 nodes is nothing, and
  virtualizing breaks pinch-zoom and find-in-page.
- Tapping opens `CellSheet` (req §12): full trait text, the search input, the result list.
- `PersonPicker` renders `cell:candidates` when a name is ambiguous.
- Fill state is a `data-state` attribute driving CSS, so a re-render touches one attribute
  rather than reconciling a subtree. Color is never the only signal — a ✓ is in the markup.

### 7.4 Optimistic fill

On submit the tile goes green at 50% opacity and the sheet closes immediately. The server's
`cell:result` either confirms (full green) or reverts with a shake and the Korean reason
string (req §12).

The client **never decides** whether a fill is legal — not once-per-card, not self-naming,
not line completion. It shows what the server sent. Duplicating req §7.2 on the client is
how the two implementations drift and the green tiles start lying.

### 7.5 Clock

Elapsed time is `Date.now() - startedAt`, corrected by the `serverNow` field piggybacked on
any arriving message (req §16.4). No tick is ever sent: this module sets `ticks: false` on
its `GameModule`, so the host's one shared interval never dispatches to it (master spec §7).
A 1 Hz tick to 100 clients would be 100 msg/sec — more traffic than the rest of the game
combined. 윷놀이 sets `ticks: true`; the same interval serves both, at zero cost here. **(host)**

---

### 7.6 `project` — why card privacy is structural

`project.ts` returns a different payload per viewer (master spec §3.3):

| Viewer | Sees |
|---|---|
| `player` | The 81 trait strings, the roster, and **their own card only** |
| `master` | Counts, the roster, and the live top 10 |
| `spectator` | Counts alone — no cards, no roster, no traits |

req §3 says "players can never see another player's card". Implemented as a
discipline that would be one careless broadcast away from false; implemented as
`project`, it is **structural** — the host only ever sends what `project`
returned for that viewer, so a card has no path into a room-wide emit.

---

## 8. Persistence

### 8.1 Schema

In the host's single SQLite file, alongside `events` and 윷놀이's tables (master spec §8.1).
No passcode is stored anywhere — it is deployment configuration. **(host)**

```sql
CREATE TABLE bingo_rooms (
  event_id       TEXT PRIMARY KEY REFERENCES events(id),
  state          TEXT NOT NULL,
  traits         TEXT NOT NULL,      -- JSON string[81], the curated set
  next_number    INTEGER NOT NULL DEFAULT 1,
  seq            INTEGER NOT NULL DEFAULT 0,
  started_at     INTEGER,
  ended_at       INTEGER,
  reveal_step    INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);

CREATE TABLE bingo_players (
  event_id        TEXT NOT NULL REFERENCES events(id),
  id              TEXT NOT NULL,
  number          INTEGER NOT NULL,
  nickname        TEXT NOT NULL,     -- display form; NOT unique
  nickname_key    TEXT NOT NULL,     -- normalized; NOT unique. Indexed.
  joined_at       INTEGER NOT NULL,
  late_join       INTEGER NOT NULL DEFAULT 0,
  fills           TEXT NOT NULL,     -- JSON (string|null)[81]
  filled_at       TEXT NOT NULL,     -- JSON (number|null)[81]
  first_bingo_at  INTEGER,
  first_bingo_seq INTEGER,
  PRIMARY KEY (event_id, id)
);
CREATE INDEX players_by_key ON bingo_players (event_id, nickname_key);

CREATE TABLE bingo_events (
  event_id   TEXT NOT NULL REFERENCES events(id),
  seq        INTEGER NOT NULL,
  player_id  TEXT NOT NULL,
  line_id    TEXT NOT NULL,
  at         INTEGER NOT NULL,
  PRIMARY KEY (event_id, seq)
);
```

**One row per player, not 81.** A card is two JSON arrays in that row. 100 players × 81
cells would be 8,100 rows rewritten per snapshot; this is 100 (req §14).

`permutation` is **not stored** — it is regenerated from `hash(roomId + playerId)` on
recovery (req §6). The seed is the storage.

### 8.2 Write-behind

This module supplies a `SnapshotStrategy` (master spec §8.2). Synchronous
`better-sqlite3`, but **not inside the game lock** — unlike 윷놀이, writes here are frequent
(~8,100 fills) and the state is snapshot-shaped rather than append-shaped. The host's
`persist.enqueue` marks the game dirty; the debounce timer it owns flushes dirty players in
one transaction. State transitions and `BingoEvent`s flush immediately (req §14).

**Two strategies, deliberately** (master spec §8.3): forcing this game to event-source
would mean storing ~8,100 fill events to rebuild three flat arrays, and forcing 윷놀이 to
snapshot would create a second source of truth for 말 positions. The host unifies the
plumbing — one file, one connection, one enqueue, one boot path — and leaves the policy
where it belongs. **(host)**

`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;`

The debounce is the difference between ~7 whole-room writes per second and one. This is
the single place in the design that could stall the event loop, which is why it is
debounced and why `bingo_events` is append-only rather than part of the snapshot.

### 8.3 Recovery

On boot, for each room not in `REVEAL` and less than 6 hours old: load `rooms`, `players`,
`bingo_events`; regenerate each `permutation` from the seed; rebuild `byNumber`,
`nameIndex` and `usedPlayerIds` from `fills`; then `assertInvariants`.

Rebuilding the derived indexes rather than storing them means recovery exercises the same
construction the engine uses, and the invariant check turns a corrupt snapshot into a loud
failure at boot rather than a wrong green tile at minute 12.

---

## 9. Testing

Engine tests are the deliverable. Target: **every row of req §18 is a named test.**

| Test group | Covers |
|---|---|
| `hangul.spec` | NFC composed ≡ decomposed; 초성 extraction across the syllable range; non-Hangul passthrough |
| `resolve.spec` | Number hit; single-name hit; **three 민수 → ambiguous**; miss; digits-in-nickname not treated as a number |
| `fill.spec` | Self-naming rejected; reuse rejected; occupied cell rejected; clear frees reuse |
| `bingo.spec` | All 20 lines detectable; `linesThrough` correctness for all 81 indices; diagonals only at `r===c` / `r+c===8` |
| `ranking.spec` | `firstBingoAt` order; **same-ms tie broken by `seq`**; no-bingo tier; < 3 bingos; zero bingos |
| `lifecycle.spec` | `ALLOWED` table; late join during RUNNING; join blocked after END |
| `invariants.spec` | Random action sequences over 100 synthetic players never violate §4.6 |
| `recovery.spec` | Property: snapshot → recover → state equality, permutation included |
| `fanout.spec` | Type-level: `cell:result` cannot be `to:'room'`. Plus a count assertion over a simulated game. The host's `emit.spec` asserts the §6 audience table at runtime (master spec §10). **(host)** |

`recovery.spec` and `invariants.spec` carry the most weight — the first validates §8.3, the
second is the only thing that will find a `usedPlayerIds`/`fills` divergence.

### The load test is also a deliverable (req §16.9)

`test/load/` drives **150 headless `socket.io-client`** connections against a
production-shaped build — **of the combined host**, with a 윷놀이 master driving throws and
a projector attached concurrently, because that is what runs on the night (master spec §10).
Pass conditions are unchanged: **(host)**

| Scenario | Shape | Pass condition |
|---|---|---|
| Lobby burst | 150 joins in 30s | all connect, p95 join < 1s |
| Fill storm | 150 × 1 fill / 5s for 10 min | **p95 fill-ack < 300ms** |
| Reconnect storm | kill all sockets, all reconnect at once | 100% restore, no duplicate numbers |
| Bingo race | 20 clients complete a line within ~1s | ranking is a strict total order |

Instrument `perf_hooks.monitorEventLoopDelay`; p99 < 50ms. Also assert **total message
count** against the §6 table — a fan-out regression shows up there long before it shows up
in latency, and that is the whole point of §1.2.

**Run this before the event, not after.** A church icebreaker gets exactly one take.

---

## 10. Build order

| # | Milestone | Done when |
|---|---|---|
| 1 | ✅ `shared/` + `engine/` + tests | A full 100-player game can be played in a test file. No host, no UI. |
| 2 | ✅ `module.ts` against the host contract | The host drives a full game over real sockets (`e2e.spec`) |
| 3 | Card grid + cell sheet + search | Usable on an actual phone, with 초성 search |
| 4 | Trait curator + dashboard pane + shared reveal | A game runs start to finish on the projector; the podium renders off `rank()` |
| 5 | `SnapshotStrategy` + recovery | `kill -9` mid-game, restart, every card is intact |
| 6 | Load test at 150 against the combined host | §9 passes; fix what it finds |
| 7 | Polish | Animations, closest-line highlight, projector type sizes |

This is **milestone 4 of the host's build order** (master spec §13), and it runs *after*
윷놀이: that game proves the contract on the smaller surface — one writer, no unicast, no
roster, no burst — and this one then exercises everything it never touched, namely unicast
routing, coalescing, the token bucket and the 100-client join burst. If the contract is
wrong, it is wrong before the harder game is written against it. **(host)**

Milestone 1 carries the rules risk; **milestone 6 carries the event risk**. Do not let 6
slip to the week of — it is the milestone most likely to change the design, and req §16
exists because of what it would otherwise find on the day.

**Dress rehearsal**: run milestone 7 with 15–20 real phones on the actual venue wifi. Ten
people in a room finds the UX problems a headless load test cannot.

---

## 11. Config & deployment

**Deferred to the host** (master spec §12): one Node process, one port, one SQLite file,
serving both games and all four surfaces (req §16.0, §16.10). This package contributes one
env var and has no `start` script — `npm run build && npm start` at the workspace root is
the whole operation. **(host)**

| Env var | Default | Notes |
|---|---|---|
| `MAX_PLAYERS` | `999` | req §18 hard cap |

Deploy to **Fly.io, 1 shared vCPU / 512MB, single region nearest the church** — oversized
for 300 players (req §16.0), and 윷놀이's one writer plus ~100 read-only subscribers is
noise against that. Railway, Render or a VPS are equivalent. **Not Vercel**: no WebSocket
support.

**This app sets the deployment shape for both.** 윷놀이 alone would have been LAN-only;
bingo cannot be, because 100 personal phones are a mix of church wifi and cellular, so the
host needs a public URL and TLS. One deployment means 윷놀이 gets that too — and it removes
the class of failure where one app is up and the other is not. Keep the URL short and
typo-proof and put it on a slide, with **one code for the whole event** (master req §6) —
at 100 people the likeliest failure is social (nobody can find the link), not technical.

---

## 12. Alignment with `req.md`

**There are no behavioral divergences, and no structural ones either.** Three candidates
came up while writing this spec; each turned out to be something `req.md` already settled:

- **`permutation` is not persisted** (§8.1). req §6 already states the seed is
  deterministic and "only the *fill state* needs persisting" — storing the card too would
  create a second source of truth that can disagree after a crash.
- **The snapshot flush runs outside the game lock** (§8.2). req §14 already requires the
  1-second debounce and to "serialize the snapshot off the hot path".
- **Vite + React, not Next.js** (§2). `req.md` names no frontend framework; §16.5 requires
  a static join page and §16.10 rules out Vercel, which between them leave Next.js with
  nothing to do here.

The one deliberate difference is from the *sibling project*, not from `req.md`:
`yutnori/spec.md` §8.2 puts its SQLite write inside the game lock, and this one does not.
Justified by volume — 윷놀이 writes a few hundred append-only events per game, this writes
~8,100 snapshot updates. Ordering is preserved by the dirty-set flush, and `bingo_events`
stays append-only and immediate. This is exactly why the host keeps **two persistence
strategies** rather than one (master spec §8).

**Structural changes from the host.** This app is a `GameModule`, not a server: identity,
dispatch, fan-out routing, rate limiting, coalescing, persistence plumbing, the reveal and
the deployment moved to `master/` and are shared with 윷놀이. `req.md` §1, §2, §3, §5, §10,
§13, §16.10, §17 and §18 were updated accordingly, and the complete change list is
master §10. The engine (§1, §4) is untouched by any of it — which is the evidence that the
§1 boundary was drawn in the right place. **(host)**

Where this spec is silent, `req.md` is authoritative. Future changes to *behavior* belong
in `req.md` first and arrive here only as a structural consequence; changes to *structure*
start here and touch `req.md` only when they contradict it.

---

## 13. Traceability

| `req.md` | Implemented in |
|---|---|
| §4 lifecycle & transitions | `engine/apply.ts` `ALLOWED` table (§4.3) |
| §5 data model | `shared/types.ts`, verbatim |
| §6 card generation & seed | `engine/apply.ts` `START`; recovery in `persist.ts` (§8.3) |
| §7.0 player numbers | `engine/resolve.ts` (§4.4) |
| §7.1 NFC + normalization | `shared/hangul.ts` (§7.2) |
| §7.2 validation order | `engine/apply.ts` `FILL` (§4.3) |
| §7.3 clearing | `FILL`/`CLEAR` + `usedPlayerIds` invariant (§4.6) |
| §8 win detection | `shared/lines.ts`, `engine/bingo.ts` (§4.5) |
| §9 ranking & `seq` | `engine/ranking.ts` (§4.7) |
| §10 protocol | `module.ts` `route` (§5.2), `Emit` mapping (§6) |
| §11 screens | `client/join/`, `card/`, `master/`; the shared podium (master spec §3.4) |
| §12 mobile UX & 초성 search | `client/card/`, `client/search.ts` (§7.2–7.3) |
| §13 reconnect & storms | `REJOIN` (§4.2), compact restore (§7.1), buckets (§5.4) |
| §14 persistence | `src/persist.ts` `SnapshotStrategy` (§8) |
| §15 i18n | the host's shared `i18n.ts`, bingo string namespace (master spec §2) |
| §16.1 wire format | §7.1 |
| §16.2 broadcast discipline | typed `Emit` (§1.2) + the host's router and `emit.spec` (§6) |
| §16.3 roster deltas | host coalescing, declared here (§5.5) |
| §16.4 no server ticks | no `TICK` action (§4.2), client clock (§7.5) |
| §16.5 lobby burst | static join page (§2), lazy card assignment (§4.3 `START`) |
| §16.6 rate limiting | host token bucket, specified here (§5.4) |
| §16.8 incremental leaderboard | host coalescing, cross-checked against `ranking.ts` (§4.7) |
| §16.9 load test | `test/load/` (§9) |
| §16.10 deployment | §11 |
| §17 non-functional targets | §9 load test pass conditions |
| §18 edge cases | One named test per row (§9) |
| §19 trait pack | `shared/traits.ts` |
