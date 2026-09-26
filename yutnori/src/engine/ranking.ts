import { advancementOf } from '../shared/board';
import type { Room, Team } from '../shared/types';

export interface Standing {
  rank: number;
  teamId: string;
  teamName: string;
  malHome: number;
  totalProgress: number;
  finishedAt: number | null;
}

// 완주(lap) count — with respawn no 말 sits at 집, so "집 N개" means N laps completed.
const malHome = (t: Team) => t.finishes;
// Distance along the board (0..20), shortcut-aware, so ranking reflects true progress.
const totalProgress = (t: Team) => t.mal.reduce((s, m) => s + advancementOf(m.progress), 0);

/**
 * req §11 — ranked on the state at the moment the game ended.
 *
 * 말 respawn on 완주 (endless laps), so a team never permanently "finishes"; the key is
 * total laps: 완주 수(=`finishes`, exposed as `malHome`) desc → total on-board progress
 * desc → `lastProgressAt` asc → creation order.
 */
export function rank(room: Room): Standing[] {
  const order = new Map(room.teams.map((t, i) => [t.id, i]));

  const sorted = [...room.teams].sort((a, b) => {
    const homeDiff = malHome(b) - malHome(a); // 완주(laps) desc
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
