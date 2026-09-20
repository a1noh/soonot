/**
 * Ranking. bingo/req.md §9.
 *
 * A pure function of Room, called on END — never incrementally, never on the
 * hot path. The dashboard's live counters are separate and cheaper.
 */
import type { RankEntry } from '@soonot/master';
import type { Player, Room } from '../shared/types';
import { bestLineProgress, filledCount } from './bingo';

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Bingo holders first, by firstBingoAt then the seq total order; then
 * everyone else by progress. req §9.
 */
export function rankPlayers(room: Room): Player[] {
  const all = [...room.players.values()];
  const withBingo = all.filter((p) => p.firstBingoAt !== null);
  const without = all.filter((p) => p.firstBingoAt === null);

  withBingo.sort(
    (a, b) =>
      a.firstBingoAt! - b.firstBingoAt! ||
      // seq is what makes this a total order: Date.now() repeats, and with
      // 100 players racing to a 9-cell line a same-ms tie is realistic.
      a.firstBingoSeq! - b.firstBingoSeq! ||
      b.completedLines.length - a.completedLines.length ||
      filledCount(b) - filledCount(a) ||
      a.joinedAt - b.joinedAt,
  );

  without.sort(
    (a, b) =>
      bestLineProgress(b) - bestLineProgress(a) ||
      filledCount(b) - filledCount(a) ||
      a.joinedAt - b.joinedAt,
  );

  return [...withBingo, ...without];
}

/** The shared podium's shape. master/spec.md §3.4. */
export function rank(room: Room, selfId?: string): RankEntry[] {
  const started = room.startedAt ?? 0;
  return rankPlayers(room).map((p, i) => {
    const entry: RankEntry = {
      id: p.id,
      label: `${p.nickname} #${String(p.number).padStart(3, '0')}`,
      detail:
        p.firstBingoAt !== null
          ? `${mmss(p.firstBingoAt - started)} · ${p.completedLines.length}줄`
          : `${filledCount(p)}칸 · 최고 ${bestLineProgress(p)}/9`,
    };
    if (i < 3 && p.firstBingoAt !== null) entry.medal = (i + 1) as 1 | 2 | 3;
    if (selfId !== undefined && p.id === selfId) entry.self = true;
    return entry;
  });
}
