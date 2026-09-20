/**
 * Deterministic per-player card generation. bingo/req.md §6.
 *
 * The seed is the storage: a reconnecting player's card is regenerated
 * identically, so only the fill state is persisted (spec §8.1).
 */
import { CELLS } from '../shared/constants';

/** FNV-1a, 32-bit. Small, stable across engines — which is the requirement. */
export function hashSeed(...parts: string[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) {
      h ^= p.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x2f; // '/' separator so ('ab','c') and ('a','bc') differ
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — a small, well-distributed seeded PRNG. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * permutation[cellIndex] = traitId. No free centre (req §6) — 81 cells with
 * one gifted is a rounding error, and it would make both diagonals and the
 * middle row and column strictly easier.
 */
export function makePermutation(eventId: string, playerId: string): number[] {
  const next = rng(hashSeed(eventId, playerId));
  const p = Array.from({ length: CELLS }, (_, i) => i);
  for (let i = CELLS - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [p[i], p[j]] = [p[j]!, p[i]!];
  }
  return p;
}
