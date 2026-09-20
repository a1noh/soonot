# 윷놀이 한마당 (Church Yutnori) — Requirements Spec

> **Status:** v1 spec, ready to build
> **Last updated:** 2026-09-20
> **Hosted by:** [`../master/req.md`](../master/req.md) — the shared master user and event
> host. That document is authoritative on identity, the event code, the lifecycle and
> reveal machines, persistence plumbing and deployment; this one on 윷놀이's rules. Changes
> it introduced here are marked **(host)**.

---

## 1. Overview

A projector-driven **yutnori board and scoreboard** for a church event.

Real 윷 sticks are thrown on stage, in front of everyone. The app never rolls anything.
One **master** operator watches each throw, taps 도/개/걸/윷/모, and picks which 말 moves.
The board, the countdown, and the live standings are projected so the whole room can
follow. When the clock runs out — or the master calls it on the spot — the state freezes
and the app reveals the rankings **3rd → 2nd → 1st**.

The participants never touch a device. They throw sticks and shout.

### Goals

- Anyone in the back row can see the whole game state without asking who is winning.
- Zero setup for participants: no phones, no app, no nicknames, no accounts.
- One non-technical person runs the entire thing from a laptop and a projector.
- A timed game that can be cut short at any moment without the ranking feeling arbitrary.
- Mis-taps are recoverable in one click. The operator is working in front of an audience.

### Non-goals (v1)

- Not a yutnori simulator. No 지름길, no 업기, no 백도 — see §18.
- Not a dice game. **The app contains no randomness at all.** Four sticks on a stage are
  the random number generator.
- Not multi-tenant. **One active event at a time** is acceptable. The event also holds a
  bingo game, which may be running at the same time — that is the host's concern, not
  윷놀이's (master §5). **(host)**
- No player accounts, no login, no history between events. The master signs in once, to
  the shared master user (master §3). **(host)**
- Not a standalone deployment. **Everything that is not a 윷놀이 rule lives in the host**
  and is shared with the bingo app (master §9). See the reversal note in §18. **(host)**

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Event** | The gathering. Owns the 4-character code and both games (master §4). **(host)** |
| **Room** | One 윷놀이 game instance, belonging to an event. Board view at `/y/:code`. |
| **Master** | The operator. Enters every throw, moves every 말, runs the clock. The shared master user (master §3). |
| **Board view** | The read-only projected screen. No auth, no interaction. |
| **Team (조)** | A church group, e.g. `청년부 1조`. The unit of play. Has no device. |
| **말** | A playing piece. Each team has 1–2. |
| **참** | Station 0 — both the start and the finish of the loop. |
| **Station** | One of the 20 positions on the loop, indexed `0..19`. |
| **던지기 / Throw** | One throw of the sticks, entered as 도/개/걸/윷/모. |
| **도 / 개 / 걸 / 윷 / 모** | 1 / 2 / 3 / 4 / 5 steps. 윷 and 모 grant an extra throw. |
| **잡기 / Catch** | Landing on an opposing 말, sending it back to 대기 and earning a bonus throw. |
| **대기** | Off-board. A 말 that has not come out yet, or was just caught. `progress: 0`. |
| **집 / Home** | A 말 that completed the loop. `progress: 20`. Safe, cannot be caught. |
| **Throw queue** | Throws still owed to the current team (bonuses from 윷/모/잡기). |
| **TurnEvent** | One recorded throw + move. The unit of undo. |

---

## 3. Roles & permissions

### Master

- Creates the **event** from the console, which mints the code and both games at once
  (master §4.1). No per-room passcode is set — the master is already signed in. **(host)**
- Names the teams, sets 말 count per team, sets the time limit.
- Starts the game.
- **Enters every throw.** Taps 도/개/걸/윷/모 after watching the real sticks land.
- Picks which 말 moves when the team has more than one candidate.
- Undoes the last event.
- Pauses, resumes, extends the clock.
- Ends the game.
- Drives the reveal, one rank at a time.

