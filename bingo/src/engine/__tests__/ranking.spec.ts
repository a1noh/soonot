import { describe, it, expect } from 'vitest';
import { LINES } from '../../shared/lines';
import { rank, rankPlayers } from '../ranking';
import { running, fillLine, step } from './helpers';

/** Give `who` a bingo, every fill stamped at exactly `at`. */
function bingoAt(room: ReturnType<typeof running>, who: string, at: number) {
  let r = room;
  const others = [...r.players.keys()].filter((id) => id !== who);
  LINES[0]!.cells.forEach((cell, i) => {
    r = step(r, { t: 'FILL', playerId: who, cellIndex: cell, query: String(r.players.get(others[i]!)!.number) }, at);
  });
  return r;
}

describe('ranking (req §9)', () => {
  it('orders bingo holders by firstBingoAt, not by join order', () => {
    let r = running(24);
    // p2 finishes first, p1 later — the ranking must follow the clock, not the id
    r = bingoAt(r, 'p2', 4000);
    r = bingoAt(r, 'p1', 5000);
    expect(rankPlayers(r).slice(0, 2).map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('breaks a same-millisecond tie by seq — a strict total order', () => {
    let r = running(24);
    r = bingoAt(r, 'p1', 7000);
    r = bingoAt(r, 'p2', 7000);
    const [a, b] = rankPlayers(r);
    expect(a!.firstBingoAt).toBe(b!.firstBingoAt);
    expect(a!.firstBingoSeq).toBeLessThan(b!.firstBingoSeq!);
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
