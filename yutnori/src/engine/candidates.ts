import { advance, isOnBoard } from '../shared/board';
import { HOME, ROLL_STEPS } from '../shared/constants';
import type { MoveCandidate, Roll, Room } from '../shared/types';

/**
 * req §8.1 — the single source of truth for legality. Used by the engine to validate a
 * MOVE, by the master screen to render the 말 picker, and by the board to highlight
 * destinations (req §12). Never reimplemented on the client.
 *
 * Because of overshoot-goes-home (req §6) this returns a non-empty array whenever the
 * team has an unfinished 말 — the "no legal move" branch does not exist (req §9).
 */
export function candidates(room: Room, teamId: string, roll: Roll): MoveCandidate[] {
  const team = room.teams.find((t) => t.id === teamId);
  if (!team) return [];
  const steps = ROLL_STEPS[roll];

  return team.mal
    .filter((m) => m.progress < HOME)
    .map((m) => {
      const to = advance(m.progress, steps);
      // 대기 (0) and 집 (20) are uncatchable, so captures only exist on a real station.
      const captures = isOnBoard(to)
        ? room.teams
            .filter((t) => t.id !== teamId)
            .flatMap((t) => t.mal.filter((x) => x.progress === to).map((x) => x.id))
        : [];
      return { malId: m.id, from: m.progress, to, captures, finishes: to === HOME };
    });
}