Master screens are gated by the **shared master session** (master §3.2) — one sign-in at
`/master`, covering this game and bingo, on every device, for the whole event. Knowing
`ABCD` still gets you the board view and nothing else: privilege is decided at the socket
handshake, never in-band, and the board namespace has no master handlers registered at
all. **(host)**

The master may be driving the bingo game at the same time. When 윷놀이 is waiting on a
throw or a 말 selection the whole stage is stalled, so that condition is **blocking** and
raises an alert on the console even when bingo is the focused pane (master §5.4). **(host)**

The master is **not** a player. If the operator also belongs to a team, that team plays
through them like any other — the app models no relationship between the two.

### Board view

- Read-only. No auth. `/y/:code` on a phone, and `/p/:code` on the projector — the
  projector surface is shared with bingo and the master switches which game it shows,
  without anyone walking up to the laptop (master §5.2). **(host)**
- Reachable by event code, so it also opens fine on any phone as a live spectator screen.
- Contains **no interactive elements whatsoever**, so it cannot be tampered with when it
  is displayed on an unattended laptop.

### Teams

- **Teams have no client.** A team is a name, a color, and a set of 말 inside room state.

This is stated explicitly so nobody builds a per-team app by analogy with the bingo
project. §12 has no non-master client→server events, and that is deliberate.

---

## 4. Game lifecycle

```
  SETUP  ──►  LOBBY  ──►  RUNNING  ──►  ENDED  ──►  REVEAL
    │           │            │            │           │
    │           │            │            │           └─ 3rd → 2nd → 1st,
    │           │            │            │              master taps "다음"
    │           │            │            └─ clock frozen, standings frozen,
    │           │            │               master may still 게임 재개
    │           │            └─ throws recorded, 말 move, countdown runs
    │           └─ board shows the teams and "곧 시작합니다"
    └─ master names teams, sets 말 count and time limit
```

All transitions are **master-driven**, with one exception: clock expiry, which the server
fires on its own (§10).

### Transition rules

| From | To | Trigger | Guard |
|---|---|---|---|
| `SETUP` | `LOBBY` | master confirms setup | ≥ 2 teams, unique names, 말 count 1–2, limit ≥ 1 min |
| `LOBBY` | `RUNNING` | master taps `게임 시작` | none |
| `RUNNING` | `RUNNING` | master enters a throw | a throw is owed to the current team (§9) |
| `RUNNING` | `ENDED` | master taps `게임 종료` | confirm dialog — master can always end |
| `RUNNING` | `ENDED` | clock reaches `00:00` | throw queue must be empty (§17) |
| `RUNNING` | `ENDED` | every team has all 말 home | automatic, immediate |
| `ENDED` | `RUNNING` | master taps `게임 재개` | only before the reveal starts |
| `ENDED` | `REVEAL` | master taps `순위 발표` | none — standings become final |
| `REVEAL` | `REVEAL` | master taps `다음` | advances 3rd → 2nd → 1st → full standings |

---

## 5. Data model

