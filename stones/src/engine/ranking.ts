import type { Room } from '../shared/types';
import { heldBy } from './apply';

export interface Standing {
  rank: number;
  teamId: string;
  teamName: string;
  color: string;
  playing: boolean;
  stoneIds: string[];
}

/**
 * Most stones first. Teams level on stones share a place — unless a 동점
 * 결정전 (컵 멀리 놓기) decided that group, which then orders it. Ties are
 * never broken automatically. Display order inside a shared place is setup
 * order. Teams that sit out and won nothing are left out.
 */
export function rank(room: Room): Standing[] {
  const decided = new Map<string, number>(); // teamId → position in its 결정전
  const groupOf = new Map<string, number>(); // teamId → which 결정전
  room.tiebreaks.forEach((g, gi) =>
    g.forEach((id, pos) => {
      decided.set(id, pos);
      groupOf.set(id, gi);
    }),
  );

  const rows = room.teams
    .map((t, order) => ({
      order,
      teamId: t.id,
      teamName: t.name,
      color: t.color,
      playing: t.playing,
      stoneIds: heldBy(room, t.id),
    }))
    .filter((row) => row.playing || row.stoneIds.length > 0);

  const sameGroup = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    groupOf.has(a.teamId) && groupOf.get(a.teamId) === groupOf.get(b.teamId);

  rows.sort((a, b) => {
    const byCount = b.stoneIds.length - a.stoneIds.length;
    if (byCount !== 0) return byCount;
    if (sameGroup(a, b)) return decided.get(a.teamId)! - decided.get(b.teamId)!;
    return a.order - b.order;
  });

  let prev: (typeof rows)[number] | null = null;
  let place = 0;
  return rows.map((row, i) => {
    const shares = prev !== null && prev.stoneIds.length === row.stoneIds.length && !sameGroup(prev, row);
    if (!shares) place = i + 1;
    prev = row;
    const { order: _order, ...rest } = row;
    return { rank: place, ...rest };
  });
}

/** Teams that share a place, grouped, best place first. Each needs a 결정전. */
export function tiedGroups(room: Room): string[][] {
  const byPlace = new Map<number, string[]>();
  for (const s of rank(room)) byPlace.set(s.rank, [...(byPlace.get(s.rank) ?? []), s.teamId]);
  return [...byPlace.entries()]
    .filter(([, ids]) => ids.length > 1)
    .sort(([a], [b]) => a - b)
    .map(([, ids]) => ids);
}
