import { destinations, isOnBoard } from '../shared/board';
import { HOME, ROLL_STEPS } from '../shared/constants';
import type { MoveCandidate, Roll, Room } from '../shared/types';

/**
 * req §8.1 — the single source of truth for legality. Used by the engine to validate a
 * MOVE, by the master screen to render the 말 picker, and by the board to highlight
 * destinations (req §12). Never reimplemented on the client.
 *
 * A 말 resting on a branch 밭 (모/뒷모/방) yields TWO candidates — the diagonal and the
 * straight path — so `MoveCandidate` is chosen by (malId, to), not malId alone. Overshoot
 * goes home (req §6), so an unfinished 말 always has at least one candidate (req §9).
 */
export function candidates(room: Room, teamId: string, roll: Roll): MoveCandidate[] {
  const team = room.teams.find((t) => t.id === teamId);
  if (!team) return [];
  const steps = ROLL_STEPS[roll];

  return team.mal
    .filter((m) => m.progress !== HOME)
    .flatMap((m) =>
      destinations(m.progress, steps).map((to) => {
        const captures = isOnBoard(to)
          ? room.teams
              .filter((t) => t.id !== teamId)
              .flatMap((t) => t.mal.filter((x) => x.progress === to).map((x) => x.id))
          : [];
        return { malId: m.id, from: m.progress, to, captures, finishes: to === HOME };
      }),
    );
}
