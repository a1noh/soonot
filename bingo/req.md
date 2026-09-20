# 교회 사람 빙고 (Human Bingo) — Requirements Spec

> **Status:** v1 spec, ready to build
> **Last updated:** 2026-09-20
> **Companion to:** [`spec.md`](./spec.md) — this document is the *what* and *why*;
> that one is the *how*. The original one-page ask is preserved in Appendix A.
> **Hosted by:** [`../master/req.md`](../master/req.md) — the shared master user and event
> host. That document is authoritative on identity, the event code, the lifecycle and
> reveal machines, persistence plumbing and deployment; this one on bingo's rules. Changes
> it introduced here are marked **(host)**.

---

## 1. Overview

A real-time, browser-based **human bingo** icebreaker for a church gathering.

Everyone opens a link on their phone, enters a nickname, and receives a **9×9 card**.
Every cell holds a *특징* (a trait, e.g. `새벽기도 참석해본 사람`). Players walk around,
talk to each other, and write the nickname of a person who matches that trait into the
cell. When a typed name matches someone actually in the room, the cell snaps green.
The first player to complete a full line — row, column, or diagonal — gets a **빙고**,
and the server records exactly when. The master ends the game and the app reveals the
rankings **3rd → 2nd → 1st**.

### Goals

- Get people who don't know each other talking, fast.
- Zero friction to join: a link and a nickname. No accounts, no install, no app store.
- Fair, tamper-resistant timing so the podium is not disputed.
- Runnable by one non-technical person (the master) from a laptop with a projector.
- **Hold at least 100 simultaneous players** without degrading. See §16.

### Non-goals (v1)

- Not a persistent social app. A game is ephemeral; nothing survives the event.
- Not multi-tenant. **One active event at a time** is acceptable. The event also holds a
  yutnori game, which may be running at the same time — that is the host's concern, not
  bingo's (master §5). **(host)**
- **No player accounts**, no login, no profile, no photos. The master signs in once, to
  the shared master user (master §3); no attendee ever does. **(host)**
- No verification that a trait is *actually* true of the named person — that stays on
  the honor system. See §7 and §19.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Event** | The gathering. Owns the 4-character code and both games (master §4). **(host)** |
| **Room** | One bingo game instance, belonging to an event. Reached at `/b/:code`. |
| **Master** | The operator. Curates traits, starts/ends the game, drives the reveal. The shared master user (master §3). |
| **Player** | Anyone who joined. Identified by a **player number**, not by name. |
| **Player number** | A sequential 3-digit id (`#001`…) assigned at join. **This is identity.** See §7. |
| **Nickname** | A display name. Self-chosen, **not required to be unique**. |
| **Trait (특징)** | A one-line description of a person, e.g. `악기를 다룰 수 있음`. |
| **Card** | One player's personal 9×9 arrangement of the 81 traits. |
| **Cell** | One square of a card. Holds one trait and, once filled, one player reference. |
| **Line** | A complete row, column, or main diagonal — 9 filled cells. |
| **빙고 / Bingo** | The event of completing any line. |
| **First bingo** | A player's *earliest* completed line. This is what rankings sort on. |

---

## 3. Roles & permissions

### Master

- Creates the **event** from the console, which mints the code and both games at once
  (master §4.1). There is no separate "create a bingo room" step. **(host)**
- Curates the trait set down to exactly 81 (§18).
- Starts the game (`LOBBY → RUNNING`).
- Watches the live dashboard (§11.4).
- Ends the game (`RUNNING → ENDED`).
- Drives the reveal, one rank at a time.
- **May also play.** If the master joins with a nickname they get a card like anyone
  else and appear in the rankings. Opt-in at event creation. The master session and the
  player number are **deliberately unrelated** (master §3.5) — the podium must not depend
  on who is holding the laptop. **(host)**

Master screens are gated by the **shared master session** (master §3.2) — one sign-in at
`/master`, covering this game and yutnori, on every device, for the whole event. There is
no per-room passcode and no `master:auth` step. Knowing `ABCD` still must not let a player
end the game: the event code grants player access only, and master privileges are decided
at the socket handshake, never in-band. **(host)**

### Player

- Joins with a nickname.
- Fills and clears cells on their own card only.
- Sees the live roster (needed — §7 validation depends on who is present).
- Sees a room-wide feed of who has hit bingo.

Players can **never** see another player's card. This is what makes §6 shuffling
meaningful.

---

## 4. Game lifecycle

```
  SETUP  ──►  LOBBY  ──►  RUNNING  ──►  ENDED  ──►  REVEAL
    │           │            │            │           │
    │           │            │            │           └─ 3rd → 2nd → 1st,
    │           │            │            │              master taps "다음"
    │           │            │            └─ clock stops, rankings frozen
    │           │            └─ players fill cells, bingos accumulate,
    │           │               elapsed clock runs
    │           └─ players join, pick nickname, see "곧 시작합니다"
    └─ master curates 81 traits from the built-in pack
```

All transitions are **master-driven** except bingo events, which the server computes
on its own when a cell entry completes a line.

### Transition rules

| From | To | Trigger | Guard |
|---|---|---|---|
| `SETUP` | `LOBBY` | master confirms trait set | exactly 81 traits selected |
| `LOBBY` | `RUNNING` | master taps `게임 시작` | ≥ 2 players joined |
| `RUNNING` | `ENDED` | master taps `게임 종료` | none — master can always end |
| `ENDED` | `REVEAL` | master taps `순위 발표` | none |
| `REVEAL` | `REVEAL` | master taps `다음` | advances 3rd → 2nd → 1st → full board |

### Late joiners

Joining during `RUNNING` is **allowed**. The player is flagged `lateJoin: true` and
**their clock starts at their own `joinedAt`**, not at game start.

