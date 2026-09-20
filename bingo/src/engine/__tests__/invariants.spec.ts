import { describe, it, expect } from 'vitest';
import { apply } from '../apply';
import { assertInvariants } from '../invariants';
import type { Action } from '../actions';
import { CELLS } from '../../shared/constants';
import { running, tick } from './helpers';

/** Deterministic PRNG so a failure is reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
}

describe('invariants under random play', () => {
  it('survives 4000 random actions across 25 players', () => {
    const next = rng(20260920);
    let r = running(25);
    const ids = [...r.players.keys()];

    for (let n = 0; n < 4000; n++) {
      const who = ids[Math.floor(next() * ids.length)]!;
      const cell = Math.floor(next() * CELLS);
      const roll = next();
      const a: Action =
        roll < 0.7
          ? { t: 'FILL', playerId: who, cellIndex: cell, query: String(1 + Math.floor(next() * 30)) }
          : roll < 0.9
            ? { t: 'CLEAR', playerId: who, cellIndex: cell }
            : roll < 0.95
              ? { t: 'DISCONNECT', playerId: who }
              : { t: 'REJOIN', playerId: who };
      r = apply(r, a, tick()).state;
      assertInvariants(r);
    }

    // the run should have actually exercised things
    const filled = [...r.players.values()].reduce(
      (n, p) => n + p.fills.filter((f) => f !== null).length, 0);
    expect(filled).toBeGreaterThan(100);
  });

  it('catches a hand-corrupted usedPlayerIds', () => {
    let r = running(3);
    r = apply(r, { t: 'FILL', playerId: 'p1', cellIndex: 0, query: '2' }, tick()).state;
    const p = r.players.get('p1')!;
    const broken = { ...r, players: new Map(r.players).set('p1', { ...p, usedPlayerIds: new Set<string>() }) };
    expect(() => assertInvariants(broken)).toThrow(/usedPlayerIds/);
  });
});
