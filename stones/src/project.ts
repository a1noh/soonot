/**
 * Audience-scoped state.
 *
 * The one secret is the game order. The room believes the stone they tap
 * decides the game, so the projector only ever learns a game once it has been
 * opened. The full order and the next game go to the master alone.
 */
import type { Viewer } from '@soonot/master';
import { heldBy, nextGame, picksLeft } from './engine/apply';
import { rank, tiedGroups, type Standing } from './engine/ranking';
import type { Game, LastResult, Room, Stone } from './shared/types';

export interface StonesView {
  kind: 'board' | 'master';
  state: Room['state'];
  teams: { id: string; name: string; color: string; playing: boolean; stoneIds: string[] }[];
  stones: (Stone & {
    /** Played for already. `winners` may be empty (nobody won it). */
    claimed: { winners: string[]; gameName: string } | null;
  })[];
  turnTeamId: string | null;
  turnTeamName: string | null;
  round: number;
  /** Stones played for so far, out of how many there will be. */
  played: number;
  total: number;
  pending: { chooserId: string; chooserName: string; stoneId: string; game: Game; number: number } | null;
  lastResult: LastResult | null;
  revealStep: number;
  standings: Standing[];
  /** The 동점 결정전 being played right now (after 게임 종료). */
  activeTiebreak: { teams: { id: string; name: string; color: string }[]; game: Game } | null;
  /** Master only: the 결정전 game, and every group still tied. */
  tiebreak?: Game;
  tiedGroups?: string[][];
  canUndoTiebreak?: boolean;
  /** Master only. */
  games?: Game[];
  nextGame?: Game | null;
  blocking?: boolean;
  canUndo?: boolean;
}

export function project(room: Room, viewer: Viewer): StonesView {
  const turn = room.teams.find((t) => t.id === room.turnTeamId) ?? null;
  const gameById = new Map(room.games.map((g) => [g.id, g]));
  const pendingGame = room.pending ? gameById.get(room.pending.gameId) ?? null : null;

  const view: StonesView = {
    kind: viewer.kind === 'master' ? 'master' : 'board',
    state: room.state,
    teams: room.teams.map((t) => ({ ...t, stoneIds: heldBy(room, t.id) })),
    stones: room.stones.map((s) => {
      const c = room.claims.find((x) => x.stoneId === s.id);
      return { ...s, claimed: c ? { winners: c.winners, gameName: gameById.get(c.gameId)?.name ?? '' } : null };
    }),
    turnTeamId: turn?.id ?? null,
    turnTeamName: turn?.name ?? null,
    round: room.round,
    played: room.claims.length,
    total: Math.min(room.stones.length, room.games.length),
    pending:
      room.pending && pendingGame
        ? {
            chooserId: room.pending.chooserId,
            chooserName: room.teams.find((t) => t.id === room.pending!.chooserId)?.name ?? '',
            stoneId: room.pending.stoneId,
            game: pendingGame,
            number: room.claims.length + 1,
          }
        : null,
    lastResult: room.lastResult,
    revealStep: room.revealStep,
    standings: rank(room),
    activeTiebreak: room.activeTiebreak
      ? {
          teams: room.activeTiebreak.map((id) => {
            const t = room.teams.find((x) => x.id === id)!;
            return { id: t.id, name: t.name, color: t.color };
          }),
          game: room.tiebreak,
        }
      : null,
  };
  if (viewer.kind === 'master') {
    view.games = room.games;
    view.nextGame = room.state === 'RUNNING' && picksLeft(room) > 0 ? nextGame(room) : null;
    view.blocking = room.state === 'RUNNING' && room.pending !== null;
    view.canUndo = room.history.length > 0;
    view.tiebreak = room.tiebreak;
    view.tiedGroups = room.state === 'ENDED' ? tiedGroups(room) : [];
    view.canUndoTiebreak = room.state === 'ENDED' && room.activeTiebreak === null && room.tiebreaks.length > 0;
  }
  return view;
}