> **Deliberate fairness choice.** Ranking on wall-clock-since-game-start would make a
> late joiner unrankable; ranking on personal elapsed time would let someone join at
> minute 20, when the room is crowded and everyone is easy to find, and beat people who
> started cold. We accept the second bias because the first is worse — a person who
> arrives late should still be able to win. The master dashboard shows a `늦참` badge
> so the host can use judgment on the podium.

---

## 5. Data model

```ts
type RoomState = 'SETUP' | 'LOBBY' | 'RUNNING' | 'ENDED' | 'REVEAL';

interface Room {
  id: string;              // internal uuid
  eventId: string;         // the owning event; the 4-char code lives there (master §4.1)
  state: RoomState;
  traits: Trait[];         // exactly 81 once state >= LOBBY. Index IS the trait id on the wire.
  players: Map<string, Player>;
  byNumber: Map<number, string>;   // player number -> playerId. O(1) entry lookup.
  nameIndex: Map<string, string[]>; // nicknameKey -> playerIds[]. Many per key is legal.
  nextNumber: number;      // monotonic; starts at 1
  bingoEvents: BingoEvent[];  // append-only, chronological
  seq: number;             // monotonic counter, incremented per BingoEvent. See §9.
  startedAt: number | null;   // epoch ms, server clock
  endedAt: number | null;
  revealStep: number;         // 0 = not started, 1 = 3rd shown, 2 = 2nd, 3 = 1st
  createdAt: number;
}

interface Trait {
  id: number;              // 0..80 — the index into Room.traits. Integer, not a uuid: see §16.1.
  text: string;            // Korean, one line, <= 40 chars
  category: string;        // 신앙생활 | 교회활동 | 개인취향 | 배경 | 재미
  custom: boolean;         // true if the master typed it
}

interface Player {
  id: string;              // uuid, stored in the client's localStorage
  number: number;          // 1..999, displayed as #042. THE identity. Never reused.
  nickname: string;        // display form, as typed. MAY collide with another player's.
  nicknameKey: string;     // normalized — see §7.1. Used for search only, NOT for uniqueness.
  joinedAt: number;
  lateJoin: boolean;
  connected: boolean;      // false while disconnected, but the Player is NOT deleted
  isMaster: boolean;
  permutation: number[];   // length 81. permutation[cellIndex] = traitId. See §6.
  fills: (string | null)[]; // length 81. fills[cellIndex] = playerId of the person named.
  filledAt: (number | null)[]; // length 81, SERVER timestamps
  usedPlayerIds: Set<string>;  // O(1) once-per-card check (§7.2 rule 4)
  firstBingoAt: number | null;
  firstBingoSeq: number | null;  // total-order tie-break, see §9
  completedLines: string[];      // line ids, in completion order
}

interface BingoEvent {
  playerId: string;
  lineId: string;          // 'row:3' | 'col:7' | 'diag:main' | 'diag:anti'
  at: number;              // server timestamp (ms)
  seq: number;             // Room.seq++. Total order even within one millisecond.
  lineCount: number;       // how many lines this player had after this event
}
```

**Every timestamp is set by the server.** Client clocks are never trusted for anything
that affects ranking.

**Why parallel arrays** (`permutation` / `fills` / `filledAt`) instead of an array of
`Cell` objects: at 100+ players this is 300 flat arrays instead of 8,100 small objects,
and it serializes directly to the compact wire format in §16.1. See §16.7 — the memory
difference is irrelevant, but the *serialization* difference is not.

---

## 6. Card generation

All players share the **same 81 traits** but each gets a **different arrangement**.

- `permutation` is a length-81 array where `permutation[cellIndex] = traitId`.
- Shuffle with Fisher-Yates, seeded by `hash(roomId + playerId)`.
- The seed is **deterministic**, so a reconnecting player's card is regenerated
  identically without storing all 81 positions. Only the *fill state* needs persisting.
- **No free center.** Classic bingo gives you a free middle square; here the center is
  a real trait, because 81 cells with one gifted is a rounding error and a free square
  would make the two diagonals and the middle row/column strictly easier. Deliberate
  departure — noted so nobody "fixes" it later.

Why shuffle: it stops shoulder-surfing and stops someone copying a neighbour's
completed line wholesale.

### Lazy assignment

Cards are generated at the `LOBBY → RUNNING` transition, **not at join**. With 100
people scanning the link inside a minute (§16.5), the join path must stay trivial — no
per-connection shuffle work during the burst. Generating 100 permutations at start is
a single ~1ms loop.

---

## 7. Cell entry & validation

This is the core rule set. **The server is authoritative** — the client may paint a
cell green optimistically, but must revert if the server rejects.

### 7.0 Identity: player numbers, not unique names ⭐

**Nicknames are not unique. The player number is the identity.**

At 100+ people this is not a refinement, it is a correctness requirement. A church of
100 contains three 민수. The v1 design enforced unique nicknames and auto-suffixed the
duplicates to `민수2`, `민수3` — which fails on contact with reality: the person
standing in front of you still introduces themselves as 민수, and has no idea they are
`민수3`. Name-based matching goes ambiguous exactly when the room is most crowded.

So:

- Every player is assigned the next sequential **number** at join: `#001`, `#002`, …
- The number is shown **large in their own card header** so they can read it out.
- A cell entry may be **either** a number or a nickname.
- If a nickname matches exactly one player → resolve immediately.
- If it matches several → return the candidates and let the player pick from a
  disambiguation list showing `민수 #042` / `민수 #087`.
- **Nobody is ever told their name is taken.** That error no longer exists.

Numbers are never reused within a room, even if a player is removed.

### 7.1 Normalization

Nicknames are still normalized — not for uniqueness, but so that **search** works.
Both the typed input and every stored nickname go through:

