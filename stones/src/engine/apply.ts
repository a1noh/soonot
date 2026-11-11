import type { RoomState } from '@soonot/master';
import { DEFAULT_TIEBREAK, MAX_STONES, MAX_TEAMS, MIN_TEAMS, STONE_COLORS, TEAM_COLORS } from '../shared/constants';
import type { Room } from '../shared/types';
import { EngineError, type Action, type Emit } from './actions';
import { tiedGroups } from './ranking';

export const ALLOWED: Readonly<Record<RoomState, readonly Action['t'][]>> = {
  SETUP: ['SETUP'],
  LOBBY: ['SETUP', 'START', 'SET_PLAYING'],
  RUNNING: ['PICK', 'CANCEL_PICK', 'RESOLVE', 'SKIP', 'SET_PLAYING', 'UNDO', 'END'],
  ENDED: ['RESUME_FROM_ENDED', 'REVEAL', 'UNDO', 'TIEBREAK_START', 'TIEBREAK_RESOLVE', 'TIEBREAK_CANCEL'],
  REVEAL: ['REVEAL'],
};

const MAX_REVEAL_STEP = 4;

export function newRoom(opts: { id: string; eventId: string; createdAt: number }): Room {
  return {
    ...opts,
    state: 'SETUP',
    teams: [],
    stones: [],
    games: [],
    turnTeamId: null,
    round: 0,
    pending: null,
    claims: [],
    history: [],
    tiebreak: { id: 'tb', ...DEFAULT_TIEBREAK },
    tiebreaks: [],
    activeTiebreak: null,
    lastResult: null,
    seq: 0,
    startedAt: null,
    endedAt: null,
    revealStep: 0,
  };
}

/** Stones a team has won, in the order it won them. */
export function heldBy(room: Room, teamId: string): string[] {
  return room.claims.filter((c) => c.winners.includes(teamId)).map((c) => c.stoneId);
}

/** How many stones can still be played for: limited by stones and by games. */
export function picksLeft(room: Room): number {
  return Math.min(room.stones.length, room.games.length) - room.claims.length;
}

/** The game the next pick will open. Console-only: the room must not know. */
export function nextGame(room: Room) {
  return room.games[room.claims.length] ?? null;
}

/** The next playing team after `fromId` in setup order, and whether we wrapped. */
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
      const stones = action.stones.map((s) => s.name.trim()).filter(Boolean);
      if (stones.length === 0) throw new EngineError('NO_STONES');
      if (stones.length > MAX_STONES) throw new EngineError('TOO_MANY_STONES');
      const games = action.games.filter((g) => g.name.trim().length > 0);
      if (games.length === 0) throw new EngineError('NO_GAMES');

      r.teams = action.teams.map((t, i) => ({
        id: `t${i + 1}`,
        name: names[i]!,
        color: TEAM_COLORS[i % TEAM_COLORS.length]!,
        playing: t.playing,
      }));
      r.stones = stones.map((name, i) => ({ id: `s${i + 1}`, name, color: STONE_COLORS[i % STONE_COLORS.length]! }));
      r.games = games.map((g, i) => ({
        id: `g${i + 1}`,
        name: g.name.trim(),
        players: g.players.trim(),
        instructions: g.instructions.trim(),
      }));
      const tb = action.tiebreak && action.tiebreak.name.trim() ? action.tiebreak : DEFAULT_TIEBREAK;
      r.tiebreak = { id: 'tb', name: tb.name.trim(), players: tb.players.trim(), instructions: tb.instructions.trim() };
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
      if (r.claims.some((c) => c.stoneId === stone.id)) throw new EngineError('STONE_TAKEN');
      const game = nextGame(r);
      if (!game || picksLeft(r) <= 0) throw new EngineError('NO_GAME_LEFT');
      r.pending = { chooserId: r.turnTeamId!, stoneId: stone.id, gameId: game.id };
      r.lastResult = null;
      events.push({ e: 'stone:picked', chooserId: r.turnTeamId!, stoneId: stone.id, gameId: game.id });
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
      const ids = new Set(r.teams.map((t) => t.id));
      const winners = [...new Set(action.winners)];
      if (winners.some((w) => !ids.has(w))) throw new EngineError('UNKNOWN_TEAM');
      const { chooserId, stoneId, gameId } = r.pending;
      r.claims.push({ stoneId, gameId, chooserId, round: r.round, winners, at: now });
      r.history.push({ kind: 'claim', chooserId, round: r.round });
      r.seq += 1;
      r.lastResult = { seq: r.seq, stoneId, gameId, winners };
      r.pending = null;
      events.push({ e: 'stone:resolved', stoneId, winners });
      events.push(advance(r));
      break;
    }

    case 'SKIP': {
      if (r.pending !== null) throw new EngineError('PICK_PENDING');
      r.history.push({ kind: 'skip', chooserId: r.turnTeamId!, round: r.round });
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
        if (r.pending?.chooserId === team.id) throw new EngineError('PICK_PENDING');
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
      // After 게임 종료, undo takes back the last 결정전 result instead.
      if (r.state === 'ENDED') {
        if (r.activeTiebreak !== null) throw new EngineError('TIEBREAK_PENDING');
        if (r.tiebreaks.length === 0) throw new EngineError('NOTHING_TO_UNDO');
        r.tiebreaks.pop();
        events.push({ e: 'undo:applied' });
        break;
      }
      if (r.pending !== null) throw new EngineError('PICK_PENDING');
      const last = r.history.pop();
      if (!last) throw new EngineError('NOTHING_TO_UNDO');
      if (last.kind === 'claim') r.claims.pop();
      r.turnTeamId = last.chooserId;
      r.round = last.round;
      r.teams.find((t) => t.id === last.chooserId)!.playing = true;
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
      // More stones may change hands, so any 결정전 result no longer applies.
      r.tiebreaks = [];
      r.activeTiebreak = null;
      events.push(turnEmit(r));
      break;
    }

    case 'REVEAL': {
      if (r.state === 'ENDED') {
        if (r.activeTiebreak !== null) throw new EngineError('TIEBREAK_PENDING');
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

    case 'TIEBREAK_START': {
      if (r.activeTiebreak !== null) throw new EngineError('TIEBREAK_PENDING');
      const want = new Set(action.teamIds);
      const group = tiedGroups(r).find((g) => g.length === want.size && g.every((id) => want.has(id)));
      if (!group || want.size !== action.teamIds.length) throw new EngineError('NOT_TIED');
      r.activeTiebreak = r.teams.map((t) => t.id).filter((id) => want.has(id));
      events.push({ e: 'tiebreak:started', teamIds: r.activeTiebreak });
      break;
    }

    case 'TIEBREAK_RESOLVE': {
      const active = r.activeTiebreak;
      if (active === null) throw new EngineError('NO_TIEBREAK');
      const order = action.order;
      if (order.length !== active.length || new Set(order).size !== order.length || !order.every((id) => active.includes(id))) {
        throw new EngineError('BAD_ORDER');
      }
      r.tiebreaks.push([...order]);
      r.activeTiebreak = null;
      events.push({ e: 'tiebreak:resolved', order: [...order] });
      break;
    }

    case 'TIEBREAK_CANCEL': {
      if (r.activeTiebreak === null) throw new EngineError('NO_TIEBREAK');
      r.activeTiebreak = null;
      events.push({ e: 'tiebreak:resolved', order: null });
      break;
    }
  }

  return { state: r, events };
}