```ts
type RoomState = 'SETUP' | 'LOBBY' | 'RUNNING' | 'ENDED' | 'REVEAL';
type Roll = '도' | '개' | '걸' | '윷' | '모';
type EndReason = 'timeup' | 'master' | 'allFinished';

interface Room {
  id: string;                 // internal uuid
  eventId: string;            // the owning event; the 4-char code lives there (master §4.1)
  state: RoomState;

  teams: Team[];              // ordered — this IS the turn order
  malPerTeam: 1 | 2;          // fixed at SETUP, immutable afterwards
  turnIndex: number;          // index into teams[]
  throwQueue: number;         // throws still owed to the current team

  pendingThrow: PendingThrow | null;  // a roll entered, awaiting 말 selection
  history: TurnEvent[];       // append-only; the undo stack and the audit trail

  timeLimitMs: number;
  startedAt: number | null;   // epoch ms, server clock
  pausedAt: number | null;    // set while paused
  totalPausedMs: number;
  endedAt: number | null;
  endReason: EndReason | null;

  revealStep: number;         // 0 = not started, 1 = 3rd, 2 = 2nd, 3 = 1st, 4 = full board
  createdAt: number;
}

interface Team {
  id: string;
  name: string;               // 조 이름, unique within the room
  roster: string | null;      // free text, cosmetic, shown on the projector
  color: string;              // assigned from a fixed high-contrast palette
  mal: Mal[];                 // length === room.malPerTeam
  finishedAt: number | null;  // set when every 말 reaches home
  lastProgressAt: number;     // last time this team's total progress increased
}

interface Mal {
  id: string;
  progress: number;           // 0 = 대기, 1..19 = station index, 20 = 집 (see §6)
}

interface PendingThrow {
  teamId: string;
  roll: Roll;
  at: number;
  candidates: MoveCandidate[];   // computed server-side, never trusted from the client
}

interface MoveCandidate {
  malId: string;
  from: number;               // progress before
  to: number;                 // progress after, capped at 20
  captures: string[];         // malIds that would be sent back to 대기
  finishes: boolean;
}

interface TurnEvent {
  seq: number;                // monotonic, per room
  teamId: string;
  roll: Roll;
  malId: string;
  from: number;
  to: number;
  captures: { malId: string; teamId: string; from: number }[];  // `from` enables exact undo
  bonusGranted: number;       // 0 or 1 for 윷/모, +1 more for a catch
  finishedTeam: boolean;      // this event completed the team
  at: number;                 // server timestamp
}
```

**Every timestamp is set by the server.** The master's browser clock is never trusted for
anything that affects the countdown or the ranking.

---

## 6. Board model

One loop. Twenty stations. No shortcuts, no diagonals.

```
              10  11  12  13  14
          9  ┌─────────────────┐  15
          8  │                 │  16
          7  │                 │  17
          6  │                 │  18
          5  └─────────────────┘  19
               4   3   2   1   0 ← 참
                                  (start & finish)
```

Movement is counter-clockwise from 참: `0 → 1 → 2 → … → 19 → 집`.
Corners are stations `0`, `5`, `10`, `15` — visual anchors only, they carry no rule.

### Progress encoding

Each 말 holds a single number, `progress`:

| `progress` | Meaning | On a station? | Catchable? |
|---|---|---|---|
| `0` | 대기 — at start, or just caught | No | **No** |
| `1..19` | Sitting on that station index | Yes | **Yes** |
| `20` | 집 — finished | No | **No** |

A move is `to = min(from + roll, 20)`. Two 말 share a station iff they share a `progress`
in `1..19`.

### Deliberate deviations from traditional rules

| Traditional | This spec | Why |
|---|---|---|
| Exact count required to finish | **Overshoot goes home** | Removes the "no legal move" state entirely, and with it the pass mechanic, the skip UI, and a class of edge cases. A timed party game must not stall on a team needing to roll exactly 도. |
| 4 말, 지름길, 업기 | 1–2 말, single loop, no stacking | Teachable to a mixed-age crowd in thirty seconds. |
| 백도 (reverse one) | Not implemented | A sixth throw value, negative movement, and an undefined case at `progress: 0`. Not worth it in v1 (§18). |

---

## 7. Throw entry

The master taps one of five buttons. The app supplies no randomness of its own.

| Button | Steps | Extra throw? |
|---|---|---|
| `도` | 1 | no |
| `개` | 2 | no |
| `걸` | 3 | no |
| `윷` | 4 | **yes** |
| `모` | 5 | **yes** |

- A throw must be fully resolved (a 말 selected, §8) before the next one can be entered.
- Bonus throws **queue and stack**: 윷 → 윷 → 개 is three throws in one turn, and a catch
  on any of them adds another.
- **No 백도.** Five values only.
- The app never validates a throw against reality. The master is the source of truth; if
  they tap 모 when the sticks said 개, the board is wrong and §7.1 is the remedy.