1. Unicode **NFC** normalization (critical for Hangul — decomposed jamo must match
   composed syllables; iOS and Android keyboards do not agree here).
2. `trim()`.
3. Collapse internal whitespace runs to a single space.
4. Lowercase (affects Latin nicknames only).

The result is `nicknameKey`, the key into `Room.nameIndex`, which maps to a **list** of
player ids.

### 7.2 Validation order

On `cell:fill`, check in this order and stop at the first failure:

| # | Check | Failure message (KR) |
|---|---|---|
| 0 | Socket is within its rate-limit budget (§16.6) | *silently dropped, client backs off* |
| 1 | Game state is `RUNNING` | `아직 게임이 시작되지 않았어요` / `게임이 끝났어요` |
| 2 | Input resolves to a player in this room (by number or name) | `그런 사람이 없어요` |
| 3 | Resolution is unambiguous | *not an error* — returns candidates, client shows a picker |
| 4 | Not the player's own number | `본인은 안 돼요` |
| 5 | That `playerId` is not already in `usedPlayerIds` | `이미 사용한 이름이에요` |
| 6 | This cell is empty | `이미 채워진 칸이에요` |

On pass: set `fills[i]`, `filledAt[i] = Date.now()` (server), add to `usedPlayerIds`,
turn the cell green, then run line detection (§8).

Resolution is O(1) — `byNumber` for a number, `nameIndex` for a name (§5). No scan over
100 players per keystroke or per fill.

### 7.3 Clearing

A player may clear their own filled cell. Clearing **frees that person for reuse**
elsewhere on the card (remove from `usedPlayerIds`). Clearing a cell that was part of a
completed line does **not** retract an already-recorded `BingoEvent` or change
`firstBingoAt` — a bingo, once earned, is permanent. (Otherwise clearing becomes a way
to game the leaderboard, and the reveal could change after the fact.)

### 7.4 Matching a player who has since left

A number resolves against players who are **in the room**, including those currently
`connected: false`. Someone stepping outside for a phone call should not vanish from
everyone's card. A `Player` record is only removed if they never completed joining.

---

## 8. Win detection

A 9×9 grid has exactly **20 lines**:

```
   9 rows  +  9 columns  +  2 diagonals  =  20
```

Line ids: `row:0`..`row:8`, `col:0`..`col:8`, `diag:main` (top-left → bottom-right),
`diag:anti` (top-right → bottom-left).

### Algorithm

On each successful fill at index `i` (row `r = i / 9`, col `c = i % 9`), only the lines
**through that cell** can have changed — at most 4:

- `row:r`
- `col:c`
- `diag:main` if `r === c`
- `diag:anti` if `r + c === 8`

Check each for 9 filled cells. For each newly complete line not already in
`completedLines`:

1. Append to `player.completedLines`.
2. Append a `BingoEvent` carrying `at` **and** `seq = room.seq++`.
3. If `player.firstBingoAt === null`, set `firstBingoAt` and `firstBingoSeq`.
   **This is the ranking key.**
4. Broadcast `bingo:announced` to the whole room → toast `🎉 {nickname} #{number} 빙고!`

This is ~36 array reads per fill, not a 20-line full-board scan. At 100 players and
~8,100 total fills over a game that is ~300k reads spread across 20 minutes — free.

Play **continues after a bingo**. Players keep filling for additional lines, which
matter for tie-breaks (§9) and give people who missed the podium a reason to keep
talking to each other.

---

## 9. Ranking & reveal

### Sort order

Players **with** at least one bingo, ranked first:

1. `firstBingoAt` ascending — earliest wins.
2. Tie → **`firstBingoSeq` ascending.**
3. Tie → `completedLines.length` descending.
4. Tie → filled-cell count descending.
5. Tie → `joinedAt` ascending.

> **Why `seq` exists.** `Date.now()` has millisecond resolution and repeats. With 20
> players a same-millisecond tie is a curiosity; with 100+ racing toward a 9-cell line
> it is a realistic Saturday. `Room.seq` is a single counter incremented inside the
> same synchronous block that stamps the event, so it is a **total order** on a
> single-threaded Node process — whoever's packet the event loop processed first wins,
> which is the fairest answer available and, critically, is *deterministic*. Without it
> the podium can depend on `Array.sort` stability.

Players **without** a bingo rank below all bingo-holders, ordered by:

1. Longest partial line (most filled cells in any single line) descending.
2. Total filled cells descending.
3. `joinedAt` ascending.

### Reveal sequence

Per the original concept, the reveal counts **up**: 3rd, then 2nd, then 1st.

| `revealStep` | Shows |
|---|---|
| 0 | `순위를 발표합니다…` holding screen |
| 1 | 🥉 3rd place — nickname, number, time, line count |
| 2 | 🥈 2nd place |
| 3 | 🥇 1st place — full-screen celebration |
| 4 | Top 20 leaderboard + "나의 순위" band showing the viewer's own rank |

The master advances with a `다음` button. Every client animates in sync off the
`reveal:step` broadcast, so the projector and everyone's phone show the same thing at
the same moment.

**Step 4 shows the top 20, not all 100.** A 100-row final board is unreadable on a
projector and is a needless ~8KB broadcast to every client. Each player additionally
sees their own rank inline, which is the part they actually care about.

**Fewer than 3 bingos:** reveal only the ranks that exist, then jump to the board.
**Zero bingos:** skip the podium entirely, show `이번엔 빙고가 없었어요!` and the board
sorted by progress.

---

## 10. Realtime protocol (Socket.IO)

### Client → Server

