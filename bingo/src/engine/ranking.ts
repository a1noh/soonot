/**
 * Ranking. bingo/req.md §9.
 *
 * A pure function of Room, called on END — never incrementally, never on the
 * hot path. The dashboard's live counters are separate and cheaper.
 */
import type { RankEntry } from '@soonot/master';
import type { Player, Room } from '../shared/types';
import { lastFillAt, pointsOf } from './bingo';

/**
 * THE ranking order (req §9), used everywhere so the live ladder, the reveal
 * podium and the winner list always agree:
 *   1) points desc  — `칸수 + 5×줄` (a bingo line is worth more, but total points win)
 *   2) reached-it-first — earlier `lastFillAt` wins the tie (먼저 달성한 사람 우선)
 *   3) joinedAt asc, then number asc — a deterministic final tiebreak
 * `number` is unique per event, so this is a strict total order (no arbitrary
 * seq-of-processing tiebreak, and no shared ranks).
 */
export function compareForRank(a: Player, b: Player): number {
  return (
    pointsOf(b) - pointsOf(a) ||
    lastFillAt(a) - lastFillAt(b) ||
    a.joinedAt - b.joinedAt ||
    a.number - b.number
  );
}

/** All players in ranking order. */
export function rankPlayers(room: Room): Player[] {
  return [...room.players.values()].sort(compareForRank);
}

/** The shared podium's shape. master/spec.md §3.4. */
export function rank(room: Room, selfId?: string): RankEntry[] {
  return rankPlayers(room).map((p, i) => {
    const points = pointsOf(p);
    const entry: RankEntry = {
      id: p.id,
      label: `${p.nickname} #${String(p.number).padStart(3, '0')}`,
      // Lead with points (the ranking key), so the number shown matches the order.
      detail: `${points}점 · ${p.completedLines.length}줄`,
    };
    // Medals follow the points order; a player with no score gets none.
    if (i < 3 && points > 0) entry.medal = (i + 1) as 1 | 2 | 3;
    if (selfId !== undefined && p.id === selfId) entry.self = true;
    return entry;
  });
}
