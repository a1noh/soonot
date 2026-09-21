/**
 * Ranking. bingo/req.md §9.
 *
 * A pure function of Room, called on END — never incrementally, never on the
 * hot path. The dashboard's live counters are separate and cheaper.
 */
import type { RankEntry } from '@soonot/master';
import type { Player, Room } from '../shared/types';
import { bestLineProgress, filledCount } from './bingo';
import { GRID } from '../shared/constants';

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * When each player reached their *current* line count — i.e. the timestamp/seq of
 * their LAST completed line. This is the "finish time" the ranking breaks ties on:
 * of two players with the same number of bingos, whoever got there first wins.
 * Derived from the room's bingo log so no extra per-player field is needed.
 */
function lastBingo(room: Room): Map<string, { at: number; seq: number }> {
  const m = new Map<string, { at: number; seq: number }>();
  for (const ev of room.bingoEvents) {
    const cur = m.get(ev.playerId);
    if (!cur || ev.seq > cur.seq) m.set(ev.playerId, { at: ev.at, seq: ev.seq });
  }
  return m;
}

/**
 * Bingo holders first, ranked by **most bingos (completed lines)**, then by
 * **finish time** (who reached that count first); then everyone else by
 * progress. req §9.
 */
export function rankPlayers(room: Room): Player[] {
  const all = [...room.players.values()];
  const withBingo = all.filter((p) => p.firstBingoAt !== null);
  const without = all.filter((p) => p.firstBingoAt === null);
  const finish = lastBingo(room);
  // A holder always has a last-bingo entry; the fallback keeps the comparator total.
  const fin = (p: Player) => finish.get(p.id) ?? { at: p.firstBingoAt ?? 0, seq: p.firstBingoSeq ?? 0 };

  withBingo.sort((a, b) => {
    const fa = fin(a);
    const fb = fin(b);
    return (
      b.completedLines.length - a.completedLines.length || // most bingos wins
      fa.at - fb.at || // then earliest to reach that count
      // seq is what makes this a total order: Date.now() repeats, and with many
      // players racing to a line a same-ms tie is realistic.
      fa.seq - fb.seq ||
      filledCount(b) - filledCount(a) ||
      a.joinedAt - b.joinedAt
    );
  });

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
  const finish = lastBingo(room);
  return rankPlayers(room).map((p, i) => {
    // Lead with the number of bingos (the primary ranking key), then finish time.
    const finAt = finish.get(p.id)?.at ?? p.firstBingoAt ?? started;
    const entry: RankEntry = {
      id: p.id,
      label: `${p.nickname} #${String(p.number).padStart(3, '0')}`,
      detail:
        p.firstBingoAt !== null
          ? `${p.completedLines.length}줄 · ${mmss(finAt - started)}`
          : `${filledCount(p)}칸 · 최고 ${bestLineProgress(p)}/${GRID}`,
    };
    if (i < 3 && p.firstBingoAt !== null) entry.medal = (i + 1) as 1 | 2 | 3;
    if (selfId !== undefined && p.id === selfId) entry.self = true;
    return entry;
  });
}
