/**
 * The 윷놀이 `GameModule` — the only host-facing file in this package.
 * master/spec.md §3; yutnori/spec.md milestone 2.
 *
 * This is the seam. Three translations happen here and nowhere else:
 *   1. engine `Emit` (`{ e, ... }`) → host `Emit` (audience + ev + data)
 *   2. engine `EngineError` → the host's, so `toWireError` keeps the code
 *   3. engine `Standing` → the shared podium's `RankEntry`
 */
import {
  EngineError as HostEngineError,
  type Emit as HostEmit,
  type GameModule,
  type RankEntry,
  type RoomState,
  type Viewer,
} from '@soonot/master';
import { apply as engineApply, newRoom, remainingMs } from './engine/apply';
import { EngineError, type Action, type Emit } from './engine/actions';
import { assertInvariants } from './engine/invariants';
import { rank as engineRank } from './engine/ranking';
import type { Roll, Room } from './shared/types';
import { project } from './project';
import { eventlog } from './persist';

const ROLLS: readonly Roll[] = ['도', '개', '걸', '윷', '모'];

export const ALLOWED: Readonly<Record<RoomState, readonly Action['t'][]>> = {
  SETUP: ['SETUP'],
  LOBBY: ['START'],
  RUNNING: ['THROW', 'MOVE', 'UNDO', 'PAUSE', 'RESUME', 'EXTEND', 'TICK', 'MINIGAME_SPIN', 'MINIGAME_RESOLVE'],
  ENDED: ['RESUME_FROM_ENDED'],
  REVEAL: [],
};

/**
 * Every 윷놀이 emit is `to: 'room'` — the board is public by design (req §12).
 * The audience field is still required on every one, because the same routing
 * layer carries bingo, where unicast is the rule that must not be got wrong
 * (master spec §6.2).
 */
function toHostEmits(events: readonly Emit[]): HostEmit[] {
  return events.map((e) => {
    const { e: ev, ...data } = e;
    return { to: 'room', ev, data } as HostEmit;
  });
}

function int(payload: unknown, key: string): number | null {
  const v = (payload as Record<string, unknown> | null)?.[key];
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}

