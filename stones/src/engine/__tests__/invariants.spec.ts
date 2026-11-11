import { describe, expect, it } from 'vitest';
import { apply } from '../apply';
import { EngineError, type Action } from '../actions';
import { assertInvariants } from '../invariants';
import { started, T0 } from './helpers';

/** Tiny seeded PRNG so a failure reproduces. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

describe('random play never breaks the invariants', () => {
  for (const seed of [1, 2, 3, 42, 99]) {
    it(`seed ${seed}`, () => {
      const rand = rng(seed);
      let r = started({ teams: 6 });
      const one = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
      const someTeams = () => r.teams.filter(() => rand() < 0.3).map((t) => t.id);
      let ok = 0;
      for (let i = 0; i < 2000; i++) {
        const action: Action = one<Action>([
          { t: 'PICK', stoneId: one(r.stones).id },
          { t: 'PICK', stoneId: one(r.stones).id },
          { t: 'RESOLVE', winners: someTeams() },
          { t: 'RESOLVE', winners: someTeams() },
          { t: 'CANCEL_PICK' },
          { t: 'SKIP' },
          { t: 'UNDO' },
          { t: 'UNDO' },
          { t: 'SET_PLAYING', teamId: one(r.teams).id, playing: rand() < 0.6 },
        ]);
        try {
          r = apply(r, action, T0 + i).state;
          ok++;
        } catch (e) {
          if (!(e instanceof EngineError)) throw e;
        }
        assertInvariants(r);
      }
      expect(ok).toBeGreaterThan(400);
    });
  }
});
