/** bingo/req.md §1, §8, §18 — 5×5 (a 9×9 was too slow to fill at a gathering). */
export const GRID = 5;
export const CELLS = GRID * GRID; // 25
/** GRID rows + GRID columns + 2 diagonals. req §8. */
export const LINE_COUNT = 2 * GRID + 2; // 12
/** req §18 — hard cap; far above the 300 design target. */
export const MAX_PLAYERS = 999;
/** A line needs GRID distinct people, so fewer than this makes bingo impossible. */
export const MIN_PLAYERS_FOR_BINGO = GRID;
