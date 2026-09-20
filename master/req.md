# 마스터 — Shared Master User & Event Host — Requirements Spec

> **Status:** v1 spec, ready to build
> **Last updated:** 2026-09-20
> **Companion to:** [`spec.md`](./spec.md) — this document is the *what* and *why*;
> that one is the *how*. The original ask is preserved in Appendix A.
> **Governs:** [`../bingo/req.md`](../bingo/req.md) and [`../yutnori/req.md`](../yutnori/req.md)
> on every subject in §3 (identity), §4 (events), §5 (simultaneity) and §9 (the host).
> Those documents keep authority over their own game rules and nothing else.

---

## 1. Overview

One church event. One operator. Two games.

Today `bingo/` and `yutnori/` are two standalone apps, each with its own passcode, its own
4-character join code, its own console, its own process and its own database — and each
with its own copy of the same lifecycle machine, the same reveal machine, the same
join-code generator, the same write-behind persistence and the same socket bootstrap.

This document replaces that with **one master user** who signs in once and runs **both
games simultaneously** from one console, against **one event code**, out of **one
process**.

```
                      ┌──────────────────────────┐
   passcode  ───────► │   마스터 (one session)    │
                      └────────────┬─────────────┘
                                   │  one event: ABCD
                  ┌────────────────┴────────────────┐
                  ▼                                 ▼
          ┌───────────────┐                 ┌───────────────┐
          │  빙고 게임     │                 │  윷놀이 게임    │
          │  RUNNING      │                 │  LOBBY        │
          │  100 phones   │                 │  projector    │
          └───────────────┘                 └───────────────┘
                  └──────────► one projector ◄──────┘
                               (master arbitrates)
```

### Goals

- **Sign in once.** One passcode grants master privileges in every game, on every device,
  for the whole event.
- **One code on the slide.** Attendees are told exactly one URL and one 4-character code,
  for the whole afternoon. At 100+ people the failure mode is social, not technical
  (bingo §16.10) — two codes doubles that failure.
- **Both games live at once.** Bingo runs in the background while people mingle; yutnori
  runs on stage. Neither has to be torn down for the other to start.
- **Build each rule once.** Everything that is not a game rule is written once, in the
  host, and used by both games. §9 is the list.
- **One thing to deploy.** One process, one port, one SQLite file, one restart.

### Non-goals (v1)

- **Not a user system.** There is exactly **one** master user per deployment. No
  registration, no roles, no admin list, no password reset, no email. See §3.1.
- **Not multi-tenant.** One active event at a time, holding one instance of each game.
- **No player accounts.** Attendees never sign in. Bingo players are still just a nickname
  and a number; yutnori teams still have no device at all.
- Not a third game engine. The host contains **no game rules whatsoever** (§9.1).
- No cross-event history, stats, or leaderboards spanning events.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Master user** | The single operator identity for the whole deployment. One passcode. |
| **Session** | A signed token proving "this browser is the master user". Survives reloads and reconnects. |
| **Device** | One browser holding a session. The master may hold several at once (§3.4). |
| **Event** | One church gathering. Owns a 4-character **event code** and one instance of each game. |
| **Event code** | `ABCD` — 4 chars, `A-Z` minus `I` and `O`. **Replaces both apps' join codes.** |
| **Game** | `bingo` or `yutnori`. A plug-in module with its own state, rules and screens. |
| **Surface** | A URL an audience reaches: player, board, projector, console. §6. |
| **Projector channel** | The single large screen. Exactly one game owns it at a time (§5.2). |
| **Console** | The master's screen. Two panes, one per game, plus event-level controls. §7. |
| **Host** | The shared layer: identity, events, dispatch, persistence, clock, sockets. §9. |

---

## 3. The master user

### 3.1 One user, one passcode, no accounts

There is **one** master user per deployment. It is not a row in a `users` table; it is a
passcode in the deployment's configuration, and a session cookie derived from it.

> **Why not accounts.** The realistic population of masters for a church game night is one
> person, occasionally handing the laptop to a second. Every account feature — signup,
> roles, recovery, invitation — costs code, costs a screen, and costs a failure mode on an
> evening where the operator is already standing in front of a hundred people. A single
> shared credential is the honest model of what is actually happening, and it is the model
> both apps already had; this document merges the two copies of it into one.

