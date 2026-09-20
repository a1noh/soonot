import { describe, expect, it } from 'vitest';
import { assertInvariants, InvariantError } from '../invariants';
import { ROLLS } from '../../shared/constants';
import type { Room } from '../../shared/types';
import { started, step, T0 } from './helpers';

/** Deterministic LCG — a fuzz test that cannot reproduce is not a test. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Drive only actions that are legal right now, asserting invariants at every step. */
function fuzz(seed: number, steps: number): Room {
  const rnd = lcg(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;

  let r = started({ teams: 3, malPerTeam: 2 });
  let now = T0;

  for (let i = 0; i < steps && r.state === 'RUNNING'; i++) {
    now += Math.floor(rnd() * 5000);
    if (r.pendingThrow !== null) {
      if (rnd() < 0.1) r = step(r, { t: 'UNDO' }, now).state;
      else r = step(r, { t: 'MOVE', malId: pick(r.pendingThrow.candidates).malId }, now).state;
      continue;
    }
    const roll = rnd();
    if (roll < 0.08 && r.history.length > 0) r = step(r, { t: 'UNDO' }, now).state;
    else if (roll < 0.12 && r.pausedAt === null) r = step(r, { t: 'PAUSE' }, now).state;
    else if (r.pausedAt !== null) r = step(r, { t: 'RESUME' }, now).state;
    else if (roll < 0.16) r = step(r, { t: 'TICK' }, now).state;
    else r = step(r, { t: 'THROW', roll: pick(ROLLS) }, now).state;
  }
  return r;
}

describe('invariants (spec §4.5)', () => {
  it('holds across long random action sequences', () => {
    for (const seed of [1, 7, 42, 1234, 99991]) {
      const final = fuzz(seed, 300);
      assertInvariants(final);
    }
  });

  it('random play still terminates in a legal state', () => {
    const final = fuzz(2026, 500);
    expect(['RUNNING', 'ENDED']).toContain(final.state);
    if (final.state === 'ENDED') expect(final.endReason).not.toBeNull();
  });

  it('catches a 말 pushed outside 0..20', () => {
    const r = started();
    r.teams[0]!.mal[0]!.progress = 21;
    expect(() => assertInvariants(r)).toThrow(InvariantError);
  });

  it('catches a team that is all home but has no finishedAt', () => {
    const r = started({ malPerTeam: 1 });
    r.teams[0]!.mal[0]!.progress = 20;
    expect(() => assertInvariants(r)).toThrow(/finishedAt/);
  });

  it('catches a turn pointer aimed at a finished team', () => {
    const r = started({ malPerTeam: 1 });
    r.teams[0]!.mal[0]!.progress = 20;
    r.teams[0]!.finishedAt = T0;
    r.turnIndex = 0;
    expect(() => assertInvariants(r)).toThrow(/finished team/);
  });

  it('catches a broken history sequence', () => {
    const r = started();
    r.history.push({
      seq: 7, teamId: 't1', roll: '도', malId: 't1m1', from: 0, to: 1,
      captures: [], bonusGranted: 0, finishedTeam: false, at: T0,
    });
    expect(() => assertInvariants(r)).toThrow(/seq/);
  });

  it('catches duplicate team names', () => {
    const r = started();
    r.teams[1]!.name = r.teams[0]!.name;
    expect(() => assertInvariants(r)).toThrow(/duplicate/);
  });
});
