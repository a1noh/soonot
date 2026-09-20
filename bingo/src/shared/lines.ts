/**
 * The 20 lines of a 9×9 board, and the ≤4 that pass through any one cell.
 * bingo/req.md §8.
 *
 * Built once at module load and shared with the client, which uses the same
 * table to highlight the closest-to-complete line (req §12). The rule is
 * computed in one place.
 */
import { GRID, CELLS, LINE_COUNT } from './constants';

export type LineId = string; // 'row:3' | 'col:7' | 'diag:main' | 'diag:anti'

export interface Line {
  readonly id: LineId;
  /** The 9 cell indices, in order. */
  readonly cells: readonly number[];
}

function build(): Line[] {
  const lines: Line[] = [];
  for (let r = 0; r < GRID; r++) {
    lines.push({
      id: `row:${r}`,
      cells: Array.from({ length: GRID }, (_, c) => r * GRID + c),
    });
  }
  for (let c = 0; c < GRID; c++) {
    lines.push({
      id: `col:${c}`,
      cells: Array.from({ length: GRID }, (_, r) => r * GRID + c),
    });
  }
  lines.push({
    id: 'diag:main',
    cells: Array.from({ length: GRID }, (_, i) => i * GRID + i),
  });
  lines.push({
    id: 'diag:anti',
    cells: Array.from({ length: GRID }, (_, i) => i * GRID + (GRID - 1 - i)),
  });
  return lines;
}

export const LINES: readonly Line[] = build();

const BY_ID = new Map(LINES.map((l) => [l.id, l]));

/** Precomputed: cell index → the lines through it. Always 2, 3, or 4 entries. */
const THROUGH: readonly (readonly Line[])[] = Array.from(
  { length: CELLS },
  (_, i) => {
    const r = Math.floor(i / GRID);
    const c = i % GRID;
    const out = [BY_ID.get(`row:${r}`)!, BY_ID.get(`col:${c}`)!];
    if (r === c) out.push(BY_ID.get('diag:main')!);
    if (r + c === GRID - 1) out.push(BY_ID.get('diag:anti')!);
    return out;
  },
);

/**
 * Only these lines can have changed when cell `i` was filled. req §8 —
 * ~36 array reads per fill instead of a 20-line full-board scan.
 */
export function linesThrough(i: number): readonly Line[] {
  const t = THROUGH[i];
  if (!t) throw new RangeError(`cell index out of range: ${i}`);
  return t;
}

export function lineById(id: LineId): Line | undefined {
  return BY_ID.get(id);
}

export function rowColOf(i: number): { row: number; col: number } {
  return { row: Math.floor(i / GRID), col: i % GRID };
}

export { LINE_COUNT };
