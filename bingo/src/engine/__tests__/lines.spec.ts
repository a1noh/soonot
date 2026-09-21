import { describe, it, expect } from 'vitest';
import { LINES, linesThrough, rowColOf } from '../../shared/lines';
import { CELLS, GRID, LINE_COUNT } from '../../shared/constants';

describe('lines', () => {
  it('has exactly LINE_COUNT lines of GRID cells', () => {
    expect(LINES).toHaveLength(LINE_COUNT);
    expect(LINES).toHaveLength(2 * GRID + 2);
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
    const centre = Math.floor(GRID / 2) * GRID + Math.floor(GRID / 2);
    expect(linesThrough(centre)).toHaveLength(4); // centre sits on both diagonals
  });

  it('linesThrough agrees with LINES membership', () => {
    for (let i = 0; i < CELLS; i++) {
      const expected = LINES.filter((l) => l.cells.includes(i)).map((l) => l.id).sort();
      expect(linesThrough(i).map((l) => l.id).sort()).toEqual(expected);
    }
  });

  it('diagonals only at r===c and r+c===GRID-1', () => {
    const main = LINES.find((l) => l.id === 'diag:main')!;
    const anti = LINES.find((l) => l.id === 'diag:anti')!;
    expect(main.cells).toEqual(Array.from({ length: GRID }, (_, i) => i * GRID + i));
    expect(anti.cells).toEqual(Array.from({ length: GRID }, (_, i) => i * GRID + (GRID - 1 - i)));
  });

  it('rejects an out-of-range index', () => {
    expect(() => linesThrough(CELLS)).toThrow(RangeError);
    expect(() => linesThrough(-1)).toThrow(RangeError);
  });
});
