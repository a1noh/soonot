import { apply, create } from '../apply';
import { assertInvariants } from '../invariants';
import type { Action } from '../actions';
import type { Room } from '../../shared/types';
import { CELLS } from '../../shared/constants';

export const T81 = Array.from({ length: CELLS }, (_, i) => `특징${i}`);

let clock = 1_000_000;
export const tick = () => ++clock;

/** apply + invariant check, which is how every test should call the engine. */
export function step(room: Room, action: Action, now = tick()): Room {
  const { state } = apply(room, action, now);
  assertInvariants(state);
  return state;
}

export function emitsOf(room: Room, action: Action, now = tick()) {
  return apply(room, action, now).emits;
}

/** A room in RUNNING with `n` players named 사람1..사람n. */
export function running(n: number, names?: string[]): Room {
  let r = create('ev1', tick());
  r = step(r, { t: 'SET_TRAITS', texts: T81 });
  for (let i = 1; i <= n; i++) {
    r = step(r, { t: 'JOIN', playerId: `p${i}`, nickname: names?.[i - 1] ?? `사람${i}` });
  }
  return step(r, { t: 'START' });
}

/** A room in LOBBY with `n` players joined, but the game not yet started. */
export function lobby(n: number, names?: string[]): Room {
  let r = create('ev1', tick());
  r = step(r, { t: 'SET_TRAITS', texts: T81 });
  for (let i = 1; i <= n; i++) {
    r = step(r, { t: 'JOIN', playerId: `p${i}`, nickname: names?.[i - 1] ?? `사람${i}` });
  }
  return r; // no START → still LOBBY
}

/**
 * Fill the given cells on `who`'s card, each with a person not yet used on it
 * — the once-per-card rule (req §7.2) means a helper that always starts from
 * the same person silently fills nothing the second time it is called.
 */
export function fillLine(room: Room, who: string, cells: readonly number[]): Room {
  let r = room;
  for (const cell of cells) {
    if (r.players.get(who)!.fills[cell] !== null) continue;
    const used = r.players.get(who)!.usedPlayerIds;
    const free = [...r.players.values()].find((p) => p.id !== who && !used.has(p.id));
    if (!free) throw new Error(`fillLine: no unused player left for ${who}`);
    r = step(r, { t: 'FILL', playerId: who, cellIndex: cell, query: String(free.number) });
  }
  return r;
}