The passcode is set once, in configuration, before the event. It is **not** created per
room the way both apps do today — a per-room passcode invented at setup is one more thing
to remember and to mistype while a room waits.

### 3.2 Sign-in

| | |
|---|---|
| Where | `/master` — a dedicated URL, never reachable by guessing an event code |
| Input | The master passcode. Nothing else. |
| Output | A signed **session cookie**, `httpOnly`, `SameSite=Lax`, 12-hour expiry |
| Scope | **Every game, every event, every surface.** There is nothing further to unlock. |

The session is presented on the **socket handshake**, not as an in-band socket event.

> **Why this matters more than it looks.** Both apps today define a `master:auth` socket
> event that carries the passcode over an already-open connection, and both must then
> rate-limit it, hash-compare it, and remember the result per socket. Moving the proof to
> the handshake deletes that event, its rate limiter, its error code and its reconnect
> path **from both apps at once** — and it closes the window where an unauthenticated
> socket exists in a privileged namespace. Reconnects carry the cookie automatically, so
> "re-enter the passcode after a crash" (bingo §18, yutnori §17) stops being a step.

### 3.3 What the session grants

| Surface | Session required? | Privileges |
|---|---|---|
| Console (`/master`) | **yes** | Everything |
| Projector (`/p/:code`) | no | Read-only, and **never upgraded** to anything else |
| Bingo player (`/b/:code`) | no | Own card only |
| Yutnori board (`/y/:code`) | no | Read-only |

A socket without a valid session is refused every `master:*` action with
`error { code: 'NOT_MASTER' }`. A read-only socket is read-only for its whole life — it is
never promoted, so an unattended projector laptop has no privileged channel to misuse.

### 3.4 Multiple devices, one user

The master user is an **identity, not a device**. Signing in on a second device is
expected and supported: the laptop drives yutnori and the projector, the phone watches the
bingo dashboard from the back of the room.

- Any number of devices may hold the session at the same time.
- Every master device sees the same console state.
- Concurrent actions are safe because the host serializes all actions per game (§9.3), so
  two masters tapping `윷` at once cannot interleave against the same state.
- Signing out on one device does not sign out the others. `모든 기기에서 로그아웃`
  invalidates every session at once, by rotating the signing secret.

### 3.5 The master may still play bingo

Bingo §3 lets the master also hold a card. That survives unchanged: the master opens the
**player** surface and joins with a nickname like anyone else, receiving a player number.

The master session and the bingo player identity are **deliberately unrelated**. Player
identity is a per-room number (bingo §7.0); the master session is an operator credential.
Linking them would mean the podium depends on who happens to be running the laptop.

---

## 4. Events

### 4.1 One event, one code, two games

```ts
type GameId = 'bingo' | 'yutnori';

interface Event {
  id: string;                        // internal uuid
  code: string;                      // 4 chars, A-Z minus I and O. THE code on the slide.
  title: string;                     // e.g. '2026 가을 교회 한마당' — shown on every surface
  games: Record<GameId, GameHandle>; // one instance of each, always both present
  projector: GameId | 'auto';        // which game owns the big screen (§5.2)
  createdAt: number;
  closedAt: number | null;
}

interface GameHandle {
  enabled: boolean;                  // master may hide a game the event will not play
  state: RoomState;                  // the shared lifecycle, below
  // the game's own state lives in its module and is opaque to the host (§9.1)
}
```

An event is created once, by the master, from the console. Creating it generates the code
and both game instances in `SETUP`. There is no separate "create a bingo room" and "create
a yutnori room" step, and no second passcode prompt.

### 4.2 The shared lifecycle

Both games already define the **same** five states and the **same** reveal machine. That
is not a coincidence worth preserving twice:

```
SETUP ──► LOBBY ──► RUNNING ──► ENDED ──► REVEAL
```

| `revealStep` | Shows |
|---|---|
| 0 | `순위를 발표합니다…` |
| 1 | 🥉 3rd |
| 2 | 🥈 2nd |
| 3 | 🥇 1st |
| 4 | Full standings |

The host owns both machines and the transition guard table; each game supplies only the
*guards on its own transitions* (bingo: "exactly 81 traits", "≥ 2 players"; yutnori:
"≥ 2 teams") and the *ranked list* that feeds the reveal. One podium component, one
`reveal:step` broadcast, one set of animations, for both games. See §9.2.

