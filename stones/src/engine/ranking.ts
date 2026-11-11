import type { Room } from '../shared/types';

export interface Standing {
  rank: number;
  teamId: string;
  teamName: string;
  color: string;
  playing: boolean;
  stoneIds: string[];
  /** When the team reached its current count. Earlier wins a tie. */
  reachedAt: number | null;
}

/**
 * Most stones first. A tie goes to the team that reached that count first,
 * then to setup order. Teams that never played are left out.
 */
export function rank(room: Room): Standing[] {
  const played = new Set(room.history.map((h) => h.teamId));
  const rows = room.teams
    .map((t, order) => {
      const wins = room.wins.filter((w) => w.teamId === t.id);
      return {
        order,
        teamId: t.id,
        teamName: t.name,
        color: t.color,
        playing: t.playing,
        stoneIds: wins.map((w) => w.stoneId),
        reachedAt: wins.length > 0 ? wins[wins.length - 1]!.at : null,
      };
    })
    .filter((row) => row.playing || played.has(row.teamId) || row.stoneIds.length > 0);

  rows.sort(
    (a, b) =>
      b.stoneIds.length - a.stoneIds.length ||
      (a.reachedAt ?? 0) - (b.reachedAt ?? 0) ||
      a.order - b.order,
  );

  let prev: (typeof rows)[number] | null = null;
  let place = 0;
  return rows.map((row, i) => {
    // Equal count and equal time share a place; anything else takes its position.
    if (!prev || prev.stoneIds.length !== row.stoneIds.length || prev.reachedAt !== row.reachedAt) place = i + 1;
    prev = row;
    const { order: _order, ...rest } = row;
    return { rank: place, ...rest };
  });
}