### 7.1 Undo (`되돌리기`)

Reverting the last `TurnEvent` restores, exactly:

- the moved 말's `progress`
- every captured 말 to its recorded `from` — not to 0, not to "roughly there"
- the throw queue, including any bonus that event granted
- `turnIndex`, if the event had ended the turn
- `finishedAt` on the team, if that event had completed it

If a throw has been entered but no 말 chosen yet, `되돌리기` cancels **that throw** and
returns it to the queue. This is the mis-tap caught in time, and it is the common case:
the master sees the sticks, taps 모 by accident, and notices before choosing a 말. Nothing
was logged, so nothing is reverted.

Undo is **repeatable** — walk back several events in a row. It is available in `RUNNING`
only; undoing the end of a game is `게임 재개` instead (§10).

Undo is the most-used control on the master screen. It gets no confirm dialog and it is
always visible. There is no redo in v1 (§19).

---

## 8. Movement & catching

### 8.1 Move selection

The server computes one `MoveCandidate` per 말 of the current team that is not home:

- 말 at `대기` (`progress: 0`) → comes out to station `roll`.
- 말 on the board → `min(progress + roll, 20)`.

The master taps the 말 they want; the board highlights the destination while they decide.
**If exactly one candidate exists, the app applies it automatically** — no pointless tap
when there is no choice to make.

### 8.2 Catching (잡기)

- Destination station holds one or more **opposing** 말 → all of them go to `progress: 0`,
  and the capturing team gets **one** extra throw (not one per 말 caught).
- Destination holds **your own** 말 → legal, and nothing happens. They sit on the same
  station and move independently afterwards. No 업기.
- A 말 at `대기` cannot be caught. It is not on a station.
- A 말 at `집` cannot be caught. Home is safe.
- A catch during a bonus throw grants yet another bonus. Chains are legal, and they are the
  best thing that happens in a game of yutnori.

### 8.3 Finishing

- `progress >= 20` → 집. Finishing grants **no** bonus throw.
- When every 말 of a team is home: set `finishedAt`, broadcast `team:finished`, celebrate
  on the board, and skip that team in the turn order from then on.
- **Any bonus throws still owed to that team are forfeit**, and the turn passes. A team
  that finishes on a 윷 has nothing left to move, so the bonus cannot be spent.
- **A team finishing does not end the game** (§10).

---

## 9. Turn order & flow

```
turn begins  →  throwQueue = 1
while throwQueue > 0 and state == RUNNING:
    master enters a throw            throwQueue -= 1
    server computes candidates
    master selects a 말              (auto-applied if only one)
    apply move, resolve capture      if captured:  throwQueue += 1
                                     if 윷 or 모:  throwQueue += 1
turn ends  →  advance turnIndex to the next team with an unfinished 말
```

- Turn order is team creation order, shown on the board with the current team highlighted.
- Teams whose 말 are all home are skipped permanently.
- **There is no pass state.** Overshoot-goes-home (§6) guarantees that every unfinished 말
  has a legal destination for every roll, so a team can never be stuck.
- If every team has finished, the game ends immediately (§10).

---

## 10. Timer & ending

- The master sets a time limit at `SETUP`, in minutes. Default **20**.
- Server-authoritative: `endsAt = startedAt + timeLimitMs + totalPausedMs`. Clients render
  from `clock:tick` (1 Hz) and interpolate locally, so a dropped tick never freezes the
  projected countdown.
- Master controls: `일시정지` / `재개` / `+1분` / `+5분` / `게임 종료`.
- The last 60 seconds turn red and enlarge on the board view.

### At `00:00`

- Throw queue empty → end immediately, `endReason: 'timeup'`.
- A throw still owed → **the current team finishes its queue, then the game ends.** The
  board shows `마지막 차례`. A bonus chain resolves normally; it cannot be abused to run
  forever, because every bonus still requires a real throw on a real stage.

### Other endings