function str(payload: unknown, key: string): string | null {
  const v = (payload as Record<string, unknown> | null)?.[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** The whole protocol as data (master spec §3.2). */
function route(ev: string, payload: unknown, viewer: Viewer): Action | null {
  // req §3 — teams have no client. One writer, and it is the master.
  if (viewer.kind !== 'master') return null;

  switch (ev) {
    case 'master:setup': {
      const p = payload as { teams?: unknown; malPerTeam?: unknown; timeLimitMin?: unknown } | null;
      if (!Array.isArray(p?.teams)) return null;
      const teams = p.teams
        .map((t) => {
          const name = typeof t?.name === 'string' ? t.name.trim() : '';
          return name ? { name, roster: typeof t?.roster === 'string' ? t.roster : null } : null;
        })
        .filter((t): t is { name: string; roster: string | null } => t !== null);
      const malPerTeam = p.malPerTeam === 1 || p.malPerTeam === 2 ? p.malPerTeam : 2;
      const timeLimitMin = typeof p.timeLimitMin === 'number' ? p.timeLimitMin : 30;
      // Mario-Party mode is the default for real play; the console can turn it off.
      const miniGames = (p as { miniGames?: unknown }).miniGames !== false;
      // 잡기 방어전 (대표 대결) — on by default; the console can turn it off.
      const captureDuel = (p as { captureDuel?: unknown }).captureDuel !== false;
      // The editable 미니게임 데이터베이스 for this event, if the console sent one.
      const rawSet = (p as { miniGameSet?: unknown }).miniGameSet;
      const miniGameSet = Array.isArray(rawSet)
        ? rawSet
            .map((g, i) => {
              const name = typeof g?.name === 'string' ? g.name.trim() : '';
              const instruction = typeof g?.instruction === 'string' ? g.instruction.trim() : '';
              const id = typeof g?.id === 'string' && g.id ? g.id : `g${i + 1}`;
              return name ? { id, name, instruction } : null;
            })
            .filter((g): g is { id: string; name: string; instruction: string } => g !== null)
        : undefined;
      // The editable 1:1 대결 종목 list (same shape as miniGameSet, minus seconds).
      const rawDuel = (p as { duelGameSet?: unknown }).duelGameSet;
      const duelGameSet = Array.isArray(rawDuel)
        ? rawDuel
            .map((g, i) => {
              const name = typeof g?.name === 'string' ? g.name.trim() : '';
              const instruction = typeof g?.instruction === 'string' ? g.instruction.trim() : '';
              const id = typeof g?.id === 'string' && g.id ? g.id : `d${i + 1}`;
              return name ? { id, name, instruction } : null;
            })
            .filter((g): g is { id: string; name: string; instruction: string } => g !== null)
        : undefined;
      return { t: 'SETUP', teams, malPerTeam, timeLimitMin, miniGames, captureDuel, miniGameSet, duelGameSet };
    }
    case 'master:start':
      return { t: 'START' };
    case 'master:throw': {
      const roll = str(payload, 'roll');
      return roll !== null && ROLLS.includes(roll as Roll) ? { t: 'THROW', roll: roll as Roll } : null;
    }
    case 'master:move': {
      const malId = str(payload, 'malId');
      if (malId === null) return null;
      const to = int(payload, 'to'); // which 밭 (지름길 vs 바깥길) when a branch offers two
      return to === null ? { t: 'MOVE', malId } : { t: 'MOVE', malId, to };
    }
    case 'master:undo':
      return { t: 'UNDO' };
    case 'master:pause':
      return { t: 'PAUSE' };
    case 'master:resume':
      return { t: 'RESUME' };
    case 'master:extend': {
      const minutes = int(payload, 'minutes');
      return minutes === null || minutes <= 0 ? null : { t: 'EXTEND', minutes };
    }
    case 'master:end':
      return { t: 'END', reason: 'master' };
    case 'master:resumeFromEnded':
      return { t: 'RESUME_FROM_ENDED' };
    case 'master:reveal': {
      const step = int(payload, 'step');
      return step === null || step < 0 || step > 4 ? null : { t: 'REVEAL', step };
    }
    case 'master:tick':
      return { t: 'TICK' };
    case 'master:minigame:spin': {
      // `gameId` in the envelope names the *game module* (host routing); the
      // mini-game id rides in `game` to avoid colliding with it.
      const gameId = str(payload, 'game');
      return gameId === null ? null : { t: 'MINIGAME_SPIN', gameId };
    }
    case 'master:minigame:resolve': {
      const success = (payload as { success?: unknown } | null)?.success;
      return typeof success === 'boolean' ? { t: 'MINIGAME_RESOLVE', success } : null;
    }
    default:
      return null;
  }
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** engine `Standing` → the one podium both games render (master spec §3.4). */
function rank(room: Room): RankEntry[] {
  return engineRank(room).map((s, i) => {
    const entry: RankEntry = {
      id: s.teamId,
      label: s.teamName,
      detail:
        s.finishedAt !== null
          ? `말 ${s.malHome}개 집 · ${mmss(s.finishedAt - (room.startedAt ?? s.finishedAt))}`
          : `말 ${s.malHome}개 집 · ${s.totalProgress}칸`,
    };
    if (i < 3) entry.medal = (i + 1) as 1 | 2 | 3;
    return entry;
  });
}

export const yutnoriModule: GameModule<Room, Action> = {
  id: 'yutnori',

  create: (eventId: string, now: number): Room =>
    newRoom({ id: `yut-${eventId}`, eventId, createdAt: now }),

  apply(state, action, now) {
    try {
      const { state: next, events } = engineApply(state, action, now);
      return { state: next, emits: toHostEmits(events) };
    } catch (err) {
      // Translate at the seam so the host's `toWireError` keeps the code
      // instead of flattening it to INTERNAL.
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
  persistence: eventlog,

  /**
   * 윷놀이 opts in: clock expiry is a state transition, not a side effect
   * (req §10). Bingo opts out — see master spec §7.
   */
  ticks: true,

  /** One writer, an action every few seconds — the board must move live. */
  liveProjection: true,
};

export default yutnoriModule;
export { remainingMs };
export type { Room, Action };