### 4.3 Independent lifecycles

The two games advance **independently**. Bingo may be `RUNNING` while yutnori is still in
`SETUP`; yutnori may reach `REVEAL` while bingo keeps running. The only coupling is the
projector (§5.2) and the reveal lock (§5.3).

---

## 5. Simultaneity

This is the section that exists only because there are now two games at once.

### 5.1 Both games may be `RUNNING`

The realistic shape of a church game night: bingo starts as people arrive and keeps
running as a background icebreaker for forty minutes, while yutnori is set up, played on
stage, and finished. The two overlap by design.

- No host rule prevents both from being `RUNNING`.
- Each game's clock is its own (bingo counts up from `startedAt`; yutnori counts down).
- A player's phone is on the bingo surface; the room's attention is on the projector.

### 5.2 The projector is a single resource

There is one big screen and two games that want it.

| `event.projector` | Behavior |
|---|---|
| `'bingo'` | Projector shows the bingo dashboard (bingo §11.4) |
| `'yutnori'` | Projector shows the yutnori board (yutnori §13.1) |
| `'auto'` | Shows whichever game most recently produced a **room-wide** event, with a 20 s hold so it cannot flicker between them |

- The projector surface (`/p/:code`) is a **single URL** that never needs to be changed
  during the event. The master switches what it displays from the console; the laptop at
  the front is opened once and then left alone. This is the whole point — walking to the
  projector laptop mid-event to type a different URL is the thing that goes wrong.
- A game entering `REVEAL` **seizes the projector** unconditionally, and `'auto'` is
  suspended until the reveal ends. A podium is not something the other game may interrupt.
- Default is `'auto'`.

### 5.3 The reveal is exclusive

**Only one game may be in `REVEAL` at a time.** The host rejects `REVEAL` for a game whose
sibling is already revealing, with `이미 다른 게임 순위를 발표 중이에요`.

> Two podiums at once is not a technical problem — it is a room problem. The reveal is the
> one moment the whole gathering looks at one screen together, and it counts up 3rd → 2nd
> → 1st precisely to build to something. Running two of them concurrently destroys both.

A game sitting in `ENDED` waits; the master taps `순위 발표` when the room is ready.

### 5.4 Attention budget

One operator cannot watch two games closely at once, and the console must not pretend
otherwise:

- The console marks one game as **focused** (the one the master is driving) and renders
  the other as a compact status strip.
- The unfocused game surfaces exactly three things: its state, its headline number
  (bingo: 빙고 수 / yutnori: 남은 시간), and any action that is **blocking** — e.g. yutnori
  waiting on a 말 selection, which stalls the whole stage.
- A blocking condition in the unfocused game raises a badge on its pane and, after 10
  seconds, a sound. Yutnori stalling silently while the master reads the bingo dashboard is
  the most likely real failure of running two games at once.

---

## 6. Surfaces

Five URLs. One code in all of them.

| URL | Who | What |
|---|---|---|
| `/` | anyone | Landing. Enter the event code. |
| `/:code` | attendee | Event page: title + a button per **enabled** game. Routes to the surfaces below. |
| `/b/:code` | bingo player | The 9×9 card (bingo §11.2) |
| `/y/:code` | yutnori spectator | The read-only board (yutnori §13.1) |
| `/p/:code` | the projector | Whichever game owns the channel (§5.2), full-screen, zero interactive elements |
| `/master` | master user | Console (§7). Not code-scoped — the session already knows the event. |

`/:code` must be **static and edge-cacheable**. It is the URL ~100 phones hit inside a
minute (bingo §16.5), and it is now the single entry point for both games, so it does
strictly more of that work than either app's join page did.

> **Why the game is chosen by path, not by the code.** A per-game code (`ABCD` for bingo,
> `EFGH` for yutnori) means the master reads out two codes and half the room types the
> wrong one. One code plus a button is one fewer thing for a hundred people to get right.

---

## 7. The console

One screen, two panes, one event bar.

