/** bingo/req.md §1, §8, §18 — 5×5 (a 9×9 was too slow to fill at a gathering). */
export const GRID = 5;
export const CELLS = GRID * GRID; // 25
/** GRID rows + GRID columns + 2 diagonals. req §8. */
export const LINE_COUNT = 2 * GRID + 2; // 12
/** req §18 — hard cap; far above the 300 design target. */
export const MAX_PLAYERS = 999;
/**
 * Fewest players for a bingo LINE to be possible at all. A line is GRID cells,
 * each named with a DISTINCT OTHER person (you cannot name yourself — see
 * `commitFill`'s SELF/REUSED guards), so completing one needs GRID others **plus**
 * yourself: GRID + 1. With only GRID players everyone caps at GRID − 1 filled
 * cells and no line can ever complete (the game still runs on filled-cell points,
 * but nobody can "빙고"). Below this the console warns; it never blocks (latecomers
 * may still arrive, and points-only play is valid).
 */
export const MIN_PLAYERS_FOR_BINGO = GRID + 1;
