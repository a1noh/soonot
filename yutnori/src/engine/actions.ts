import type { EndReason, MoveCandidate, Roll, TurnEvent } from '../shared/types';

/** spec §4.2 — the complete action union. */
export type Action =
  | { t: 'SETUP'; teams: { name: string; roster?: string | null }[]; malPerTeam: 1 | 2; timeLimitMin: number; miniGames?: boolean; miniGameSet?: { id: string; name: string; instruction: string; seconds?: number }[] }
  | { t: 'START' }
  | { t: 'THROW'; roll: Roll }
  | { t: 'MOVE'; malId: string; to?: number }
  | { t: 'UNDO' }
  | { t: 'PAUSE' }
  | { t: 'RESUME' }
  | { t: 'EXTEND'; minutes: number }
  | { t: 'END'; reason: EndReason }
  | { t: 'RESUME_FROM_ENDED' }
  | { t: 'REVEAL'; step: number }
  | { t: 'TICK' }
  | { t: 'MINIGAME_SPIN'; gameId: string }
  | { t: 'MINIGAME_RESOLVE'; success: boolean };

/**
 * spec §6 — what the engine says happened. The server maps these onto the req §12
 * server→client events. `room:state`, `clock:tick` and `error` are NOT here: the
 * engine has no business producing them.
 */
export type Emit =
  | { e: 'throw:recorded'; teamId: string; roll: Roll; candidates: MoveCandidate[] }
  | { e: 'board:update'; mal: { teamId: string; malId: string; progress: number }[]; lastMove: TurnEvent | null }
  | { e: 'capture:announced'; byTeam: string; victimTeam: string; station: number; count: number }
  | { e: 'turn:changed'; teamId: string; teamName: string }
  | { e: 'team:finished'; teamId: string; teamName: string; at: number; rankAmongFinishers: number }
  | { e: 'undo:applied'; revertedSeq: number }
  | { e: 'game:ended'; endedAt: number; reason: EndReason }
  | { e: 'reveal:step'; step: number }
  | { e: 'minigame:triggered'; teamId: string; teamName: string; station: number }
  | { e: 'minigame:spun'; gameId: string }
  | { e: 'minigame:resolved'; success: boolean };

export type EngineErrorCode =
  | 'ILLEGAL_ACTION'
  | 'TOO_FEW_TEAMS'
  | 'DUPLICATE_TEAM_NAME'
  | 'BAD_MAL_COUNT'
  | 'BAD_TIME_LIMIT'
  | 'NO_THROW_OWED'
  | 'THROW_PENDING'
  | 'NO_PENDING_THROW'
  | 'ILLEGAL_MOVE'
  | 'NO_CANDIDATES'
  | 'NOTHING_TO_UNDO'
  | 'NOT_PAUSED'
  | 'ALREADY_PAUSED'
  | 'REVEAL_STARTED'
  | 'BAD_REVEAL_STEP'
  | 'MINIGAME_PENDING'
  | 'NO_MINIGAME';

/** spec §4.3 — the engine never silently no-ops on an illegal action. */
export class EngineError extends Error {
  constructor(readonly code: EngineErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'EngineError';
  }
}
