import { describe, it, expect } from 'vitest';
import { makePermutation } from '../shuffle';
import { CELLS } from '../../shared/constants';

describe('card generation (req §6)', () => {
  it('is a true permutation of 0..80', () => {
    const p = makePermutation('ev1', 'p1');
    expect(p).toHaveLength(CELLS);
    expect([...p].sort((a, b) => a - b)).toEqual(Array.from({ length: CELLS }, (_, i) => i));
  });

  it('is deterministic — the seed IS the storage', () => {
    expect(makePermutation('ev1', 'p1')).toEqual(makePermutation('ev1', 'p1'));
  });

  it('differs per player and per event', () => {
    expect(makePermutation('ev1', 'p1')).not.toEqual(makePermutation('ev1', 'p2'));
    expect(makePermutation('ev1', 'p1')).not.toEqual(makePermutation('ev2', 'p1'));
  });

  it('does not collide on concatenation: (ab,c) vs (a,bc)', () => {
    expect(makePermutation('ab', 'c')).not.toEqual(makePermutation('a', 'bc'));
  });

  it('actually shuffles', () => {
    const p = makePermutation('ev1', 'p1');
    const identity = p.filter((t, i) => t === i).length;
    expect(identity).toBeLessThan(10);
  });
});
