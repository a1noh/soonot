/**
 * The bingo `GameModule` — the only host-facing file in this package.
 * master/spec.md §3; bingo/spec.md milestone 4.
 *
 * Everything that is not a bingo rule lives in the host: dispatch, locking,
 * fan-out routing, rate limiting, coalescing, persistence plumbing, the reveal
 * and deployment. This file is the seam.
 */
import type { GameModule, RankEntry, RoomState, Viewer } from '@soonot/master';
import type { Action } from './engine/actions';
import type { Room } from './shared/types';
import { ALLOWED, apply, create } from './engine/apply';
import { assertInvariants } from './engine/invariants';
import { rank } from './engine/ranking';
import { project } from './project';
import { snapshot } from './persist';
import { CELLS } from './shared/constants';

/** Narrow an unknown socket payload to a string field. */
function str(payload: unknown, key: string): string | null {
  const v = (payload as Record<string, unknown> | null)?.[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function int(payload: unknown, key: string): number | null {
  const v = (payload as Record<string, unknown> | null)?.[key];
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}

/**
 * The whole protocol as data (master spec §3.2). The host never switches on
 * event names, and the master check lives here once rather than on every
 * handler.
 */
function route(ev: string, payload: unknown, viewer: Viewer): Action | null {
  // ---- master console (req §10) -------------------------------------------
  if (viewer.kind === 'master') {
    switch (ev) {
      case 'master:setTraits': {
        const texts = (payload as { texts?: unknown } | null)?.texts;
        if (!Array.isArray(texts) || texts.length !== CELLS) return null;
        if (!texts.every((t) => typeof t === 'string' && t.trim().length > 0)) return null;
        return { t: 'SET_TRAITS', texts: texts as string[] };
      }
      case 'master:start':
        return { t: 'START' };
      case 'master:end':
        return { t: 'END' };
      case 'master:reveal': {
        const step = int(payload, 'step');
        return step === null || step < 0 || step > 4 ? null : { t: 'REVEAL', step };
      }
      default:
        return null;
    }
  }

  // ---- players, on /b (req §10) -------------------------------------------
  if (viewer.kind !== 'player' || viewer.playerId.length === 0) return null;
  const playerId = viewer.playerId;

  switch (ev) {
    case 'room:join': {
      const nickname = str(payload, 'nickname');
      return nickname === null ? null : { t: 'JOIN', playerId, nickname };
    }
    case 'room:rejoin':
      return { t: 'REJOIN', playerId };
    case 'cell:fill': {
      const cellIndex = int(payload, 'cellIndex');
      const query = str(payload, 'query');
      return cellIndex === null || query === null
        ? null
        : { t: 'FILL', playerId, cellIndex, query };
    }
    case 'cell:fillResolved': {
      const cellIndex = int(payload, 'cellIndex');
      const targetId = str(payload, 'targetId');
      return cellIndex === null || targetId === null
        ? null
        : { t: 'FILL_PICK', playerId, cellIndex, targetId };
    }
    case 'cell:clear': {
      const cellIndex = int(payload, 'cellIndex');
      return cellIndex === null ? null : { t: 'CLEAR', playerId, cellIndex };
    }
    default:
      return null;
  }
}

export const bingoModule: GameModule<Room, Action> = {
  id: 'bingo',
  create,
  apply,
  lifecycle: (state: Room): RoomState => state.state,
  allowed: ALLOWED,
  route,
  project,
  rank: (state: Room): RankEntry[] => rank(state),
  invariants: assertInvariants,
  persistence: snapshot,
  /**
   * Bingo opts out of the clock. req §16.4: a 1 Hz tick to 100 clients is
   * 100 msg/sec — more traffic than the rest of the game combined — to send a
   * number the client can compute from `startedAt` plus the `serverNow` the
   * host already piggybacks on every message.
   */
  ticks: false,
};

export default bingoModule;
export type { Room, Action };
