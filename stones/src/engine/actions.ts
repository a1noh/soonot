export type Action =
  | { t: 'SETUP'; teams: { name: string; playing: boolean }[]; stones: { name: string; mission: string }[] }
  | { t: 'START' }
  | { t: 'PICK'; stoneId: string }
  | { t: 'CANCEL_PICK' }
  | { t: 'RESOLVE'; success: boolean }
  | { t: 'SKIP' }
  | { t: 'SET_PLAYING'; teamId: string; playing: boolean }
  | { t: 'UNDO' }
  | { t: 'END' }
  | { t: 'RESUME_FROM_ENDED' }
  | { t: 'REVEAL'; step: number };

/** Everything is public: the projector shows the whole game. */
export type Emit =
  | { e: 'stones:update' }
  | { e: 'stone:picked'; teamId: string; stoneId: string }
  | { e: 'stone:resolved'; teamId: string; stoneId: string; success: boolean }
  | { e: 'turn:changed'; teamId: string; teamName: string; round: number }
  | { e: 'undo:applied' }
  | { e: 'game:ended'; endedAt: number }
  | { e: 'reveal:step'; step: number };

export const EMIT_NAMES: readonly Emit['e'][] = [
  'stones:update',
  'stone:picked',
  'stone:resolved',
  'turn:changed',
  'undo:applied',
  'game:ended',
  'reveal:step',
];

export type EngineErrorCode =
  | 'ILLEGAL_ACTION'
  | 'TOO_FEW_TEAMS'
  | 'TOO_MANY_TEAMS'
  | 'DUPLICATE_TEAM_NAME'
  | 'NO_STONES'
  | 'TOO_MANY_STONES'
  | 'UNKNOWN_STONE'
  | 'UNKNOWN_TEAM'
  | 'ALREADY_HELD'
  | 'PICK_PENDING'
  | 'NO_PICK'
  | 'LAST_TEAM'
  | 'NOTHING_TO_UNDO'
  | 'REVEAL_STARTED'
  | 'BAD_REVEAL_STEP';

export class EngineError extends Error {
  constructor(readonly code: EngineErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'EngineError';
  }
}