| Event | Payload | Notes |
|---|---|---|
| `room:join` | `{ code, nickname }` | Returns `{ playerId, number }`; persist `playerId` in `localStorage` |
| `room:rejoin` | `{ code, playerId }` | Restores card and fill state |
| `cell:fill` | `{ cellIndex, query }` | `query` is a number **or** a nickname (§7.0) |
| `cell:fillResolved` | `{ cellIndex, targetPlayerId }` | Sent after the user picks from a disambiguation list |
| `cell:clear` | `{ cellIndex }` | |

> **No `master:auth`.** Master privilege is established on the socket handshake from the
> shared session cookie and is immutable for the life of the socket (master §3.2, §4.3).
> That deletes this event, its rate limiter, its error path and the "re-enter the
> passcode after a crash" step. **(host)**
| `master:setTraits` | `{ traitTexts[] }` | Must be exactly 81 |
| `master:start` | `{}` | |
| `master:end` | `{}` | |
| `master:reveal` | `{ step }` | |

### Server → Client

The **fan-out** column is the load-bearing part of this table. See §16.2.

| Event | Payload | Fan-out | Rate |
|---|---|---|---|
| `room:state` | `{ state, code, playerCount, startedAt, serverNow }` | `room` | on transition only |
| `traits:dict` | `{ traits: string[81] }` | `player` | once per connection |
| `card:assigned` | `{ permutation: int[81], number }` | `player` | once |
| `card:restore` | `{ permutation, fills, filledAt, completedLines }` | `player` | on rejoin |
| `roster:snapshot` | `{ players: [{ n, id, name, conn }] }` | `player` | on join/rejoin |
| `roster:delta` | `{ added[], removed[], changed[] }` | `room` | coalesced, ≤ 2 Hz |
| `cell:result` | `{ cellIndex, ok, reason?, target? }` | **`player`** | per action |
| `cell:candidates` | `{ cellIndex, candidates: [{n, name}] }` | **`player`** | per ambiguous fill |
| `bingo:announced` | `{ number, nickname, lineCount, at }` | `room` | ~50/game |
| `dashboard:update` | `{ top10, bingoCount, playerCount, connectedCount }` | `master` | ≤ 1 Hz |
| `game:ended` | `{ endedAt }` | `room` | once |
| `reveal:step` | `{ step, entry? }` | `room` | on master tap |
| `error` | `{ code, message }` | `origin` | host reply, not routed |

### Three rules that make this hold at 100+

1. **`cell:result` is unicast.** Cell fills are the high-frequency event — roughly
   8,100 of them across a game with 100 players. Broadcasting each one would be
   ~810,000 messages. Nobody except the filling player needs to know.
2. **The roster is sent as a delta.** Never re-broadcast the full list. §16.3.
3. **No periodic server ticks.** The elapsed clock is computed client-side. §16.4.

---

## 11. Screens

### 11.1 Join

```
┌────────────────────────────┐
│      교회 사람 빙고        │
│                            │
│   참여 코드  [ A B C D ]   │
│   닉네임     [________]    │
│                            │
│        [  입장하기  ]      │
└────────────────────────────┘
```

No uniqueness check, no collision error, no `민수2` (§7.0). Any nickname is accepted
and the server hands back a number. This screen must stay static-renderable — it is hit
by ~100 devices inside a minute (§16.5).

Immediately after joining, the player sees their number confirmed full-screen:

```
┌────────────────────────────┐
│        입장 완료!           │
│                            │
│      민수 님의 번호          │
│                            │
│         # 0 4 2            │
│                            │
│  다른 사람이 물어보면         │
│  이 번호를 알려주세요         │
│                            │
│      [  확인  ]            │
└────────────────────────────┘
```

### 11.2 Player card

See §12 — this is the hard screen.

```
┌────────────────────────────┐
│ 민수 #042  ⏱ 04:12  빙고 1줄│
├────────────────────────────┤
│ ▦▦▦▦▦▦▦▦▦   (9x9 tiles,    │
│ ▦▩▦▦▦▦▦▦▦    green = done) │
│ ▦▦▦▩▦▦▦▦▦                  │
│ ...                        │
├────────────────────────────┤
│ 참여자 100명  ▸  내 번호 #042│
└────────────────────────────┘
```

The player's own number is persistently visible — it is the answer to the most common
question of the whole event ("what do I type for you?").

### 11.3 Master setup

Trait curation: the built-in pack (§19) as a checklist grouped by category, with a
live counter `선택: 73 / 81`, a `+ 직접 추가` field, bulk paste (one trait per line),
and a shuffle-to-fill button that tops the selection up to 81 at random.

### 11.4 Master dashboard (projector view)

Large type, dark background, readable from the back of a room. **Top 10 only** — a
100-row leaderboard is unreadable at projector distance and pointless to transmit.

```
┌──────────────────────────────────────┐
│  참여 코드: ABCD        ⏱ 12:34      │
│  참여자 100명 (접속 97)  빙고 5명      │
├──────────────────┬───────────────────┤
│  실시간 순위      │   빙고 알림        │
│  1 지은 #007 4:12│  🎉 지은 #007 빙고!│
│  2 민수 #042 5:30│  🎉 민수 #042 빙고!│
│  3 서연 #088 6:01│  🎉 서연 #088 빙고!│
│  … top 10        │                   │
├──────────────────┴───────────────────┤
│           [ 게임 종료 ]               │
└──────────────────────────────────────┘
```

`참여자 100명 (접속 97)` — showing joined vs currently-connected lets the master see a
wifi problem developing instead of guessing.

### 11.5 Reveal

Full-screen, one rank at a time, big nickname + number + time + line count, `다음` on
the master's device only.

---

## 12. Mobile UX for a 9×9 grid ⚠️

**This is the single biggest UX risk in the project.**

81 cells of Korean trait text cannot be rendered legibly on a phone. At 360px wide,
each cell is ~38px — room for about two Hangul characters. A naive grid is unusable.

