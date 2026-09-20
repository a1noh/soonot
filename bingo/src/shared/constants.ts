/** bingo/req.md §1, §8, §18. */
export const GRID = 9;
export const CELLS = GRID * GRID; // 81
/** 9 rows + 9 columns + 2 diagonals. req §8. */
export const LINE_COUNT = 2 * GRID + 2; // 20
/** req §18 — hard cap; far above the 300 design target. */
export const MAX_PLAYERS = 999;
/** A line needs GRID distinct people, so fewer than this makes bingo impossible. */
export const MIN_PLAYERS_FOR_BINGO = GRID;