```
┌──────────────────────────────────────────────────────────────┐
│  2026 가을 교회 한마당        참여 코드 ABCD    🖥 자동 ▾  ⏻ │
├───────────────────────────────┬──────────────────────────────┤
│  빙고            RUNNING      │  윷놀이           RUNNING  ⚠ │
│  참여자 100 (접속 97)          │  ⏱ 12:43                    │
│  빙고 5명                      │  지금: 청년부2조             │
│                               │  남은 던지기 1               │
│  1 지은 #007 4:12             │  ⚠ 말 선택 대기 중           │
│  2 민수 #042 5:30             │                              │
│  3 서연 #088 6:01             │  [ 도 ][ 개 ][ 걸 ]          │
│                               │  [ 윷 ][ 모 ]                │
│  [ 게임 종료 ]                │  [ ↩ 되돌리기 ]  [ 종료 ]    │
├───────────────────────────────┴──────────────────────────────┤
│  🖥 프로젝터:  [ 자동 ] [ 빙고 ] [ 윷놀이 ]                    │
└──────────────────────────────────────────────────────────────┘
```

- The **focused** pane (§5.4) is full width on a phone; both panes show side by side from
  900px up. The master may be standing by the stage with a phone (yutnori §13.2).
- The projector selector is always visible, at event level, never inside a game pane.
- Each pane's contents are supplied **by the game** (bingo §11.3/§11.4, yutnori §13.2).
  The host supplies the frame, the lifecycle buttons, the reveal driver and the sign-out.
- `게임 종료` and `순위 발표` are the only actions with a confirm dialog. `되돌리기` never
  gets one (yutnori §7.1).

---

## 8. Security

The threat model is not attackers. It is a hundred bored phones holding a 4-character code
and one unattended laptop at the front of the room.

| Risk | Mitigation |
|---|---|
| Guessing the event code | Accepted. The code grants only player/spectator access, which is the point of handing it out. |
| Guessing the passcode from the code | Passcode is never accepted on a code-scoped surface; `/master` is a separate URL and is rate-limited to **5 attempts per IP per minute**, then a 15-minute lockout. |
| Passcode over the socket | Eliminated — proof is on the handshake (§3.2), not in an event. |
| Unattended projector laptop | `/p/:code` sockets are read-only for life and carry no master capability, even if the master signed in on that machine earlier (`/p` explicitly ignores the session). |
| Session theft over the LAN | `httpOnly`, `SameSite=Lax`; served over TLS in any deployment reachable off-LAN. On a pure-LAN deployment this is accepted, and documented as accepted. |
| A player driving master actions | Every `master:*` action checks the handshake flag; player namespaces have no master handlers registered at all. |
| Stale session after the event | 12-hour expiry, plus `모든 기기에서 로그아웃` (secret rotation, §3.4). |

**Passcode storage:** `scrypt` hash in configuration, compared in constant time. Never
logged, never echoed to a client, never written to the database.

---

## 9. The host — build it once

This is the efficiency argument, stated concretely. Every row below is currently specified
**twice**, once in each app, in two documents that already agree on the answer.

### 9.1 What moves into the host

| Concern | Today | After |
|---|---|---|
| Master authentication | 2 × `master:auth` + 2 rate limiters | 1 session, on the handshake (§3.2) |
| Join code generation | 2 generators, identical alphabet | 1 event code (§4.1) |
| Lifecycle state machine | 2 identical 5-state machines | 1 (§4.2) |
| Transition guard table | 2 tables | 1 table + per-game guards (§4.2) |
| Reveal machine + podium UI | 2 identical step machines, 2 UIs | 1 (§4.2) |
| Ranking presentation | 2 shapes for the same podium | 1 `RankEntry` shape, 2 ranking functions |
| Action serialization | 2 room locks | 1 dispatch loop (§9.3) |
| Server-authoritative time | 2 conventions | 1 — `now` injected at dispatch |
| Clock / `serverNow` | 2 implementations, 1 with ticks | 1 service, per-game opt-in ticks |
| SQLite write-behind + 6 h boot recovery | 2 implementations, 2 files | 1 database, 2 strategies (§9.4) |
| Socket bootstrap, reconnect backoff, rate limit | 2 | 1 |
| i18n module | 2 identical `{ko, en}` modules | 1 module, per-game string namespaces |
| Projector legibility tokens | 2 | 1 |
| Deployment | 2 processes, 2 ports, 2 databases | 1 (§11) |