### Required solution: tap-to-open

- The grid renders as **compact tiles**, not text boxes. Each tile shows a heavily
  truncated label (2–3 chars) or a category-colored icon, plus its fill state.
- **Tapping a tile opens a bottom sheet** with the full trait text and the name input:

```
┌────────────────────────────┐
│            ▔▔▔             │
│  3행 5열                    │
│                            │
│  새벽기도 참석해본 사람       │
│                            │
│  [ 이름 또는 번호...     ]  │
│   ▸ 민수 #042              │
│   ▸ 민수 #087              │  ← same name, different people
│   ▸ 민서 #013              │
│                            │
│      [ 확인 ]   [ 비우기 ]  │
└────────────────────────────┘
```

### Search, at 100 names

A 100-entry roster makes the input the critical path. Three matching modes, all
client-side against the cached roster (§10 `roster:snapshot` + `roster:delta`):

| Input | Matches |
|---|---|
| `42` or `042` | player number #042 — exact, instant |
| `민수` | substring on the nickname |
| `ㅁㅅ` | **Hangul 초성 (initial-consonant) search** → 민수, 문선, 명수 |

**초성 search is not optional at this list length.** It is the standard Korean contact-
search idiom, and typing two jamo beats typing a full name while standing in a crowded
room mid-conversation. Decompose each `nicknameKey` into its initial-consonant string
once at roster-load, cache it, and prefix-match.

Results always render the number alongside the name, because two rows may read `민수`.

Autocomplete runs over ≤ 300 cached entries — a plain `filter` is microseconds. No
server round-trip per keystroke; the server is only touched on submit.

### Other grid affordances

- Support **pinch-zoom** and horizontal scroll for people who want to scan the board.
- A persistent header shows elapsed time, completed line count, and progress.
- Highlight the **closest-to-complete line** (e.g. 7/9) so players know what to hunt
  for next. This does a lot of work for engagement.

### Fill-state colors

| State | Look |
|---|---|
| Empty | neutral grey tile |
| Filled | green tile + name |
| Part of a completed line | gold border |
| Pending server confirmation | green at 50% opacity |
| Rejected | brief red shake, revert to grey |

Color is never the only signal — filled cells also carry a ✓, for accessibility and for
anyone on a washed-out projector-lit screen.

---

## 13. Reconnect & sessions

Phones lock, browsers get backgrounded, church wifi drops. At 100 devices on one or two
access points, **reconnects are not an edge case — they are routine traffic.**

- On first join the server issues a `playerId`; the client stores it in `localStorage`
  under `bingo:{code}:playerId` — scoped to the event code, so the two games never collide
  in storage. **(host)**
- On load, if a `playerId` exists for this event code, emit `room:rejoin` instead of
  `room:join`. Server responds with `card:restore` — same card (§6 deterministic
  seed), same fills, same completed lines.
- A disconnect sets `connected: false` but **never deletes the Player**. Their fills
  stand, their bingos stand, and they remain nameable on other people's cards (§7.4).
- **Lost `localStorage`:** the player rejoins as a *new* player with a new number. Their
  old card is orphaned. This is an accepted loss — with numbers as identity there is no
  safe way to prove you are #042, and a church icebreaker does not warrant auth. The
  number-confirmation screen (§11.1) exists partly so people can recover by telling the
  master, who can re-link manually.
- The master's session is the shared one: a signed cookie, restored on reload with **zero
  operator input** and surviving a server restart, because verification is stateless
  (master §4.1). **(host)**

### Reconnect storms

One AP failover disconnects ~100 clients simultaneously; they all retry at once. Three
mitigations, all required:

1. **Randomized backoff** — Socket.IO `reconnectionDelay: 500`,
   `reconnectionDelayMax: 5000`, `randomizationFactor: 0.5`. Without jitter, 100
   clients retry in lockstep forever.
2. **Compact `card:restore`** — the §16.1 permutation format makes each restore ~1KB
   instead of ~8KB, turning an ~800KB thundering burst into ~80KB.
3. **Connection-rate guard** — server accepts new sockets at a bounded rate and sheds
   the excess with a retry hint rather than falling over.

---

## 14. Persistence

- **Hot path is in-memory:** `Map<roomId, Room>`. All reads and writes hit memory.
- **SQLite write-behind snapshot**, so a server restart mid-game is recoverable:
  - on every state transition (`SETUP→LOBBY→RUNNING→ENDED→REVEAL`),
  - on every `BingoEvent`,
  - otherwise on a **1-second debounce** after any cell change (not per-fill).
- **WAL mode** (`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL`). With 100 players
  the debounced snapshot writes roughly once a second against ~8,100 total fills — a
  per-fill write would be ~7 writes/sec of the *entire* room state, which is what makes
  naive SQLite usage the one place this design could actually stall the event loop.
  Serialize the snapshot off the hot path.
- On boot, load any room whose state is not `REVEAL` and is less than 6 hours old.
- Tables: `rooms`, `players`, `bingo_events`. Cards persist as the two packed arrays
  from §5, not as 81 rows per player — 100 players × 81 rows = 8,100 rows rewritten per
  snapshot, versus 100.
- Snapshot, not event-sourcing — simplicity beats auditability here.

---

## 15. Internationalization

Korean-first, with an English toggle in the header.

- All user-facing strings live in **one module** (`lib/i18n.ts`) from the first commit.
  Retrofitting this is always more expensive than doing it up front.
- Shape: `{ ko: {...}, en: {...} }`, keyed by a dotted string id.
- Default locale is `ko`. The toggle is per-client and persists in `localStorage`.
- **Trait text is not translated** — traits are authored in Korean by the master and
  displayed as written, in both locales.

---

## 16. Scale & performance (100+ players)

