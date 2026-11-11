/**
 * Audience-scoped state. Everything in 스톤 is public — the projector shows the
 * whole game — so the viewer only changes the master's control affordances.
 */
import type { Viewer } from '@soonot/master';
import { heldBy } from './engine/apply';
import { rank, type Standing } from './engine/ranking';
import type { LastResult, Room, Stone } from './shared/types';

export interface StonesView {
  kind: 'board' | 'master';
  state: Room['state'];
  teams: { id: string; name: string; color: string; playing: boolean; stoneIds: string[] }[];
  stones: Stone[];
  turnTeamId: string | null;
  turnTeamName: string | null;
  round: number;
  pending: { teamId: string; teamName: string; stoneId: string } | null;
  lastResult: LastResult | null;
  revealStep: number;
  standings: Standing[];
  /** Master only: is the console waiting on a 성공/실패 call? */
  blocking?: boolean;
  canUndo?: boolean;
}

export function project(room: Room, viewer: Viewer): StonesView {
  const turn = room.teams.find((t) => t.id === room.turnTeamId) ?? null;
  const view: StonesView = {
    kind: viewer.kind === 'master' ? 'master' : 'board',
    state: room.state,
    teams: room.teams.map((t) => ({ ...t, stoneIds: heldBy(room, t.id) })),
    stones: room.stones,
    turnTeamId: turn?.id ?? null,
    turnTeamName: turn?.name ?? null,
    round: room.round,
    pending: room.pending
      ? {
          ...room.pending,
          teamName: room.teams.find((t) => t.id === room.pending!.teamId)?.name ?? '',
        }
      : null,
    lastResult: room.lastResult,
    revealStep: room.revealStep,
    standings: rank(room),
  };
  if (viewer.kind === 'master') {
    view.blocking = room.state === 'RUNNING' && room.pending !== null;
    view.canUndo = room.history.length > 0;
  }
  return view;
}
