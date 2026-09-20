// req §5 — the data model, verbatim. Shared by engine, server and client.

export type RoomState = 'SETUP' | 'LOBBY' | 'RUNNING' | 'ENDED' | 'REVEAL';
export type Roll = '도' | '개' | '걸' | '윷' | '모';
export type EndReason = 'timeup' | 'master' | 'allFinished';

export interface Room {
  id: string;
  eventId: string;            // the owning event; the 4-char code lives there (master §4.1)
  state: RoomState;

  teams: Team[];              // ordered — this IS the turn order
  malPerTeam: 1 | 2;
  turnIndex: number;
  throwQueue: number;         // throws still owed to the current team

  pendingThrow: PendingThrow | null;
  history: TurnEvent[];       // append-only; the undo stack and the audit trail

  timeLimitMs: number;
  startedAt: number | null;
  pausedAt: number | null;
  totalPausedMs: number;
  endedAt: number | null;
  endReason: EndReason | null;

  revealStep: number;         // 0 = not started, 1 = 3rd, 2 = 2nd, 3 = 1st, 4 = full board
  createdAt: number;
}

export interface Team {
  id: string;
  name: string;
  roster: string | null;
  color: string;
  mal: Mal[];
  finishedAt: number | null;
  lastProgressAt: number;     // last time this team's total progress increased
}

export interface Mal {
  id: string;
  progress: number;           // 0 = 대기, 1..19 = station index, 20 = 집 (req §6)
}

export interface PendingThrow {
  teamId: string;
  roll: Roll;
  at: number;
  candidates: MoveCandidate[];
}

export interface MoveCandidate {
  malId: string;
  from: number;
  to: number;
  captures: string[];         // malIds that would be sent back to 대기
  finishes: boolean;
}

export interface TurnEvent {
  seq: number;                // 1-based, contiguous
  teamId: string;
  roll: Roll;
  malId: string;
  from: number;
  to: number;
  captures: { malId: string; teamId: string; from: number }[];
  bonusGranted: number;       // 윷/모 → 1, plus 1 more for a catch
  finishedTeam: boolean;
  at: number;
}

/**
 * spec §4.4 — everything about a room that no `TurnEvent` can determine.
 * `replay(setupOf(room), events)` rebuilds the rest: 말 positions, `finishedAt`,
 * `lastProgressAt`, `turnIndex`, `throwQueue`, `history`.
 */
export interface RoomSetup {
  id: string;
  eventId: string;
  state: RoomState;
  malPerTeam: 1 | 2;
  teams: TeamSetup[];
  timeLimitMs: number;
  startedAt: number | null;
  pausedAt: number | null;
  totalPausedMs: number;
  endedAt: number | null;
  endReason: EndReason | null;
  revealStep: number;
  createdAt: number;
}

export interface TeamSetup {
  id: string;
  name: string;
  roster: string | null;
  color: string;
  malIds: string[];
}