The hard requirement is **at least 100 simultaneous players**. This section is the
engineering for that, and equally for what *not* to build.

### 16.0 The headline: a single Node process is the right answer

| | |
|---|---|
| **Design target** | 300 concurrent players in one room |
| **Load-tested** | 150 (§16.9) |
| **Architecture** | One Node process. No Redis, no clustering, no horizontal scaling. |

A single Node process handles **~5,000 concurrent WebSockets per vCPU**. At 100 players
that is roughly **2% utilization**; at 300, about 6%. Introducing a Redis adapter and
sticky sessions to serve 100 people would add a network hop, a failure mode, and a
monthly bill in exchange for nothing.

**The bottleneck at this scale is not server capacity. It is message fan-out, burst
shape, and client-side UX.** That is what the rest of this section addresses.

**Escape hatch, documented and deliberately not built:** if this ever needs 1,000+
concurrent, add the Socket.IO Redis adapter plus sticky sessions at the load balancer.
Nothing in this design blocks that. Do not pre-build it.

### 16.1 Wire format: trait dictionary + permutation

The naive `card:assigned` sends 81 Korean trait strings per player — ~8KB each, ~800KB
across 100 players, re-sent in full on every reconnect.

Instead:

1. `traits:dict` — the 81 trait strings, **once per connection**, ~3KB.
2. `card:assigned` — `{ permutation: int[81] }`, ~200 bytes.

The client renders cell `i` as `traits[permutation[i]]`. **~10× smaller** on both first
assign and restore, which is what makes the reconnect storm (§13) survivable. Trait ids
are small integers, not uuids, specifically so the permutation packs tightly.

### 16.2 Broadcast discipline — the one rule that matters

| Event | Volume at 100 players | Fan-out |
|---|---|---|
| `cell:result` | ~8,100/game | **`player`** |
| `roster:delta` | ~200/game, coalesced | `room` |
| `bingo:announced` | ~50/game | `room` |
| `dashboard:update` | ≤ 1/sec | `master` |
| `reveal:step` | ~5/game | `room` |

The four tokens are normative and defined once in master spec §6.2.

Broadcasting `cell:result` would turn 8,100 events into **810,000 messages**. It is the
one mistake that would actually break this app, and it is an easy one to make because
at 10 players in dev it looks free. Nobody but the filling player needs their result.

### 16.3 Roster deltas, coalesced

The v1 design re-broadcast the full player list on every join. During the lobby rush
that is 100 broadcasts of a list growing to 100 entries — O(n²) bytes, ~10,000 messages,
all to deliver a table that ends at ~4KB.

Replace with:

- `roster:snapshot` — full list, **unicast**, on join/rejoin only.
- `roster:delta` — `{ added[], removed[], changed[] }`, broadcast on a **500ms
  coalescing timer** (≤ 2 Hz). Thirty people joining in the same half-second produce
  *one* message.

The client needs the roster because search runs locally (§12).

### 16.4 No periodic server ticks

Never push the elapsed clock. A 1 Hz tick to 100 clients is 100 msg/sec — more traffic
than the entire rest of the game combined, to transmit a number the client can compute.

Clients derive elapsed time from `startedAt`, and correct drift from the `serverNow`
field piggybacked on any message they happen to receive.

### 16.5 The lobby thundering herd

The realistic join shape: the master says "go to bingo.church/ABCD", and **~100 phones
hit the server within 30–60 seconds.**

- The join page must be **static / edge-cacheable**. No SSR database work on the path
  every attendee hits at once.
- Cards are assigned lazily at game start, not at join (§6) — the join path does no
  shuffle work.
- Keep per-connection join work O(1): append to `byNumber` and `nameIndex`, nothing
  more.
- Prefer WebSocket transport but leave HTTP long-polling fallback enabled; on bad
  church wifi some clients will never upgrade, and 100 stuck pollers are still fine.

### 16.6 Per-socket rate limiting

Token bucket per socket, **~10 actions/sec**, excess silently dropped with a backoff
hint. The realistic threat here is not malice — it is one client stuck in a retry loop
against a rejected fill, multiplied by a room full of phones.

### 16.7 Memory is not a problem — say so out loud

100 players × 81 cells ≈ **1 MB** of game state. 300 players ≈ 3 MB.

Stated explicitly so that no one spends time compressing state that fits in L3 cache.
The scarce resources here are **message rate** and **event-loop time**, not RAM.

### 16.8 Incremental leaderboard

Do not re-sort 100 players on every fill. Maintain the bingo-holder ranking
incrementally — it only changes when a `BingoEvent` fires (~50 times a game), and it is
append-mostly since `firstBingoAt` never changes once set. The dashboard reads the top
10 off that structure at ≤ 1 Hz.

### 16.9 Load test (build this before the event)

A script driving **150 headless `socket.io-client`** connections, run against a
production-shaped deploy:

| Scenario | Shape | Pass condition |
|---|---|---|
| Lobby burst | 150 joins in 30s | all connect, no error, p95 join < 1s |
| Fill storm | 150 clients × 1 fill / 5s for 10 min | **p95 fill-ack < 300ms** |
| Reconnect storm | kill all sockets, all reconnect at once | 100% restore, no duplicate numbers |
| Bingo race | 20 clients complete a line within ~1s | ranking is a strict total order (§9 `seq`) |

Also watch event-loop lag (`perf_hooks.monitorEventLoopDelay`) — p99 should stay under
50ms. **Run this before the event, not after.** A church icebreaker gets exactly one
take.

### 16.10 Deployment sizing

- **Fly.io single machine, 1 shared vCPU / 512MB**, single region nearest the church.
  That is oversized for 300 players and costs a few dollars a month. **This same machine
  also runs yutnori** — one writer and ~100 read-only subscribers, which is noise against
  these numbers. One process, one port, one database (master spec §12). **(host)**
