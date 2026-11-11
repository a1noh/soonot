/**
 * The 스톤 `GameModule` — the only host-facing file in this package.
 * Translates engine emits and errors into the host's, and standings into the
 * shared podium's `RankEntry`.
 */
import {
  EngineError as HostEngineError,
  type Emit as HostEmit,
  type GameModule,
  type RankEntry,
  type RoomState,
  type Viewer,
} from '@soonot/master';
import { ALLOWED, apply as engineApply, newRoom } from './engine/apply';
import { EngineError, type Action, type Emit } from './engine/actions';
import { assertInvariants } from './engine/invariants';
import { rank as engineRank } from './engine/ranking';
import type { Room } from './shared/types';
import { project } from './project';
import { snapshot } from './persist';

function toHostEmits(events: readonly Emit[]): HostEmit[] {
  return events.map((e) => {
    const { e: ev, ...data } = e;
    return { to: 'room', ev, data } as HostEmit;
  });
}

const rec = (p: unknown): Record<string, unknown> | null =>
  p !== null && typeof p === 'object' ? (p as Record<string, unknown>) : null;

function str(p: unknown, key: string): string | null {
  const v = rec(p)?.[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function bool(p: unknown, key: string): boolean | null {
  const v = rec(p)?.[key];
  return typeof v === 'boolean' ? v : null;
}

/** Only the master drives 스톤. `gameId` in the envelope is host routing, so ids ride in `stone`/`team`. */
function route(ev: string, payload: unknown, viewer: Viewer): Action | null {
  if (viewer.kind !== 'master') return null;
  switch (ev) {
    case 'master:setup': {
      const p = rec(payload);
      if (!Array.isArray(p?.teams) || !Array.isArray(p?.stones)) return null;
      const teams = (p.teams as unknown[])
        .map((t) => {
          const name = typeof rec(t)?.name === 'string' ? (rec(t)!.name as string).trim() : '';
          return name ? { name, playing: rec(t)?.playing !== false } : null;
        })
        .filter((t): t is { name: string; playing: boolean } => t !== null);
      const stones = (p.stones as unknown[])
        .map((s) => {
          const name = typeof rec(s)?.name === 'string' ? (rec(s)!.name as string).trim() : '';
          const mission = typeof rec(s)?.mission === 'string' ? (rec(s)!.mission as string).trim() : '';
          return name ? { name, mission } : null;
        })
        .filter((s): s is { name: string; mission: string } => s !== null);
      return { t: 'SETUP', teams, stones };
    }
    case 'master:start':
      return { t: 'START' };
    case 'master:pick': {
      const stoneId = str(payload, 'stone');
      return stoneId ? { t: 'PICK', stoneId } : null;
    }
    case 'master:cancel':
      return { t: 'CANCEL_PICK' };
    case 'master:resolve': {
      const success = bool(payload, 'success');
      return success === null ? null : { t: 'RESOLVE', success };
    }
    case 'master:skip':
      return { t: 'SKIP' };
    case 'master:playing': {
      const teamId = str(payload, 'team');
      const playing = bool(payload, 'playing');
      return teamId && playing !== null ? { t: 'SET_PLAYING', teamId, playing } : null;
    }
    case 'master:undo':
      return { t: 'UNDO' };
    case 'master:end':
      return { t: 'END' };
    case 'master:resumeFromEnded':
      return { t: 'RESUME_FROM_ENDED' };
    case 'master:reveal': {
      const step = rec(payload)?.step;
      return typeof step === 'number' && Number.isInteger(step) && step >= 0 && step <= 4
        ? { t: 'REVEAL', step }
        : null;
    }
    default:
      return null;
  }
}

function rank(room: Room): RankEntry[] {
  return engineRank(room).map((s, i) => {
    const entry: RankEntry = { id: s.teamId, label: s.teamName, detail: `스톤 ${s.stoneIds.length}개` };
    if (i < 3) entry.medal = (i + 1) as 1 | 2 | 3;
    return entry;
  });
}

export const stonesModule: GameModule<Room, Action> = {
  id: 'stones',
  create: (eventId: string, now: number): Room => newRoom({ id: `stones-${eventId}`, eventId, createdAt: now }),
  apply(state, action, now) {
    try {
      const { state: next, events } = engineApply(state, action, now);
      return { state: next, emits: toHostEmits(events) };
    } catch (err) {
      if (err instanceof EngineError) throw new HostEngineError(err.code, err.message);
      throw err;
    }
  },
  lifecycle: (state: Room): RoomState => state.state,
  allowed: ALLOWED,
  route,
  project: (state: Room, viewer: Viewer) => project(state, viewer),
  rank,
  invariants: assertInvariants,
  persistence: snapshot,
  ticks: false,
  liveProjection: true,
};

export default stonesModule;
export type { Room, Action };
