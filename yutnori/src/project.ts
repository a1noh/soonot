/**
 * Audience-scoped state (master spec §3.3).
 *
 * 윷놀이's board is public by design (req §12): real sticks are thrown on a
 * stage in front of everyone, so there is nothing to hide and `project` ignores
 * the viewer for everything except the master's control affordances.
 */
import type { Viewer } from '@soonot/master';
import type { MoveCandidate, Room, Roll } from './shared/types';
import { remainingMs } from './engine/apply';
import { rank } from './engine/ranking';

export interface BoardView {
  kind: 'board' | 'master';
  state: Room['state'];
  teams: {
    id: string;
    name: string;
    roster: string | null;
    color: string;
    mal: { id: string; progress: number }[];
    finishedAt: number | null;
  }[];
  turnTeamId: string | null;
  turnTeamName: string | null;
  throwQueue: number;
  pending: { teamId: string; roll: Roll; candidates: MoveCandidate[] } | null;
  remainingMs: number;
  paused: boolean;
  revealStep: number;
  endReason: Room['endReason'];
  standings: ReturnType<typeof rank>;
  /** Master only: is the console waiting on this game? (req §5.4) */
  blocking?: boolean;
  canUndo?: boolean;
}

export function project(room: Room, viewer: Viewer, now = Date.now()): BoardView {
  const turn = room.teams[room.turnIndex] ?? null;

  const base: BoardView = {
    kind: viewer.kind === 'master' ? 'master' : 'board',
    state: room.state,
    teams: room.teams.map((t) => ({
      id: t.id,
      name: t.name,
      roster: t.roster,
      color: t.color,
      mal: t.mal.map((m) => ({ id: m.id, progress: m.progress })),
      finishedAt: t.finishedAt,
    })),
    turnTeamId: turn?.id ?? null,
    turnTeamName: turn?.name ?? null,
    throwQueue: room.throwQueue,
    pending: room.pendingThrow
      ? {
          teamId: room.pendingThrow.teamId,
          roll: room.pendingThrow.roll,
          candidates: room.pendingThrow.candidates,
        }
      : null,
    remainingMs: remainingMs(room, now),
    paused: room.pausedAt !== null,
    revealStep: room.revealStep,
    endReason: room.endReason,
    standings: rank(room),
  };

  if (viewer.kind === 'master') {
    // The console's blocking badge is derived from `project`, so the host needs
    // no extra concept for it (master spec §9).
    base.blocking = room.state === 'RUNNING' && room.pendingThrow !== null;
    base.canUndo = room.history.length > 0;
  }
  return base;
}
