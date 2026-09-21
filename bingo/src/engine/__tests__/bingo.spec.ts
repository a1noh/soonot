import { describe, it, expect } from 'vitest';
import { LINES } from '../../shared/lines';
import { GRID } from '../../shared/constants';
import { running, step, fillLine, emitsOf } from './helpers';

describe('win detection (req §8)', () => {
  it('every line can be completed and announced', () => {
    for (const line of LINES) {
      let r = running(10);
      r = fillLine(r, 'p1', line.cells);
      const p = r.players.get('p1')!;
      expect(p.completedLines).toContain(line.id);
      expect(p.firstBingoAt).not.toBeNull();
    }
  });

  it('GRID-1 of GRID cells is not a bingo', () => {
    const line = LINES[0]!;
    let r = running(10);
    r = fillLine(r, 'p1', line.cells.slice(0, GRID - 1));
    expect(r.players.get('p1')!.completedLines).toHaveLength(0);
    expect(r.players.get('p1')!.firstBingoAt).toBeNull();
  });

  it('announces to the ROOM, while the fill result stays unicast', () => {
    const line = LINES[0]!;
    let r = running(10);
    r = fillLine(r, 'p1', line.cells.slice(0, GRID - 1));
    const emits = emitsOf(r, { t: 'FILL', playerId: 'p1', cellIndex: line.cells[GRID - 1]!, query: '10' });
    expect(emits.map((e) => [e.to, e.ev])).toEqual([
      ['player', 'cell:result'],
      ['room', 'bingo:announced'],
    ]);
  });

  it('firstBingoAt is set once and never moves', () => {
    let r = running(20);
    r = fillLine(r, 'p1', LINES[0]!.cells);
    const first = r.players.get('p1')!.firstBingoAt;
    // a second line, later
    r = fillLine(r, 'p1', LINES[9]!.cells.filter((c) => r.players.get('p1')!.fills[c] === null));
    const p = r.players.get('p1')!;
    expect(p.completedLines.length).toBeGreaterThanOrEqual(2);
    expect(p.firstBingoAt).toBe(first);
  });

  it('a bingo survives clearing one of its cells (req §7.3)', () => {
    let r = running(10);
    r = fillLine(r, 'p1', LINES[0]!.cells);
    const at = r.players.get('p1')!.firstBingoAt;
    r = step(r, { t: 'CLEAR', playerId: 'p1', cellIndex: LINES[0]!.cells[0]! });
    const p = r.players.get('p1')!;
    expect(p.completedLines).toEqual(['row:0']);
    expect(p.firstBingoAt).toBe(at);
  });

  it('completing the centre can close several lines at once', () => {
    let r = running(40);
    const main = LINES.find((l) => l.id === 'diag:main')!;
    const anti = LINES.find((l) => l.id === 'diag:anti')!;
    const centre = Math.floor(GRID / 2) * GRID + Math.floor(GRID / 2);
    const cells = [...new Set([...main.cells, ...anti.cells])].filter((c) => c !== centre);
    r = fillLine(r, 'p1', cells);
    expect(r.players.get('p1')!.completedLines).toHaveLength(0);
    const emits = emitsOf(r, { t: 'FILL', playerId: 'p1', cellIndex: centre, query: '40' });
    const announced = emits.filter((e) => e.ev === 'bingo:announced');
    expect(announced).toHaveLength(2);
  });
});
