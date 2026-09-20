import { describe, expect, it } from 'vitest';
import { candidates } from '../candidates';
import { HOME, ROLLS, ROLL_STEPS } from '../../shared/constants';
import { place, started, T0 } from './helpers';

describe('candidates (req §8.1, §9)', () => {
  it('offers a candidate for every (progress, roll) pair — the no-pass guarantee', () => {
    const base = started();
    for (let progress = 0; progress < HOME; progress++) {
      for (const roll of ROLLS) {
        const r = place(base, { t1m1: progress, t1m2: HOME });
        const cands = candidates(r, 't1', roll);
        expect(cands.length, `progress ${progress}, roll ${roll}`).toBeGreaterThan(0);
      }
    }
  });

  it('never offers a 말 that is already home', () => {
    const r = place(started(), { t1m1: HOME, t1m2: 3 });
    expect(candidates(r, 't1', '도').map((c) => c.malId)).toEqual(['t1m2']);
  });

  it('brings a waiting 말 out to the station matching the roll', () => {
    const r = started();
    const cand = candidates(r, 't1', '걸').find((c) => c.malId === 't1m1')!;
    expect(cand.from).toBe(0);
    expect(cand.to).toBe(ROLL_STEPS['걸']);
  });

  it('marks a finishing move and carries no captures at home', () => {
    const r = place(started(), { t1m1: 19, t2m1: 19 });
    const cand = candidates(r, 't1', '모').find((c) => c.malId === 't1m1')!;
    expect(cand.to).toBe(HOME);
    expect(cand.finishes).toBe(true);
    expect(cand.captures).toEqual([]);
  });

  it('reports the opposing 말 a move would catch', () => {
    const r = place(started(), { t1m1: 2, t2m1: 5, t2m2: 5 });
    const cand = candidates(r, 't1', '걸').find((c) => c.malId === 't1m1')!;
    expect(cand.to).toBe(5);
    expect(cand.captures.sort()).toEqual(['t2m1', 't2m2']);
  });

  it('returns an empty list for an unknown team', () => {
    expect(candidates(started(), 'nope', '도')).toEqual([]);
  });

  it('is unaffected by the current turn pointer — it answers about the team it is asked', () => {
    const r = place(started(), { t2m1: 4 });
    expect(candidates(r, 't2', '도').find((c) => c.malId === 't2m1')!.to).toBe(5);
    expect(r.turnIndex).toBe(0);
    void T0;
  });
});