- Master taps `게임 종료` → immediate, `endReason: 'master'`. This is the expected way a
  church event ends: the program moves on and somebody calls it.
- All teams finished → immediate, `endReason: 'allFinished'`, regardless of the clock.
- A single team finishing → **recorded, play continues.** Others can still place.

`ENDED` freezes the clock and the standings, but the master may still tap `게임 재개` to
return to `RUNNING` — for the case of ending by accident. Once `순위 발표` is tapped, the
result is final.

---

## 11. Ranking & reveal

Teams are ranked on the state **at the moment the game ended**, whenever that was.

### Sort order

**Tier 1 — teams with every 말 home**, ranked above everyone else, by `finishedAt`
ascending. Earlier finish wins.

**Tier 2 — everyone else:**

1. Count of 말 at 집, descending.
2. Sum of `progress` across all the team's 말, descending.
3. `lastProgressAt` ascending — the team that reached that state earlier wins.
4. Team creation order ascending.

Criterion 1 is not redundant with criterion 2 (a home 말 contributes 20 to the sum either
way). It is there on purpose: **one 말 all the way home beats the same distance spread
across two 말.** Committing a piece should be worth something.

### Reveal sequence

Counting up, matching the bingo app's reveal: 3rd, then 2nd, then 1st.

| `revealStep` | Shows |
|---|---|
| 0 | `순위를 발표합니다…` holding screen |
| 1 | 🥉 3rd — team name, 말 home count, finish time or progress |
| 2 | 🥈 2nd |
| 3 | 🥇 1st — full-screen celebration |
| 4 | Full standings, every team |

The master advances with `다음`; every connected screen animates off the `reveal:step`
broadcast, so the projector and any phones show the same thing at the same moment.

**Fewer than 3 teams:** reveal only the ranks that exist, then the full board.
**Nobody moved at all:** every team ties at zero, ranked by creation order. The reveal
still runs — quietly.

---

## 12. Realtime protocol (Socket.IO)

### Client → Server

Every `master:*` event requires an authenticated master socket and is rejected otherwise.

| Event | Payload | Notes |
|---|---|---|
| `board:watch` | `{ code }` | No auth. Subscribes to the read-only feed. |
| `master:setup` | `{ teams: [{ name, roster? }], malPerTeam, timeLimitMin }` | `SETUP` only |
| `master:start` | `{}` | |
| `master:throw` | `{ roll }` | One of 도/개/걸/윷/모 |
| `master:move` | `{ malId }` | Must match a candidate from the current `pendingThrow` |
| `master:undo` | `{}` | Reverts the last `TurnEvent` (§7.1) |
| `master:pause` / `master:resume` | `{}` | |
| `master:extend` | `{ minutes }` | |
| `master:end` | `{}` | |
| `master:resumeFromEnded` | `{}` | `ENDED → RUNNING`, before the reveal |
| `master:reveal` | `{ step }` | |

> **No `master:auth`.** Master privilege is established on the socket handshake from the
> shared session cookie and is immutable for the life of the socket (master §3.2, §4.3).
> That deletes this event, its rate limiter, its error path and the "re-enter the passcode
> after a crash" step. **(host)**

### Server → Client

| Event | Payload | Sent to |
|---|---|---|
| `room:state` | `{ state, code, teams, currentTeamId, throwQueue, remainingMs }` | `room` |
| `board:update` | `{ mal: [{ teamId, malId, progress }], lastMove }` | `room` |
| `turn:changed` | `{ teamId, teamName }` | `room` |
| `throw:recorded` | `{ teamId, roll, candidates }` | `room` |
| `capture:announced` | `{ byTeam, victimTeam, station, count }` | `room` |
| `clock:tick` | `{ remainingMs, paused }` | `room`, 1 Hz |
| `team:finished` | `{ teamId, teamName, at, rankAmongFinishers }` | `room` |
| `undo:applied` | `{ revertedSeq }` | `room` |
| `game:ended` | `{ endedAt, reason }` | `room` |
| `reveal:step` | `{ step, entry? }` | `room` |
| `error` | `{ code, message }` | `origin` (host reply, not routed) |

