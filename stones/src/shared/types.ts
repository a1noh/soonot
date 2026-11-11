import type { RoomState } from '@soonot/master';

export interface Team {
  id: string;
  name: string;
  color: string;
  /** Ticked "참가" — only playing teams take a turn as the chooser. */
  playing: boolean;
}

export interface Stone {
  id: string;
  name: string;
  color: string;
}

/**
 * One game in the order the master fixed beforehand. The chooser thinks the
 * stone they tap decides the game; it doesn't — pick N always opens game N.
 */
export interface Game {
  id: string;
  name: string;
  /** Who plays from each team: '2명', '3명', '모두' … shown as written. */
  players: string;
  instructions: string;
}

/** A stone that has been played for: which game came up and who won it. */
export interface Claim {
  stoneId: string;
  gameId: string;
  chooserId: string;
  round: number;
  /** Zero, one or several teams. Each gets the stone. */
  winners: string[];
  at: number;
}

/** One finished turn, for UNDO. */
export type TurnRecord =
  | { kind: 'claim'; chooserId: string; round: number }
  | { kind: 'skip'; chooserId: string; round: number };

/** The last result, so the projector can animate it once. */
export interface LastResult {
  seq: number;
  stoneId: string;
  gameId: string;
  winners: string[];
}

export interface Room {
  id: string;
  eventId: string;
  createdAt: number;
  state: RoomState;
  teams: Team[];
  stones: Stone[];
  games: Game[];
  /** Whose turn it is to "choose" the next stone. */
  turnTeamId: string | null;
  round: number;
  pending: { chooserId: string; stoneId: string; gameId: string } | null;
  claims: Claim[];
  history: TurnRecord[];
  /** The 동점 결정전 game (컵 멀리 놓기), played after 게임 종료. */
  tiebreak: Game;
  /** Decided 결정전 groups, best team first. Each was one whole tied group. */
  tiebreaks: string[][];
  /** The tied teams playing the 결정전 right now, in setup order. */
  activeTiebreak: string[] | null;
  lastResult: LastResult | null;
  seq: number;
  startedAt: number | null;
  endedAt: number | null;
  revealStep: number;
}
