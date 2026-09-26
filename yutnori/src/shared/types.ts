// req §5 — the data model, verbatim. Shared by engine, server and client.

import type { MiniGame } from './minigames';

export type RoomState = 'SETUP' | 'LOBBY' | 'RUNNING' | 'ENDED' | 'REVEAL';
export type Roll = '도' | '개' | '걸' | '윷' | '모';
export type EndReason = 'timeup' | 'master' | 'allFinished';

export interface Room {
  id: string;
  eventId: string;            // the owning event; the 4-char code lives there (master §4.1)
  state: RoomState;

  teams: Team[];              // ordered — this IS the turn order
  malPerTeam: 1 | 2;
  /** Mario-Party mode: landing on a 미니게임 칸 triggers a mini-game (set at SETUP). */
  miniGames: boolean;
  /** The editable mini-game catalog for this event (the roulette picks from it). */
  miniGameSet: readonly MiniGame[];
  /** 잡기 방어전: a capture triggers a 대표 1:1 duel (가위바위보/눈싸움). If the captured
   *  team's rep wins, the capture is cancelled. Set at SETUP. */
  captureDuel: boolean;
  /** The editable 1:1 대결 종목 list (the duel roulette picks from it). {id,name,instruction}. */
  duelGameSet: readonly MiniGame[];
  turnIndex: number;
  throwQueue: number;         // throws still owed to the current team

  pendingThrow: PendingThrow | null;
  /**
   * A 말 landed on a 미니게임 칸 and the turn is frozen until the master judges it.
   * Transient turn state (like `pendingThrow`); not in `RoomSetup` — a crash
   * mid-challenge recovers as if it had succeeded (the move stands).
   */
  pendingMiniGame: PendingMiniGame | null;
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
  finishedAt: number | null;  // vestigial — 말 respawn on 완주, so a team never permanently finishes
  lastProgressAt: number;     // last time this team's total progress increased
  /** Total 완주(집 도착) count = laps. A finished 말 respawns in 대기, so this keeps
   *  climbing (2nd lap, 3rd lap …) and is the primary 윷놀이 ranking key. Derived by replay. */
  finishes: number;
  /** Cumulative 미니게임/대결 wins (each win = +1 point). Derived by replay, not in RoomSetup. */
  miniWins: number;
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

export interface PendingMiniGame {
  teamId: string;
  malId: string;
  station: number;
  /** The game the roulette landed on; null until the spin (MINIGAME_SPIN). */
  gameId: string | null;
  /**
   * Set when this "mini-game" is actually a 잡기 방어전 — a 대표 1:1 duel between the
   * capturing team (`teamId`) and the captured team (`vsTeam`). Resolving with
   * `success:true` means the CAPTURE STANDS (attacker's rep won); `success:false`
   * means the defender's rep won and the capture is reverted.
   */
  duel?: { vsTeam: string; vsTeamName: string; byTeamName: string };
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
  /**
   * Set when this move landed on a 미니게임 칸. `success:false` means the move was
   * cancelled — replay applies it as a spent turn with no advancement. Recorded so
   * the random pick + judgment survive replay/recovery.
   */
  miniGame?: { gameId: string; success: boolean };
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
  miniGames: boolean;
  miniGameSet: readonly MiniGame[];
  captureDuel: boolean;
  duelGameSet: readonly MiniGame[];
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