**The host contains no game rules.** Not one. It does not know what a 말 is, what a trait
is, what a line is, or how either game ranks anybody. It knows five lifecycle states, a
reveal counter, and how to hand an action to a game and broadcast what comes back.

### 9.2 What stays in each game

- **Rules.** Bingo: card generation, cell validation, line detection, its ranking.
  Yutnori: board, throws, catching, turn order, undo, its ranking.
- **Its own screens' contents.**
- **Its own persistence strategy.** Bingo snapshots (bingo §14); yutnori event-sources and
  replays (yutnori §14). These are genuinely different and both are correct for their game
  — the host stores both behind one interface rather than forcing one shape on both.
- **Its own fan-out discipline.** Bingo's `cell:result` is unicast and must stay unicast
  (bingo §16.2); yutnori broadcasts everything. The host carries an explicit audience on
  every emitted event so that discipline is enforced centrally instead of remembered.

### 9.3 One dispatch loop

Every state change in either game goes through one path: **serialize per game → apply →
check invariants → persist → broadcast**. Broadcast happens only after the state is
committed, so no client can observe an event that a reconnect would not reproduce
(yutnori spec §5.1, generalized to both games).

### 9.4 One database

One SQLite file with WAL, holding `events`, plus each game's tables. On boot, reload any
event less than **6 hours** old whose games are not all in `REVEAL`, and restore each game
by its own strategy. Both apps already specify exactly this policy; it is now written once.

---

## 10. Migration — what each app document changes

| App | Change | Where |
|---|---|---|
| bingo | `masterPasscodeHash` leaves `Room`; rooms belong to an event | §5 |
| bingo | `joinCode` → the event code, supplied by the host | §2, §5 |
| bingo | `master:auth` removed from the protocol | §10 |
| bingo | "No accounts" → **no player accounts**; the master has one | §1 |
| bingo | Master reconnect no longer re-enters a passcode | §13, §18 |
| bingo | Deployment sizing folds into the shared host | §16.10 |
| yutnori | "Shares no code with the bingo app" **reversed** | §1, §18 |
| yutnori | `masterPasscodeHash` leaves `Room` | §5 |
| yutnori | `master:auth` removed from the protocol | §12 |
| yutnori | Master crash recovery no longer re-enters a passcode | §17 |
| bingo (spec) | Repo layout becomes a workspace; engine plugs into the host as a `GameModule` | spec §3, §5 |
| bingo (spec) | Auth, dispatch, fan-out, rate limiting, coalescing, persistence, deployment move to the host | spec §5, §6, §8, §11 |
| yutnori (spec) | Repo layout becomes a workspace; engine plugs into the host | spec §3, §5 |
| yutnori (spec) | Auth, clock, dispatch, persistence move to the host | spec §5.1, §5.3, §5.4, §8 |

Reversing yutnori's "no shared code" non-goal is the one genuine reversal in this
document. It was the right call when the alternative was a speculative abstraction between
two unwritten apps; it is the wrong call now that both documents exist and agree, line for
line, on twelve things (§9.1). **Shared code is justified by demonstrated duplication, not
by anticipated duplication** — and the duplication is now demonstrated.

---

## 11. Non-functional requirements

| Concern | Target |
|---|---|
| **Concurrency** | 300 bingo players + ~100 yutnori spectators + N master devices, **one process** |
| Sign-in | < 500 ms, and exactly once per device per event |
| Console responsiveness | Both panes live; an action in one game never blocks the other |
| Blocking-state alert | Unfocused game's blocking condition surfaces within 10 s (§5.4) |
| Projector switch | < 300 ms, no reload, no re-entered URL |
| Master reconnect | Session restored from cookie with **zero** operator input |
| Event-loop lag | p99 < 50 ms with both games running under load (bingo §16.9) |
| Availability | Single process. A restart is a ~5 s blip; both games recover (§9.4). |
| Privacy | One passcode. Nicknames and team names only. Nothing survives the event. |
| Accessibility | Console usable on a phone; ≥ 44px targets; state never by color alone |

---

## 12. Edge cases

