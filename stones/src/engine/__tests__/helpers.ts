import { apply, newRoom } from '../apply';
import { assertInvariants } from '../invariants';
import type { Action, Emit } from '../actions';
import type { Room } from '../../shared/types';
import { DEFAULT_GAMES, DEFAULT_STONES } from '../../shared/constants';

export const T0 = 1_700_000_000_000;

export function step(room: Room, action: Action, now = T0): { state: Room; events: Emit[] } {
  const out = apply(room, action, now);
  assertInvariants(out.state);
  return out;
}

export function act(room: Room, action: Action, now = T0): Room {
  return step(room, action, now).state;
}

export function setUp(opts?: { teams?: number; sitOut?: number[]; games?: number }): Room {
  const n = opts?.teams ?? 3;
  return act(newRoom({ id: 'r1', eventId: 'e1', createdAt: T0 }), {
    t: 'SETUP',
    teams: Array.from({ length: n }, (_, i) => ({ name: `조${i + 1}`, playing: !opts?.sitOut?.includes(i + 1) })),
    stones: DEFAULT_STONES.map((name) => ({ name })),
    games: DEFAULT_GAMES.slice(0, opts?.games ?? DEFAULT_GAMES.length),
  });
}

export function started(opts?: { teams?: number; sitOut?: number[]; games?: number }): Room {
  return act(setUp(opts), { t: 'START' });
}

/** The chooser taps `stoneId`; every team plays; `winners` get the stone. */
export function play(room: Room, stoneId: string, winners: string[], now = T0): Room {
  return act(act(room, { t: 'PICK', stoneId }, now), { t: 'RESOLVE', winners }, now);
}
