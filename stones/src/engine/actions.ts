export type Action =
  | {
      t: 'SETUP';
      teams: { name: string; playing: boolean }[];
      stones: { name: string }[];
      games: { name: string; players: string; instructions: string }[];
      tiebreak?: { name: string; players: string; instructions: string };
    }
  | { t: 'START' }
  | { t: 'PICK'; stoneId: string }
  | { t: 'CANCEL_PICK' }
  | { t: 'RESOLVE'; winners: string[] }
  | { t: 'SKIP' }
  | { t: 'SET_PLAYING'; teamId: string; playing: boolean }
  | { t: 'UNDO' }
  | { t: 'END' }
  | { t: 'RESUME_FROM_ENDED' }
  | { t: 'REVEAL'; step: number }
  | { t: 'TIEBREAK_START'; teamIds: string[] }
  | { t: 'TIEBREAK_RESOLVE'; order: string[] }
  | { t: 'TIEBREAK_CANCEL' };

/** Everything is public on the projector except which game comes next. */
export type Emit =
  | { e: 'stones:update' }
  | { e: 'stone:picked'; chooserId: string; stoneId: string; gameId: string }
  | { e: 'stone:resolved'; stoneId: string; winners: string[] }
  | { e: 'turn:changed'; teamId: string; teamName: string; round: number }
  | { e: 'undo:applied' }
  | { e: 'game:ended'; endedAt: number }
  | { e: 'reveal:step'; step: number }
  | { e: 'tiebreak:started'; teamIds: string[] }
  | { e: 'tiebreak:resolved'; order: string[] | null };

export const EMIT_NAMES: readonly Emit['e'][] = [
  'stones:update',
  'stone:picked',
  'stone:resolved',
  'turn:changed',
  'undo:applied',
  'game:ended',
  'reveal:step',
  'tiebreak:started',
  'tiebreak:resolved',
];

export type EngineErrorCode =
  | 'ILLEGAL_ACTION'
  | 'TOO_FEW_TEAMS'
  | 'TOO_MANY_TEAMS'
  | 'DUPLICATE_TEAM_NAME'
  | 'NO_STONES'
  | 'TOO_MANY_STONES'
  | 'NO_GAMES'
  | 'UNKNOWN_STONE'
  | 'UNKNOWN_TEAM'
  | 'STONE_TAKEN'
  | 'NO_GAME_LEFT'
  | 'PICK_PENDING'
  | 'NO_PICK'
  | 'LAST_TEAM'
  | 'NOTHING_TO_UNDO'
  | 'REVEAL_STARTED'
  | 'BAD_REVEAL_STEP'
  | 'NOT_TIED'
  | 'TIEBREAK_PENDING'
  | 'NO_TIEBREAK'
  | 'BAD_ORDER';

export class EngineError extends Error {
  constructor(readonly code: EngineErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'EngineError';
  }
}
