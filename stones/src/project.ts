/**
 * Audience-scoped state.
 *
 * The one secret is the game order. The room believes the stone they tap
 * decides the game, so the projector only ever learns a game once it has been
 * opened. The full order and the next game go to the master alone.
 */
import type { Viewer } from '@soonot/master';
import { chooserName, heldBy, nextGame, picksLeft } from './engine/apply';
import { rank, tiedGroups, type Standing } from './engine/ranking';
import type { Game, LastResult, Prizes, Room, Stone } from './shared/types';
import { SECRET_STONE } from './shared/constants';

export interface StonesView {
  kind: 'board' | 'master';
  state: Room['state'];
  /** The projector's heading (어벤추수 땡스게임). */
  title: string;
  teams: { id: string; name: string; color: string; playing: boolean; stoneIds: string[] }[];
  stones: (Stone & {
    /** Played for already. `winners` may be empty (nobody won it). */
    claimed: { winners: string[]; gameName: string } | null;
  })[];
  /** The choosing team, or null when a guest (the 빙고 1등) chooses. */
  turnTeamId: string | null;
  /** Who chooses, as shown: a team name or the guest as written. */
  turnTeamName: string | null;
  /** True when the chooser is a guest rather than a team. */
  turnIsGuest: boolean;
  round: number;
  /** Only one stone is left: there is nothing to choose between. */
  lastStone: boolean;
  /** Stones played for so far, out of how many there will be. */
  played: number;
  total: number;
  pending: { chooserId: string | null; chooserName: string; stoneId: string; game: Game; number: number } | null;
  /** The final podium's prizes: to the room once the reveal starts, always to the master. */
  prizes?: Prizes;
  lastResult: LastResult | null;
  revealStep: number;
  standings: Standing[];
  /** The 동점 결정전 being played right now (after 게임 종료). */
  activeTiebreak: { teams: { id: string; name: string; color: string }[]; game: Game } | null;
  /**
   * After 게임 종료, a tie for 1위 not yet played off: the teams and the 결정전,
   * so the projector shows the 타이브레이커 instead of the podium.
   */
  firstTie: { teams: { id: string; name: string; color: string }[]; game: Game } | null;
  /**
   * The secret 7th stone (감사 스톤), once a 1위 tie exists: the 결정전's prize.
   * `teamId` is the team that won it, or null while it is still to play for.
   */
  secretStone: { name: string; color: string; teamId: string | null } | null;
  /** Master only: the 결정전 game, and the 1위 tie still open (if any). */
  tiebreak?: Game;
  tiedGroups?: string[][];
  canUndoTiebreak?: boolean;
  /** master: the teams of the last decided 결정전, in finishing order (◀ reopens it). */
  lastTiebreak?: string[] | null;
  /** Master only. */
  games?: Game[];
  nextGame?: Game | null;
  blocking?: boolean;
  canUndo?: boolean;
}

export function project(room: Room, viewer: Viewer): StonesView {
  const running = room.state === 'RUNNING';
  const gameById = new Map(room.games.map((g) => [g.id, g]));
  const pendingGame = room.pending ? gameById.get(room.pending.gameId) ?? null : null;

  const view: StonesView = {
    kind: viewer.kind === 'master' ? 'master' : 'board',
    state: room.state,
    title: room.title,
    teams: room.teams.map((t) => ({ ...t, stoneIds: heldBy(room, t.id) })),
    stones: room.stones.map((s) => {
      const c = room.claims.find((x) => x.stoneId === s.id);
      return { ...s, claimed: c ? { winners: c.winners, gameName: gameById.get(c.gameId)?.name ?? '' } : null };
    }),
    turnTeamId: running ? room.turnTeamId : null,
    turnTeamName: running ? chooserName(room) || null : null,
    turnIsGuest: running && room.turnGuest !== null,
    round: room.round,
    lastStone: running && picksLeft(room) === 1,
    played: room.claims.length,
    total: Math.min(room.stones.length, room.games.length),
    pending:
      room.pending && pendingGame
        ? {
            chooserId: room.pending.chooserId,
            chooserName: room.pending.chooserName,
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
    firstTie: null,
    secretStone:
      (room.state === 'ENDED' || room.state === 'REVEAL') && (room.activeTiebreak || room.tiebreaks.length || tiedGroups(room).length)
        ? { ...SECRET_STONE, teamId: room.tiebreaks[0]?.[0] ?? null }
        : null,
  };
  if (room.state === 'ENDED' && room.activeTiebreak === null) {
    const tie = tiedGroups(room)[0];
    if (tie) {
      view.firstTie = {
        teams: tie.map((id) => {
          const t = room.teams.find((x) => x.id === id)!;
          return { id: t.id, name: t.name, color: t.color };
        }),
        game: room.tiebreak,
      };
    }
  }
  if (viewer.kind === 'master' || room.state === 'REVEAL') view.prizes = room.prizes;
  if (viewer.kind === 'master') {
    view.games = room.games;
    view.nextGame = room.state === 'RUNNING' && picksLeft(room) > 0 ? nextGame(room) : null;
    view.blocking = room.state === 'RUNNING' && room.pending !== null;
    view.canUndo = room.history.length > 0;
    view.tiebreak = room.tiebreak;
    view.tiedGroups = room.state === 'ENDED' ? tiedGroups(room) : [];
    view.canUndoTiebreak = room.state === 'ENDED' && room.activeTiebreak === null && room.tiebreaks.length > 0;
    view.lastTiebreak = room.tiebreaks.length ? [...room.tiebreaks[room.tiebreaks.length - 1]!] : null;
  }
  return view;
}