**`candidates` goes to everyone, not just the master.** The board highlights the possible
destinations while the operator decides, and the room gets to see the choice — including
the catch that is about to happen. That anticipation is half the game.

---

## 13. Screens

Two surfaces. No third one.

### 13.1 Board view (projector) — the primary surface

```
┌────────────────────────────────────────────────────────────┐
│  윷놀이 한마당                    ⏱ 12:43           [ABCD] │
├──────────────────────────────────┬─────────────────────────┤
│                                  │  순위                   │
│          10 11 12 13 14          │   1  청년부1조    ●●    │
│       9 ┌──────────────┐ 15      │   2  청년부2조    ●○    │
│       8 │              │ 16      │   3  장년부       ○○    │
│       7 │   🟦  개 (2) │ 17      │                         │
│       6 │              │ 18      │  지금: 청년부2조        │
│       5 └──────────────┘ 19      │  남은 던지기: 1         │
│           4  3  2  1  0참        │                         │
└──────────────────────────────────┴─────────────────────────┘
```

Requirements:

- **Legible at ~10 m on a 720p projection.** 말 markers ≥ 48px at 1080p, team names ≥ 32px,
  countdown ≥ 96px.
- Team identity carried by **color *and* a number/shape** — never color alone. Projectors
  distort color badly, and this is also the accessibility requirement.
- The last throw is shown large and briefly: the word and the number, `개 (2)`.
- **Capture animation:** the victim 말 visibly travels back to 참, with a `잡혔다!` banner
  naming both teams. This is the moment the room reacts to — it must not be subtle.
- Each team has a home tray that fills as 말 finish.
- A per-team 말 legend, so a newcomer can work out what they are looking at.
- **Zero interactive elements.**

### 13.2 Master control

```
┌─────────────────────────────────────┐
│  지금: 청년부2조        남은 1회    │
├─────────────────────────────────────┤
│   [ 도 ]  [ 개 ]  [ 걸 ]            │
│   [ 윷 ]  [ 모 ]                    │
├─────────────────────────────────────┤
│  말 선택                            │
│  [ 말1   7 → 9 ]  [ 말2  대기 → 2 ] │
├─────────────────────────────────────┤
│  [ ↩ 되돌리기 ]                     │
│  [ ⏸ 일시정지 ] [ +1분 ] [ +5분 ]   │
│  [ 게임 종료 ]                      │
└─────────────────────────────────────┘
```

- Five throw buttons, ≥ 64px tall, always in 도/개/걸/윷/모 order so muscle memory forms.
- Candidate 말 buttons show `from → to` and mark a capture (`잡기!`) before it is committed.
- `되돌리기` always visible, never behind a dialog.
- `게임 종료` is the one action with a confirm.
- A small mirror of the board, so the operator never has to turn around and look at the
  projection.
- Must work on a phone as well as a laptop — the operator may be standing by the stage.

---

## 14. Persistence

- **Hot path is in-memory:** `Map<roomId, Room>`.
- **SQLite write-behind**, so a crashed laptop or a restarted server does not lose a game
  that a room full of people is watching:
  - on every state transition,
  - on every `TurnEvent` and every undo,
  - on clock pause/resume/extend.
- Tables: `rooms`, `teams`, `turn_events`. **말 positions are never stored** — they are
  derived by replaying the event log. One source of truth for where a 말 is, which cannot
  disagree with itself after a crash.
- On boot, reload any room not in `REVEAL` and less than 6 hours old: load its setup, then
  **replay `turn_events`** — the same operation undo performs (§7.1). Recovery and undo are
  one code path, so the recovery path is exercised by every undo, not only by a disaster.
- `turn_events` is append-only and is what makes undo, recovery and post-game review
  possible. This is the one place in the app where event-sourcing earns its keep — the
  sibling bingo spec snapshots only, and does not need this.

