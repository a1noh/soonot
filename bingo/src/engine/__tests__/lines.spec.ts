import { describe, it, expect } from 'vitest';
import { LINES, linesThrough, rowColOf } from '../../shared/lines';
import { CELLS, GRID, LINE_COUNT } from '../../shared/constants';

describe('lines', () => {
  it('has exactly 20 lines of 9 cells', () => {
    expect(LINES).toHaveLength(LINE_COUNT);
    expect(LINES).toHaveLength(20);
    for (const l of LINES) expect(l.cells).toHaveLength(GRID);
  });

  it('line ids are unique', () => {
    expect(new Set(LINES.map((l) => l.id)).size).toBe(LINE_COUNT);
  });

  it('every cell is on 2, 3 or 4 lines — 4 only at the centre', () => {
    for (let i = 0; i < CELLS; i++) {
      const n = linesThrough(i).length;
      const { row, col } = rowColOf(i);
      const onMain = row === col;
      const onAnti = row + col === GRID - 1;
      expect(n).toBe(2 + (onMain ? 1 : 0) + (onAnti ? 1 : 0));
    }
    expect(linesThrough(40)).toHaveLength(4); // centre of a 9x9
  });

  it('linesThrough agrees with LINES membership', () => {
    for (let i = 0; i < CELLS; i++) {
      const expected = LINES.filter((l) => l.cells.includes(i)).map((l) => l.id).sort();
      expect(linesThrough(i).map((l) => l.id).sort()).toEqual(expected);
    }
  });

  it('diagonals only at r===c and r+c===8', () => {
    const main = LINES.find((l) => l.id === 'diag:main')!;
    const anti = LINES.find((l) => l.id === 'diag:anti')!;
    expect(main.cells).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80]);
    expect(anti.cells).toEqual([8, 16, 24, 32, 40, 48, 56, 64, 72]);
  });

  it('rejects an out-of-range index', () => {
    expect(() => linesThrough(81)).toThrow(RangeError);
    expect(() => linesThrough(-1)).toThrow(RangeError);
  });
});
