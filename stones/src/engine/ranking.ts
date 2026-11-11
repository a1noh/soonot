import type { Room } from '../shared/types';
import { heldBy } from './apply';

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
 * then to setup order. Teams that sit out and won nothing are left out.
 */
export function rank(room: Room): Standing[] {
  const rows = room.teams
    .map((t, order) => {
      const stoneIds = heldBy(room, t.id);
      const lastWin = [...room.claims].reverse().find((c) => c.winners.includes(t.id));
      return {
        order,
        teamId: t.id,
        teamName: t.name,
        color: t.color,
        playing: t.playing,
        stoneIds,
        reachedAt: lastWin ? lastWin.at : null,
      };
    })
    .filter((row) => row.playing || row.stoneIds.length > 0);

  rows.sort(
    (a, b) =>
      b.stoneIds.length - a.stoneIds.length ||
      (a.reachedAt ?? 0) - (b.reachedAt ?? 0) ||
      a.order - b.order,
  );

  let prev: (typeof rows)[number] | null = null;
  let place = 0;
  return rows.map((row, i) => {
    // Equal count at the same moment (several winners of one stone) share a place.
    if (!prev || prev.stoneIds.length !== row.stoneIds.length || prev.reachedAt !== row.reachedAt) place = i + 1;
    prev = row;
    const { order: _order, ...rest } = row;
    return { rank: place, ...rest };
  });
}