---

## 15. Internationalization

Korean-first, with an English toggle in the header.

- All UI strings live in **one module** (`src/client/i18n.ts`) from the first commit.
- Shape: `{ ko: {...}, en: {...} }`, keyed by a dotted string id. Default locale `ko`,
  toggle persists per client in `localStorage`.
- **Game vocabulary stays Korean in both locales** — 도/개/걸/윷/모, 말, 잡기, 참, 집.
  Romanizing them would make the app *harder* to follow for the people actually in the
  room. The English locale adds a gloss on first use: `윷 (yut, 4)`.
- Team names and roster text are displayed exactly as typed, never translated.

---

## 16. Non-functional requirements

| Concern | Target |
|---|---|
| Concurrency | One writer (the master) plus up to ~100 read-only board viewers — **alongside a bingo game with up to 300 players, in the same process** (master §11) **(host)** |
| Feedback | < 150 ms from throw tap to board update on local wifi |
| Devices | Master: laptop or phone. Board: projector at 1280×720 or better |
| Network | Master's laptop losing wifi for 10 s must not lose state or desync the board |
| Legibility | Full game state readable at 10 m on a 720p projection |
| Accessibility | Team identity never by color alone; ≥ 44px targets on the master screen |
| Privacy | No PII. Team names and optional roster text only. Nothing survives the event. |
| Availability | Single server is fine. A restart mid-game is recoverable via §14. |

---

## 17. Edge cases

| Case | Behavior |
|---|---|
| Master taps the wrong 도/개/걸/윷/모 | `되돌리기` reverts the whole event; re-enter it |
| Wrong roll tapped, noticed before a 말 is chosen | `되돌리기` cancels the pending throw and returns it to the queue (§7.1) |
| Team finishes while still owed a bonus throw | The bonus is forfeit and the turn passes — there is nothing left to move (§8.3) |
| `되돌리기` with no events yet | Button disabled |
| Undo of a capturing move | Captured 말 return to their **exact** prior progress, and the bonus throw is removed from the queue |
| Undo of a move that sent a 말 home | 말 returns to the board; `finishedAt` cleared; team re-enters the turn order |
| Undo after the turn already advanced | `turnIndex` is restored along with the event |
| 말 caught on the same turn it came out | Normal. Straight back to 대기. |
| Two 말 of one team on one station | Legal. They move independently. No 업기. |
| Landing on 2+ enemy 말 at once | All are sent home; still only **one** bonus throw |
| 말 at 대기 (`progress: 0`) | Cannot be caught — it is not on a station |
| 말 at 집 (`progress: 20`) | Cannot be caught — home is safe |
| Clock hits `00:00` with throws owed | Current team finishes its queue, then `ENDED`. Board shows `마지막 차례`. |
| Clock hits `00:00` mid bonus-chain | Same rule; the chain resolves. Each bonus still needs a real throw, so it cannot run away. |
| All teams finish before the clock | Immediate end, `reason: 'allFinished'` |
| Master ends the game by accident | `ENDED` offers `게임 재개` until `순위 발표` is tapped |
| Master's browser crashes | Reconnect; the session cookie restores control with **no passcode prompt**, state restored from §14 **(host)** |
| Master is also running bingo | Independent locks — a cell fill never blocks a throw, and vice versa (master spec §6.1) **(host)** |
| 윷놀이 reveal while bingo is revealing | Blocked: `이미 다른 게임 순위를 발표 중이에요`. The reveal is exclusive, and a reveal seizes the projector (master §5.2, §5.3) **(host)** |
| Board view disconnects | Auto-reconnect and full `room:state` resync. No state lives on the board client. |
| Only 1 team at setup | Blocked; ≥ 2 teams required to start |
| Two teams with the same name | Blocked. The projector is unreadable otherwise. |
| Master tries to add a team after start | Blocked in v1. Restart the room. |
| Master taps a 말 that is not a candidate | Rejected with an `error`; the board never offered it |
| Master enters a throw while one is pending | Rejected. Resolve the 말 selection first. |
| Nobody moved before the game ended | Everyone ties at zero; ranked by creation order. Reveal still runs. |

