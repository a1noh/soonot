import type { RoomState } from '@soonot/master';

export interface Team {
  id: string;
  name: string;
  color: string;
  /** Ticked "참가" — only playing teams take turns. */
  playing: boolean;
}

export interface Stone {
  id: string;
  name: string;
  color: string;
  /** What the team has to do to win it. Placeholder text until the event writes real ones. */
  mission: string;
}

export interface Win {
  teamId: string;
  stoneId: string;
  at: number;
}

/** One finished turn. `UNDO` pops these. */
export interface TurnRecord {
  kind: 'resolve' | 'skip';
  teamId: string;
  round: number;
  stoneId: string | null;
  success: boolean | null;
  at: number;
}

/** The last thing that happened, so the projector can animate it once. */
export interface LastResult {
  seq: number;
  teamId: string;
  stoneId: string;
  success: boolean;
}

export interface Room {
  id: string;
  eventId: string;
  createdAt: number;
  state: RoomState;
  teams: Team[];
  stones: Stone[];
  turnTeamId: string | null;
  round: number;
  pending: { teamId: string; stoneId: string } | null;
  wins: Win[];
  history: TurnRecord[];
  lastResult: LastResult | null;
  seq: number;
  startedAt: number | null;
  endedAt: number | null;
  revealStep: number;
}
