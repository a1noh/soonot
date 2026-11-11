import type { RoomState } from '@soonot/master';
import { MAX_STONES, MAX_TEAMS, MIN_TEAMS, STONE_COLORS, TEAM_COLORS } from '../shared/constants';
import type { Room } from '../shared/types';
import { EngineError, type Action, type Emit } from './actions';

export const ALLOWED: Readonly<Record<RoomState, readonly Action['t'][]>> = {
  SETUP: ['SETUP'],
  LOBBY: ['SETUP', 'START', 'SET_PLAYING'],
  RUNNING: ['PICK', 'CANCEL_PICK', 'RESOLVE', 'SKIP', 'SET_PLAYING', 'UNDO', 'END'],
  ENDED: ['RESUME_FROM_ENDED', 'REVEAL'],
  REVEAL: ['REVEAL'],
};

const MAX_REVEAL_STEP = 4;

export function newRoom(opts: { id: string; eventId: string; createdAt: number }): Room {
  return {
    ...opts,
    state: 'SETUP',
    teams: [],
    stones: [],
    turnTeamId: null,
    round: 0,
    pending: null,
    wins: [],
    history: [],
    lastResult: null,
    seq: 0,
    startedAt: null,
    endedAt: null,
    revealStep: 0,
  };
}

export function heldBy(room: Room, teamId: string): string[] {
  return room.wins.filter((w) => w.teamId === teamId).map((w) => w.stoneId);
}

/** The next playing team after `fromId` in setup order, and whether we wrapped into a new round. */
function nextPlaying(room: Room, fromId: string | null): { id: string; wrapped: boolean } | null {
  const n = room.teams.length;
  const from = fromId === null ? -1 : room.teams.findIndex((t) => t.id === fromId);
  for (let k = 1; k <= n; k++) {
    const i = from + k;
    const team = room.teams[i % n]!;
    if (team.playing) return { id: team.id, wrapped: i >= n && from >= 0 };
  }
  return null;
}

function turnEmit(r: Room): Emit {
  const team = r.teams.find((t) => t.id === r.turnTeamId)!;
  return { e: 'turn:changed', teamId: team.id, teamName: team.name, round: r.round };
}

function advance(r: Room): Emit {
  const next = nextPlaying(r, r.turnTeamId)!;
  if (next.wrapped) r.round += 1;
  r.turnTeamId = next.id;
  return turnEmit(r);
}