---

## 18. Out of scope for v1

- **지름길 / 대각선** (the shortcut diagonals). Fixed single 20-station loop.
- **업기** (stacking 말 to travel together).
- **백도** (the reverse-one throw).
- **Exact-count finishing.** Overshoot goes home (§6).
- **Any randomness in the app.** The sticks are the RNG.
- Per-team clients, team phones, team login.
- Multiple simultaneous rooms.
- Accounts, cross-event history, stats.
- Prize or gift handling.
- Configurable board size. **Fixed at 20 stations.**
- A second master user, or delegating 윷놀이 to a separate operator (master §13).

> **Reversed:** "Shared code with the bingo app" was a v1 non-goal here. It is now the
> design. The original call was right when the alternative was a speculative abstraction
> between two unwritten apps; it is wrong now that both documents exist and agree, line for
> line, on thirteen concerns — lifecycle, reveal, code generation, auth, dispatch,
> persistence, clock, i18n, deployment and more (master §9.1). **Shared code is justified
> by demonstrated duplication, not anticipated duplication**, and the duplication is now
> demonstrated. What stays 윷놀이's own: every rule in §6–§11, its screens, and its
> event-sourced persistence (master §9.2). **(host)**

---

## 19. Open questions

1. **Redo.** Undo is repeatable but there is no redo, so an over-eager operator has to
   replay by hand. Add it if that actually happens at an event.
2. **Editing an older throw.** Only the last event can be reverted. A mistake noticed three
   turns later costs three undos and three re-entries. Acceptable, or worth a direct edit?
3. **말 count.** 1 or 2, master's choice, default 2. With six teams and twenty minutes, 1
   말 is far more likely to produce an actual finisher. Decide after one playtest.
4. **Sound.** A 잡기 sound effect on the projector would land hard in a room. Not specced.
5. **Spectator board on phones.** The board URL already works on a phone by design. Make it
   an advertised feature, or leave it undocumented?
6. **Roster text.** Worth collecting at all, or is the team name enough for the projector?

---

## Appendix A — Design decisions

`yutnori/req.md` was empty before this document, so unlike the sibling bingo spec there is
no original rough draft to preserve. What follows is the decision record that produced it.

| Question | Decision |
|---|---|
| Rules depth | Simplified party version — single 20-station loop, no 지름길, no 업기 |
| Who plays | Teams (church groups), many people per team |
| How the sticks are thrown | Physical 윷 on stage; the result is typed into the app |
| Who enters the throw | **Master only.** One operator, one laptop, one projector. |
| Catching (잡기) | Yes — opponent 말 sent to 대기, catcher gets an extra throw |
| How the game ends | Countdown time limit **and** the master can end it on the spot; ranking is computed from the state at that moment |
| Relationship to the bingo app | ~~Standalone, no shared code.~~ **Superseded:** both games run in one host under one master user (master §10). Rules stay separate; everything else is shared. **(host)** |

### Judgment calls not explicitly ruled on

Three rules were not specified and were decided here. Flagged so they are easy to reverse:

1. **Overshoot goes home** (§6). Traditional yutnori requires an exact count to finish.
   Overshoot was chosen because it eliminates the "no legal move" state, and with it the
   pass mechanic, the skip UI, and a whole family of edge cases — and because a timed game
   in front of an audience must not stall on a team needing to roll exactly 도.
2. **No 백도** (§7). It adds a sixth throw value, negative movement, and an undefined case
   for a 말 at `progress: 0`, in exchange for one more kind of bad luck. Cut from v1.
3. **Default 2 말 per team** (§5). Two gives the master a real choice each turn and makes
   catching matter; one makes a short game more likely to produce a finisher. Master picks
   at setup, default 2. See §19.3.
