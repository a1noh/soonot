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

/**
 * Who taps the next stone. Usually a team; for the first stone the script has
 * the 빙고 1등 choose, who is a person, not a team (a "guest").
 */
export interface Chooser {
  /** The choosing team, or null when a guest chooses. */
  teamId: string | null;
  /** The guest's name (e.g. the 빙고 1등), or null when a team chooses. */
  guest: string | null;
}

/** Prizes shown on the final podium. Empty strings are not shown. */
export interface Prizes {
  first: string;
  second: string;
  /** Something every team gets, shown as a closing line. */
  everyone: string;
}

/** A stone that has been played for: which game came up and who won it. */
export interface Claim {
  stoneId: string;
  gameId: string;
  /** The choosing team, or null when a guest chose. */
  chooserId: string | null;
  /** Shown as written: a team name, or "빙고 1등 민지". */
  chooserName: string;
  round: number;
  /** Zero, one or several teams. Each gets the stone. */
  winners: string[];
  at: number;
}

/** One finished turn, for UNDO. */
export type TurnRecord =
  | ({ kind: 'claim'; round: number } & Chooser)
  | ({ kind: 'skip'; round: number } & Chooser)
  /** The master changed who chooses; undo puts the earlier chooser back. */
  | ({ kind: 'chooser'; round: number } & Chooser);

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
  /** Shown as the projector's heading. */
  title: string;
  prizes: Prizes;
  /** Whose turn it is to "choose" the next stone: a team… */
  turnTeamId: string | null;
  /** …or a guest such as the 빙고 1등. Exactly one is set while running. */
  turnGuest: string | null;
  round: number;
  pending: { chooserId: string | null; chooserName: string; stoneId: string; gameId: string } | null;
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
