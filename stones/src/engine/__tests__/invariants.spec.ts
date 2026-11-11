import { describe, expect, it } from 'vitest';
import { apply } from '../apply';
import { EngineError, type Action } from '../actions';
import { assertInvariants } from '../invariants';
import { started, T0 } from './helpers';

/** Tiny seeded PRNG so a failure reproduces. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe('random play never breaks the invariants', () => {
  for (const seed of [1, 2, 3, 42, 99]) {
    it(`seed ${seed}`, () => {
      const rand = rng(seed);
      let r = started({ teams: 7 });
      const pickOne = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
      let ok = 0;
      for (let i = 0; i < 2000; i++) {
        const action: Action = pickOne<Action>([
          { t: 'PICK', stoneId: pickOne(r.stones).id },
          { t: 'PICK', stoneId: pickOne(r.stones).id },
          { t: 'RESOLVE', success: rand() < 0.5 },
          { t: 'RESOLVE', success: rand() < 0.5 },
          { t: 'CANCEL_PICK' },
          { t: 'SKIP' },
          { t: 'UNDO' },
          { t: 'SET_PLAYING', teamId: pickOne(r.teams).id, playing: rand() < 0.6 },
        ]);
        try {
          r = apply(r, action, T0 + i).state;
          ok++;
        } catch (e) {
          if (!(e instanceof EngineError)) throw e;
        }
        assertInvariants(r);
      }
      expect(ok).toBeGreaterThan(500);
    });
  }
});
