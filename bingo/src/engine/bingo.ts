/**
 * Incremental line detection. bingo/req.md §8; spec §4.5.
 */
import type { Player } from '../shared/types';
import { linesThrough, type Line, type LineId } from '../shared/lines';
import { LINE_BONUS } from '../shared/constants';

/** Is every cell of this line filled on this card? */
function complete(line: Line, fills: readonly (string | null)[]): boolean {
  for (const c of line.cells) if (fills[c] === null) return false;
  return true;
}

/**
 * Lines newly completed by filling `cellIndex`, excluding ones already held.
 * Only the ≤4 lines through that cell can have changed.
 */
export function newlyCompleted(
  player: Player,
  cellIndex: number,
): LineId[] {
  const held = new Set(player.completedLines);
  const out: LineId[] = [];
  for (const line of linesThrough(cellIndex)) {
    if (!held.has(line.id) && complete(line, player.fills)) out.push(line.id);
  }
  return out;
}

/** Filled cells in the player's best line — drives the progress hint (req §12). */
export function bestLineProgress(player: Player): number {
  let best = 0;
  for (let i = 0; i < player.fills.length; i++) {
    if (player.fills[i] === null) continue;
    for (const line of linesThrough(i)) {
      let n = 0;
      for (const c of line.cells) if (player.fills[c] !== null) n++;
      if (n > best) best = n;
    }
  }
  return best;
}

export function filledCount(player: Player): number {
  let n = 0;
  for (const f of player.fills) if (f !== null) n++;
  return n;
}

/** Score: 1 per filled cell + a bonus per completed line. THE ranking key (req §9). */
export function pointsOf(player: Player): number {
  return filledCount(player) + LINE_BONUS * player.completedLines.length;
}

/**
 * When the player reached their *current* score — the timestamp of their most
 * recent fill (every fill adds ≥1 point). Ties on points break by this: whoever
 * reached the score first ranks higher (먼저 달성한 사람 우선). `Infinity` if they
 * have filled nothing, so score-0 players sort after anyone who actually scored.
 */
export function lastFillAt(player: Player): number {
  let last = -1;
  for (const t of player.filledAt) if (t !== null && t > last) last = t;
  return last === -1 ? Infinity : last;
}
