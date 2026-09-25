import { describe, it, expect } from 'vitest';
import { LINES } from '../../shared/lines';
import { rank, rankPlayers } from '../ranking';
import { running, fillLine, step } from './helpers';

/** Give `who` a bingo (one line), every fill stamped at exactly `at`. */
function bingoAt(room: ReturnType<typeof running>, who: string, at: number) {
  return bingoLinesAt(room, who, [0], at);
}

/** Complete `lineIdxs` (a set of LINES indices) for `who`, all fills stamped `at`. */
function bingoLinesAt(room: ReturnType<typeof running>, who: string, lineIdxs: number[], at: number) {
  let r = room;
  const others = [...r.players.keys()].filter((id) => id !== who);
  let k = 0; // a fresh, distinct person per cell (once-per-card rule)
  for (const li of lineIdxs) {
    for (const cell of LINES[li]!.cells) {
      if (r.players.get(who)!.fills[cell] != null) continue; // lines can share a cell
      r = step(r, { t: 'FILL', playerId: who, cellIndex: cell, query: String(r.players.get(others[k++]!)!.number) }, at);
    }
  }
  return r;
}

describe('ranking (req §9) — by points (칸수 + 5×줄)', () => {
  it('ranks by total points: more points wins', () => {
    let r = running(24);
    r = bingoLinesAt(r, 'p1', [0], 1000); // 5칸 + 1줄 = 10점 (early)
    r = bingoLinesAt(r, 'p2', [0, 1], 9000); // 10칸 + 2줄 = 20점 (later)
    // 20 > 10, so p2 wins regardless of finishing later.
    expect(rankPlayers(r).slice(0, 2).map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('with equal lines, more filled cells (more points) ranks first', () => {
    let r = running(24);
    r = bingoLinesAt(r, 'p1', [0], 5000); // 5칸 + 1줄 = 10점
    r = bingoLinesAt(r, 'p2', [0], 6000); // 5칸 + 1줄 = 10점 …
    r = fillLine(r, 'p2', [10, 11, 12]); // +3칸 → 8칸 + 1줄 = 13점
    expect(rankPlayers(r).slice(0, 2).map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('POINTS beat lines: a heavily-filled 0줄 board outranks a light 1줄 board', () => {
    let r = running(24);
    r = bingoLinesAt(r, 'p1', [0], 5000); // 5칸 + 1줄 = 10점
    // 11 cells that complete NO line (cols 1 & 2 stop at 4/5): 11칸 + 0줄 = 11점
    r = fillLine(r, 'p2', [1, 2, 3, 6, 7, 8, 11, 12, 13, 16, 17]);
    expect(r.players.get('p2')!.completedLines.length).toBe(0);
    const ids = rankPlayers(r).map((p) => p.id);
    expect(ids.indexOf('p2')).toBeLessThan(ids.indexOf('p1')); // 11점 > 10점
  });

  it('breaks a points tie by who reached it FIRST (먼저 달성한 사람 우선)', () => {
    let r = running(24);
    r = bingoLinesAt(r, 'p1', [0], 5000); // 10점, last fill @5000
    r = bingoLinesAt(r, 'p2', [0], 7000); // 10점, last fill @7000
    const [a, b] = rankPlayers(r);
    expect(pointsFor(a!)).toBe(pointsFor(b!)); // truly tied on points
    expect(a!.id).toBe('p1'); // earlier achiever ranks higher
  });

  it('with the same score and same finish time, falls back to the lower number', () => {
    let r = running(24);
    r = bingoAt(r, 'p1', 7000);
    r = bingoAt(r, 'p2', 7000);
    const [a, b] = rankPlayers(r);
    expect(pointsFor(a!)).toBe(pointsFor(b!));
    expect(a!.number).toBeLessThan(b!.number); // deterministic, not seq-of-processing
  });

  it('awards at most three medals, and none to a 0점 player', () => {
    let r = running(12);
    r = bingoAt(r, 'p1', 1000);
    const entries = rank(r);
    expect(entries.filter((e) => e.medal !== undefined)).toHaveLength(1);
    expect(entries[0]!.medal).toBe(1);
    expect(entries[0]!.detail).toContain('점'); // detail leads with points
  });

  it('zero score: a full board, no medals', () => {
    const r = running(12);
    const entries = rank(r);
    expect(entries).toHaveLength(12);
    expect(entries.some((e) => e.medal !== undefined)).toBe(false);
  });

  it('labels carry the number, and marks self', () => {
    const r = running(3, ['민수', '민수', '지은']);
    const entries = rank(r, 'p2');
    expect(entries.map((e) => e.label)).toContain('민수 #002');
    expect(entries.find((e) => e.self)!.id).toBe('p2');
  });
});

function pointsFor(p: { fills: readonly (string | null)[]; completedLines: readonly unknown[] }): number {
  return p.fills.filter((f) => f !== null).length + 5 * p.completedLines.length;
}
