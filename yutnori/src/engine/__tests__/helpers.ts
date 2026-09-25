import { expect } from 'vitest';
import { apply, newRoom } from '../apply';
import { assertInvariants } from '../invariants';
import type { Action, Emit } from '../actions';
import type { Roll, Room } from '../../shared/types';

export const T0 = 1_700_000_000_000;

/** Drive an action and assert the invariants hold afterwards (spec §4.5). */
export function step(room: Room, action: Action, now: number): { state: Room; events: Emit[] } {
  const out = apply(room, action, now);
  assertInvariants(out.state);
  return out;
}

export function act(room: Room, action: Action, now = T0): Room {
  return step(room, action, now).state;
}

export function started(opts?: {
  teams?: number;
  malPerTeam?: 1 | 2;
  timeLimitMin?: number;
  miniGames?: boolean;
  captureDuel?: boolean;
}): Room {
  const teams = opts?.teams ?? 2;
  let r = newRoom({ id: 'r1', eventId: 'e1', createdAt: T0 });
  r = act(r, {
    t: 'SETUP',
    teams: Array.from({ length: teams }, (_, i) => ({ name: `조${i + 1}` })),
    malPerTeam: opts?.malPerTeam ?? 2,
    timeLimitMin: opts?.timeLimitMin ?? 20,
    miniGames: opts?.miniGames ?? false,
    captureDuel: opts?.captureDuel ?? false,
  });
  return act(r, { t: 'START' });
}

/** Throw, then pick a 말 if a choice was offered. `malId` may be omitted when forced. */
export function turn(room: Room, roll: Roll, malId?: string, now = T0): { state: Room; events: Emit[] } {
  const thrown = step(room, { t: 'THROW', roll }, now);
  if (thrown.state.pendingThrow === null) return thrown;
  const moved = step(thrown.state, { t: 'MOVE', malId: malId ?? thrown.state.pendingThrow.candidates[0]!.malId }, now);
  return { state: moved.state, events: [...thrown.events, ...moved.events] };
}

export function play(room: Room, roll: Roll, malId?: string, now = T0): Room {
  return turn(room, roll, malId, now).state;
}

export const teamOf = (r: Room, id: string) => r.teams.find((t) => t.id === id)!;
export const malOf = (r: Room, id: string) => r.teams.flatMap((t) => t.mal).find((m) => m.id === id)!;
export const currentTeam = (r: Room) => r.teams[r.turnIndex]!;

/**
 * Force a 말 onto a station without going through the rules, to set up a case cheaply.
 *
 * NOT safe for undo or replay tests: `replay` rebuilds from 대기 plus the event log, so
 * a position fabricated here has no event behind it and will not survive an undo. Reach
 * the position by playing instead.
 */
export function place(room: Room, positions: Record<string, number>): Room {
  const r = structuredClone(room);
  for (const [malId, progress] of Object.entries(positions)) {
    const m = r.teams.flatMap((t) => t.mal).find((x) => x.id === malId);
    expect(m, `no such 말: ${malId}`).toBeDefined();
    m!.progress = progress;
  }
  for (const t of r.teams) {
    t.finishedAt = t.mal.every((m) => m.progress >= 20) ? T0 : null;
  }
  return r;
}

export const emitted = (events: Emit[], name: Emit['e']) => events.filter((e) => e.e === name);
