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

describe('ranking (req §9)', () => {
  it('ranks MORE bingos above fewer — even if the smaller board finished earlier', () => {
    let r = running(24);
    r = bingoLinesAt(r, 'p1', [0], 1000); // one line, but early
    r = bingoLinesAt(r, 'p2', [0, 1], 9000); // two lines, later
    // most bingos wins regardless of time
    expect(rankPlayers(r).slice(0, 2).map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('with equal bingos, ranks by finish time (earlier reaches the count first)', () => {
    // Applied in clock order (the engine requires monotonic timestamps): p2 finishes
    // at 6s, p1 at 8s. Both have two lines, so the earlier finisher (p2) ranks first.
    let r = running(24);
    r = bingoLinesAt(r, 'p2', [0, 1], 6000);
    r = bingoLinesAt(r, 'p1', [0, 1], 8000);
    expect(rankPlayers(r).slice(0, 2).map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('with equal bingos and same finish time, breaks the tie by seq — a strict total order', () => {
    let r = running(24);
    r = bingoAt(r, 'p1', 7000);
    r = bingoAt(r, 'p2', 7000);
    const [a, b] = rankPlayers(r);
    expect(a!.completedLines.length).toBe(b!.completedLines.length);
    expect(a!.firstBingoAt).toBe(b!.firstBingoAt);
    expect(a!.id).toBe('p1'); // whoever the event loop processed first
  });

  it('ranks bingo holders above everyone else', () => {
    let r = running(12);
    r = fillLine(r, 'p5', LINES[0]!.cells);
    expect(rankPlayers(r)[0]!.id).toBe('p5');
    expect(rankPlayers(r).slice(1).every((p) => p.firstBingoAt === null)).toBe(true);
  });

  it('orders non-holders by best partial line then fill count', () => {
    let r = running(12);
    r = fillLine(r, 'p3', LINES[0]!.cells.slice(0, 7));
    r = fillLine(r, 'p4', LINES[0]!.cells.slice(0, 3));
    const ids = rankPlayers(r).map((p) => p.id);
    expect(ids.indexOf('p3')).toBeLessThan(ids.indexOf('p4'));
  });

  it('awards at most three medals, and none without a bingo', () => {
    let r = running(12);
    r = bingoAt(r, 'p1', 1000);
    const entries = rank(r);
    expect(entries.filter((e) => e.medal !== undefined)).toHaveLength(1);
    expect(entries[0]!.medal).toBe(1);
  });

  it('zero bingos: a full board, no medals', () => {
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