/** Pure reducer. Time is an argument; nothing is random. */
export function apply(state: Room, action: Action, now: number): { state: Room; events: Emit[] } {
  if (!ALLOWED[state.state].includes(action.t)) {
    throw new EngineError('ILLEGAL_ACTION', `${action.t} not allowed while ${state.state}`);
  }
  const r: Room = structuredClone(state);
  const events: Emit[] = [];

  switch (action.t) {
    case 'SETUP': {
      const names = action.teams.map((t) => t.name.trim());
      if (names.some((n) => n.length === 0)) throw new EngineError('DUPLICATE_TEAM_NAME', 'empty team name');
      if (new Set(names).size !== names.length) throw new EngineError('DUPLICATE_TEAM_NAME');
      if (names.length > MAX_TEAMS) throw new EngineError('TOO_MANY_TEAMS');
      if (action.teams.filter((t) => t.playing).length < MIN_TEAMS) throw new EngineError('TOO_FEW_TEAMS');
      const stones = action.stones.filter((s) => s.name.trim().length > 0);
      if (stones.length === 0) throw new EngineError('NO_STONES');
      if (stones.length > MAX_STONES) throw new EngineError('TOO_MANY_STONES');

      r.teams = action.teams.map((t, i) => ({
        id: `t${i + 1}`,
        name: names[i]!,
        color: TEAM_COLORS[i % TEAM_COLORS.length]!,
        playing: t.playing,
      }));
      r.stones = stones.map((s, i) => ({
        id: `s${i + 1}`,
        name: s.name.trim(),
        color: STONE_COLORS[i % STONE_COLORS.length]!,
        mission: s.mission.trim(),
      }));
      r.state = 'LOBBY';
      events.push({ e: 'stones:update' });
      break;
    }

    case 'START': {
      r.state = 'RUNNING';
      r.startedAt = now;
      r.round = 1;
      r.turnTeamId = nextPlaying(r, null)!.id;
      events.push(turnEmit(r));
      break;
    }

    case 'PICK': {
      if (r.pending !== null) throw new EngineError('PICK_PENDING');
      const stone = r.stones.find((s) => s.id === action.stoneId);
      if (!stone) throw new EngineError('UNKNOWN_STONE');
      const teamId = r.turnTeamId!;
      if (heldBy(r, teamId).includes(stone.id)) throw new EngineError('ALREADY_HELD');
      r.pending = { teamId, stoneId: stone.id };
      r.lastResult = null;
      events.push({ e: 'stone:picked', teamId, stoneId: stone.id });
      break;
    }

    case 'CANCEL_PICK': {
      if (r.pending === null) throw new EngineError('NO_PICK');
      r.pending = null;
      events.push({ e: 'stones:update' });
      break;
    }

    case 'RESOLVE': {
      if (r.pending === null) throw new EngineError('NO_PICK');
      const { teamId, stoneId } = r.pending;
      if (action.success) r.wins.push({ teamId, stoneId, at: now });
      r.history.push({ kind: 'resolve', teamId, round: r.round, stoneId, success: action.success, at: now });
      r.seq += 1;
      r.lastResult = { seq: r.seq, teamId, stoneId, success: action.success };
      r.pending = null;
      events.push({ e: 'stone:resolved', teamId, stoneId, success: action.success });
      events.push(advance(r));
      break;
    }

    case 'SKIP': {
      if (r.pending !== null) throw new EngineError('PICK_PENDING');
      r.history.push({ kind: 'skip', teamId: r.turnTeamId!, round: r.round, stoneId: null, success: null, at: now });
      r.lastResult = null;
      events.push(advance(r));
      break;
    }

    case 'SET_PLAYING': {
      const team = r.teams.find((t) => t.id === action.teamId);
      if (!team) throw new EngineError('UNKNOWN_TEAM');
      if (team.playing === action.playing) {
        events.push({ e: 'stones:update' });
        break;
      }
      if (!action.playing) {
        const left = r.teams.filter((t) => t.playing).length - 1;
        const floor = r.state === 'LOBBY' ? MIN_TEAMS : 1;
        if (left < floor) throw new EngineError('LAST_TEAM');
        if (r.pending?.teamId === team.id) throw new EngineError('PICK_PENDING');
      }
      // Leaving on your own turn passes it on before the flag drops, so the
      // pointer never lands on a team that is out.
      if (!action.playing && r.state === 'RUNNING' && r.turnTeamId === team.id) {
        team.playing = false;
        events.push(advance(r));
      } else {
        team.playing = action.playing;
      }
      events.push({ e: 'stones:update' });
      break;
    }

    case 'UNDO': {
      if (r.pending !== null) throw new EngineError('PICK_PENDING');
      const last = r.history.pop();
      if (!last) throw new EngineError('NOTHING_TO_UNDO');
      if (last.kind === 'resolve' && last.success) {
        for (let i = r.wins.length - 1; i >= 0; i--) {
          const w = r.wins[i]!;
          if (w.teamId === last.teamId && w.stoneId === last.stoneId) {
            r.wins.splice(i, 1);
            break;
          }
        }
      }
      r.turnTeamId = last.teamId;
      r.round = last.round;
      const team = r.teams.find((t) => t.id === last.teamId)!;
      team.playing = true;
      r.lastResult = null;
      events.push({ e: 'undo:applied' }, turnEmit(r));
      break;
    }

    case 'END': {
      r.pending = null;
      r.state = 'ENDED';
      r.endedAt = now;
      events.push({ e: 'game:ended', endedAt: now });
      break;
    }

    case 'RESUME_FROM_ENDED': {
      if (r.revealStep > 0) throw new EngineError('REVEAL_STARTED');
      r.state = 'RUNNING';
      r.endedAt = null;
      events.push(turnEmit(r));
      break;
    }

    case 'REVEAL': {
      if (r.state === 'ENDED') {
        if (action.step !== 0) throw new EngineError('BAD_REVEAL_STEP');
        r.state = 'REVEAL';
        r.revealStep = 0;
      } else {
        if (action.step !== r.revealStep + 1 || action.step > MAX_REVEAL_STEP) {
          throw new EngineError('BAD_REVEAL_STEP');
        }
        r.revealStep = action.step;
      }
      events.push({ e: 'reveal:step', step: r.revealStep });
      break;
    }
  }

  return { state: r, events };
}
