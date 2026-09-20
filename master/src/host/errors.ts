/**
 * Two error classes, one boundary.
 *
 * `EngineError` is thrown by a game's `apply` when an action is illegal under
 * its own rules. `HostError` is thrown by the host for the things no game can
 * see — the reveal lock, a disabled game, an unknown action. Both serialize to
 * the same `error { code, message }` the `req.md` protocol tables specify, and
 * both go back **only to the socket that sent the action** (spec §6.2): a bad
 * tap on the master's phone must not raise a banner on the projector laptop.
 */

import { EngineError } from '../shared/errors.js';

export type HostErrorCode =
  | 'NOT_MASTER'
  | 'UNKNOWN_EVENT'
  | 'NO_EVENT'
  | 'GAME_DISABLED'
  | 'REVEAL_BUSY'
  | 'NOT_ALLOWED'
  | 'BAD_PAYLOAD';

/** Korean is the default locale (req §15 in both games); the console renders these as-is. */
const HOST_MESSAGES: Record<HostErrorCode, string> = {
  NOT_MASTER: '권한이 없어요',
  UNKNOWN_EVENT: '알 수 없는 요청이에요',
  NO_EVENT: '아직 행사가 만들어지지 않았어요',
  GAME_DISABLED: '오늘은 진행하지 않는 게임이에요',
  REVEAL_BUSY: '이미 다른 게임 순위를 발표 중이에요',
  NOT_ALLOWED: '지금은 할 수 없어요',
  BAD_PAYLOAD: '요청 형식이 올바르지 않아요',
};

export class HostError extends Error {
  readonly code: HostErrorCode;

  constructor(code: HostErrorCode, message?: string) {
    super(message ?? HOST_MESSAGES[code]);
    this.name = 'HostError';
    this.code = code;
  }
}

/**
 * Thrown by a module's `apply`. The engine never silently no-ops — an illegal
 * action is an error, not a shrug (yutnori spec §4.3).
 *
 * Defined in `shared/` because games throw it and games never import `host/`
 * (spec §2); re-exported here so the host's own error handling reads as one
 * vocabulary.
 */
export { EngineError } from '../shared/errors.js';

export interface WireError {
  code: string;
  message: string;
}

export function toWireError(err: unknown): WireError {
  if (err instanceof HostError || err instanceof EngineError) {
    return { code: err.code, message: err.message };
  }
  return { code: 'INTERNAL', message: '문제가 생겼어요' };
}