- **Not Vercel** — it does not host WebSocket servers. Railway, Render, or a plain VPS
  work equally well.
- Single machine means a restart drops all connections; §13 reconnect plus §14 SQLite
  snapshot make that a ~5-second blip rather than a lost game.
- Have the join URL be short and typo-proof, and put it on a slide. At 100 people, the
  failure mode is social (people can't find the link), not technical. **There is exactly
  one code for the whole event**, and `/:code` offers a button per game — so the slide
  carries one URL and one code all afternoon (master §6). **(host)**

---

## 17. Non-functional requirements

| Concern | Target |
|---|---|
| **Concurrency** | **300 players in one room; load-tested at 150 (§16.9)** |
| **Lobby burst** | 100 joins within 60s, p95 join < 1s |
| **Entry feedback** | p95 < 300ms tap→green under sustained 150-client load |
| **Reconnect storm** | 100 simultaneous reconnects, 100% state restore |
| **Event-loop lag** | p99 < 50ms under load |
| Device | Mobile-first; must work on iOS Safari and Android Chrome |
| Network | Tolerate 2–3s dropouts without losing state; long-polling fallback enabled |
| Privacy | No player accounts. No PII beyond a self-chosen nickname. Nothing persists past the event. |
| Accessibility | Fill state never conveyed by color alone; min 44px tap targets |
| Availability | Single server. A 30s outage mid-game is survivable via §13 + §14. |

---

## 18. Edge cases

| Case | Behavior |
|---|---|
| **Three people named 민수** | All three join as 민수, with numbers #042/#087/#091. Search returns all three; player picks. **No error, no renaming.** (§7.0) |
| Duplicate nickname at join | Not an error. Nicknames are not unique. |
| `민수` vs `민수 ` (trailing space) | Same `nicknameKey` — both surface in the same search result |
| Decomposed vs composed Hangul | NFC normalization makes them equal (§7.1) |
| **Lobby thundering herd** | ~100 joins in 60s. Static join page, O(1) join work, lazy card assignment (§16.5) |
| **100 simultaneous reconnects** (AP failover) | Jittered backoff + compact restore + rate guard (§13) |
| Player disconnects mid-game | `connected: false`; fills and bingos stand; still nameable |
| Player used in someone's cell then leaves | **Cell stays green.** Nobody loses progress for someone else's dead battery. |
| Player clears `localStorage` | Rejoins as a new player with a new number; old card orphaned. Master can re-link manually. (§13) |
| Master disconnects | Game continues in `RUNNING`; the session cookie restores control on reload, with no passcode prompt **(host)** |
| Master is also driving yutnori | Independent locks — a yutnori throw never blocks a cell fill, and vice versa (master spec §6.1) **(host)** |
| Bingo reveal while yutnori is revealing | Blocked: `이미 다른 게임 순위를 발표 중이에요`. The reveal is exclusive (master §5.3) **(host)** |
| Master ends game with zero bingos | Skip podium, show progress-sorted board (§9) |
| Fewer than 9 attendees | A line is mathematically impossible. Warn the master at start: `참여자가 9명 미만이라 빙고가 불가능해요` |
| Attendee count < 81 | Card can never fill completely. Expected and fine — line win only. |
| **Two bingos in the same millisecond** | Realistic at 100 players. Resolved by `seq` total order (§9). |
| **Client retry-loops on a rejected fill** | Token bucket drops the excess, client backs off (§16.6) |
| **Number exhaustion past #999** | Hard cap at 999 players; further joins rejected with `정원이 가득 찼어요`. Far above the 300 design target. |
| Name entered before that person joins | Rejected (`그런 사람이 없어요`). Player retries after they join. |
| Player clears a cell in a completed line | Bingo already recorded stands (§7.3) |
| Master starts with < 81 traits selected | Blocked; `선택: 73 / 81` counter gates the button |

---

## 19. Starter trait pack

Ship **104** traits so the master can curate down to 81 with real choice. Church-
appropriate, spanning easy (most people qualify) to rare (a fun hunt). A good card
mixes both — all-easy is boring, all-rare stalls.

### 신앙생활 (Faith life)

새벽기도 참석해본 사람 · 성경 통독 완주해본 사람 · 암송 구절 10개 이상 · 세례받은 지
1년 미만 · 세례받은 지 10년 이상 · 큐티를 매일 하는 사람 · 성경책을 3권 이상 가진 사람
· 기도수첩이 있는 사람 · 금요철야 참석해본 사람 · 단기선교 다녀온 사람 · 수련회에서
울어본 사람 · 전도해본 경험이 있는 사람 · 성경 66권 순서를 외우는 사람 · 주일예배
1부에 오는 사람 · 교회에서 신앙 상담 받아본 사람 · 부흥회 참석해본 사람 · 성경필사
해본 사람 · 매일 성경 앱을 쓰는 사람

### 교회활동 (Church involvement)

새가족 (3개월 미만) · 교회 10년 이상 다닌 사람 · 찬양팀 경험이 있는 사람 · 주일학교
교사 경험 · 성가대 경험 · 음향/미디어팀 경험 · 주차봉사 해본 사람 · 식당봉사 해본 사람
· 셀 리더 경험 · 청년부 출신 · 중고등부 출신 · 유아세례 받은 사람 · 교회에서 결혼식
올린 사람 · 부모님도 같은 교회 · 교회 수련회 총무 해본 사람 · 교회 차량 운전해본 사람
· 헌금위원 해본 사람 · 교회 행사 사회 봐본 사람

### 배경 (Background)

형제자매가 3명 이상 · 외동 · 쌍둥이 · 서울 출신 · 부산 출신 · 제주도에서 살아본 사람 ·
해외에서 1년 이상 살아본 사람 · 유학 경험이 있는 사람 · 군대 다녀온 사람 · 이사를 5번
이상 해본 사람 · 지금 자취 중인 사람 · 결혼한 사람 · 자녀가 있는 사람 · 손주가 있는 사람
· 반려동물을 키우는 사람 · 고양이를 키우는 사람 · 강아지를 키우는 사람 · 대가족과 함께
사는 사람 · 30분 이상 걸려서 교회 오는 사람 · 걸어서 교회 오는 사람

### 개인취향 (Personal taste)

커피보다 차를 좋아하는 사람 · 아메리카노만 마시는 사람 · 민트초코를 좋아하는 사람 ·
매운 음식을 잘 먹는 사람 · 회를 못 먹는 사람 · 아침형 인간 · 저녁형 인간 · 등산을
좋아하는 사람 · 러닝을 하는 사람 · 헬스장에 다니는 사람 · 축구를 좋아하는 사람 · 야구팀
팬인 사람 · 악기를 다룰 수 있는 사람 · 피아노를 칠 줄 아는 사람 · 기타를 칠 줄 아는 사람
· 노래방 애창곡이 있는 사람 · 그림을 잘 그리는 사람 · 사진 찍는 걸 좋아하는 사람 · 책을
한 달에 1권 이상 읽는 사람 · 드라마를 정주행하는 사람 · 요리를 즐겨 하는 사람 · 베이킹을
해본 사람 · 식물을 키우는 사람 · 캠핑을 좋아하는 사람

### 재미 (Fun / conversation starters)

이름이 3글자가 아닌 사람 · 성이 김/이/박이 아닌 사람 · 생일이 이번 달인 사람 · 나와 같은
띠인 사람 · 왼손잡이 · 안경을 쓴 사람 · 렌즈를 낀 사람 · 오늘 처음 인사한 사람 · 지금
입은 옷이 파란색인 사람 · 운동화를 신은 사람 · MBTI가 I로 시작하는 사람 · MBTI가 E로
시작하는 사람 · 휴대폰 배경화면이 사람 사진인 사람 · 아이폰 쓰는 사람 · 갤럭시 쓰는 사람
· 운전면허가 없는 사람 · 자전거를 탈 줄 모르는 사람 · 수영을 할 줄 아는 사람 · 외국어를
2개 이상 하는 사람 · 사투리를 쓰는 사람 · 별명이 있는 사람 · 오늘 아침을 먹고 온
사람 · 지각한 사람 · 어제 6시간 이하로 잔 사람

> **Curation guidance for the master:** aim for roughly 60% traits that many people
> qualify for and 40% rarer ones. If the group is small, skew easy — with 30 people
> and 81 hard traits, nobody completes a line.

---

## 20. Out of scope for v1

- Multiple simultaneous rooms.
- Trait verification by the named person (the "confirm you really do play guitar"
  flow). Considered and dropped: it doubles the interaction cost and keeps everyone
  staring at their phone instead of talking.
- Self-declared traits at join time, auto-validated against entries.
- Photos, avatars, profiles.
- Prize/gift handling.
- Game history, past events, stats across games.
- Configurable grid size. **Fixed at 9×9.**
- Configurable win condition. **Fixed at first-line.**

---

## 21. Open questions

1. **Elapsed-time display during play** — does showing every player their own running
   clock create useful urgency, or stress? Easy to toggle; decide at first playtest.
2. **Should the master see individual cards?** Useful for settling a dispute and for
   manually re-linking a player who cleared their `localStorage` (§13). Currently: no.
3. **Trait pack persistence** — should a curated 81-trait set be savable and reloadable
   for the next event? Cheap to add, but §1 says nothing survives the event. Revisit
   if the game gets used more than once.
4. **Sound** — a bingo chime on the projector would land well in a room of 100. Not
   specced.

---

## Appendix A — Original source requirements

Preserved verbatim, so this document stands alone.

> **Context:**
>
> I want to create a bingo app. Mutliple people will be able to connect to this bingo
> app - it will be a web app and people will enter their nick names. Will be like 9 X 9.
> And it will have peoples 특징 as each row col. People will be able to enter other
> people name into each of the grids and the app will record first to last. The master
> user will hit end game and Will show the rankings. WIll show from rank 3~ 1 who won
> the bingo game the fastest.
>
> **Req:**
>
> - each user will be unique user
> - there will be a master user who will hit end game
> - it will record time
> - each user will be able to enter other user names
> - needs a person 특징 each grid - this is a church setting so keep that in mind
> - people can freely enter into the girds -> grids will snap green or wtv if exisitng
>   username is matching
> - will record rankings based on time of finishing (finisghing a row?)

### How each source requirement is resolved

| Source line | Resolved in |
|---|---|
| unique user | §7.0 **player numbers** — identity is `#042`, not the name |
| master hits end game | §3, §4 transition table |
| records time | §5 server timestamps, §8 `firstBingoAt` |
| enter other user names | §7 validation chain |
| 특징 per grid, church setting | §19 starter pack (104 Korean church traits) |
| snap green if username matches | §7.2 check 2, §12 fill-state colors |
| rankings by finish time | §9 sort order + `seq` total order |
| "finishing a row?" | **Resolved:** first completed row, column, or diagonal (§8) |

### Requirements added after the first draft

| Added requirement | Resolved in |
|---|---|
| **at least 100 people connect at once** | §16 in full; §17 targets |
| ...and "optimize for the best way" | §16.0 — single process is the right answer at this scale; the work is fan-out and burst shape, not capacity |
| **one master user across both apps, running simultaneously** | [`../master/req.md`](../master/req.md); the changes it made here are marked **(host)** and listed in master §10 |