| Case | Behavior |
|---|---|
| Master signs in on a second device | Both work. Same session identity, shared console state. (§3.4) |
| Two master devices act at the same moment | Serialized by the host; last writer wins on state, both see the result. (§9.3) |
| Master's laptop crashes | Reopen `/master`; the cookie restores the session with **no passcode prompt**. |
| Session expires mid-event | Console shows an inline re-auth over the current screen; no state lost, no navigation. |
| Master forgets the passcode | It is in the deployment configuration. Operator reads it off the server, or restarts with a new one — no recovery flow exists, by design (§3.1). |
| Both games try to reveal | Second is rejected: `이미 다른 게임 순위를 발표 중이에요` (§5.3) |
| Reveal starts while the projector is on the other game | Reveal seizes the projector; `'auto'` is suspended until it ends. (§5.2) |
| One game is not being played tonight | Master sets `enabled: false`; it vanishes from `/:code` and from the console. |
| Attendee opens `/:code` before either game is out of `SETUP` | `곧 시작합니다` with the event title. |
| Projector laptop reloads | `/p/:code` reconnects and resyncs; it holds no state (yutnori §17). |
| Someone opens `/p/:code` on a phone | Works, read-only. Harmless — it is the spectator view. |
| Player somehow emits `master:*` | `NOT_MASTER`; those handlers are not even registered on the player namespace (§8). |
| Server restart with both games `RUNNING` | Both recover from the one database by their own strategy (§9.4). |
| Second event created while one is open | Blocked in v1 — one active event (§1). Close the current one first. |
| Bingo's 100-phone burst during a yutnori turn | Independent; the join path is O(1) and does no game work (bingo §16.5). |

---

## 13. Out of scope for v1

- More than one master user; roles, permissions, or per-game operators.
- Account registration, password reset, email, SSO.
- More than one simultaneous event.
- A third game, or a public game registry. (The host is designed to make adding one cheap
  — see spec §3 — but v1 ships exactly two.)
- Cross-event history, stats, or a results archive.
- Remote/off-LAN operation as a supported mode. It will work; it is not the design target.
- Delegating a single game to a second operator on a second passcode.

---

## 14. Open questions

1. **Sound for the blocking alert** (§5.4). A chime when the unfocused game stalls is
   clearly right in principle and clearly annoying in a quiet sanctuary. Decide at the
   dress rehearsal.
2. **`'auto'` projector hold time.** 20 s is a guess. The real answer comes from watching
   one event with both games running.
3. **Should the console show the bingo dashboard, or link to it?** A projector-shaped
   dashboard inside a phone-shaped pane may be the wrong shape twice.
4. **Per-game enable at event creation, or later?** Currently either. Possibly it should be
   a setup step so the master consciously chooses tonight's program.
5. **Event title on every surface** — worth the vertical space on a 9×9 phone card?

---

## Appendix A — Original source requirement

> use master folder to create a master user for these two apps simultaneously — modify
> what we need to modify within req. and spec to make this the most efficient as possible

### How it is resolved

| Source phrase | Resolved in |
|---|---|
| "a master user" | §3 — one identity, one passcode, one session, no account system |
| "for these two apps" | §3.3, §4.1 — one session covers both games; one event owns both |
| "simultaneously" | §5 — both games may be `RUNNING`; projector arbitration and an exclusive reveal are the only couplings |
| "modify … req. and spec" | §10 — the exact change list applied to both apps' documents |
| "the most efficient as possible" | §9 — thirteen duplicated concerns collapse to one implementation; two processes collapse to one |

### Decisions taken here, flagged for easy reversal

| Decision | Alternative | Why this way |
|---|---|---|
| **One master user, no account system** (§3.1) | A `users` table with roles | The real population is one person. Accounts buy nothing and cost a screen and a failure mode. |
| **One event code for both games** (§4.1, §6) | A code per game | A hundred people typing one code wrong is the actual risk; two codes doubles it. |
| **Session on the handshake** (§3.2) | Keep `master:auth` per app | Deletes an event, a rate limiter, an error path and a reconnect step from both apps at once. |
| **Reveal is exclusive** (§5.3) | Allow both podiums | Two simultaneous podiums destroys the only moment the whole room shares a screen. |
| **Shared host, reversing yutnori §18** (§10) | Keep both apps standalone | Twelve duplicated concerns, demonstrated in two finished documents — not anticipated, observed. |
| **Games keep their own persistence strategies** (§9.2) | Force one shape | Bingo snapshots and yutnori replays for good reasons specific to each. Unifying them would be sharing for its own sake. |
