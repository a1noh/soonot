import { HOME } from '../shared/constants';
import type { Room, Team } from '../shared/types';

export interface Standing {
  rank: number;
  teamId: string;
  teamName: string;
  malHome: number;
  totalProgress: number;
  finishedAt: number | null;
}

const malHome = (t: Team) => t.mal.filter((m) => m.progress >= HOME).length;
const totalProgress = (t: Team) => t.mal.reduce((s, m) => s + m.progress, 0);

/**
 * req §11 — ranked on the state at the moment the game ended.
 *
 * Tier 1: teams with every 말 home, by `finishedAt` ascending.
 * Tier 2: 말 home desc → total progress desc → `lastProgressAt` asc → creation order.
 *
 * Criterion 1 of tier 2 is deliberately not redundant with criterion 2: one 말 all the
 * way home beats the same distance spread across two 말 (req §11).
 */
export function rank(room: Room): Standing[] {
  const order = new Map(room.teams.map((t, i) => [t.id, i]));

  const sorted = [...room.teams].sort((a, b) => {
    const af = a.finishedAt !== null;
    const bf = b.finishedAt !== null;
    if (af !== bf) return af ? -1 : 1;
    if (af && bf) return a.finishedAt! - b.finishedAt!;

    const homeDiff = malHome(b) - malHome(a);
    if (homeDiff !== 0) return homeDiff;

    const progressDiff = totalProgress(b) - totalProgress(a);
    if (progressDiff !== 0) return progressDiff;

    const timeDiff = a.lastProgressAt - b.lastProgressAt;
    if (timeDiff !== 0) return timeDiff;

    return order.get(a.id)! - order.get(b.id)!;
  });

  return sorted.map((t, i) => ({
    rank: i + 1,
    teamId: t.id,
    teamName: t.name,
    malHome: malHome(t),
    totalProgress: totalProgress(t),
    finishedAt: t.finishedAt,
  }));
}
