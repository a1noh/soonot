/**
 * Audience-scoped state. master/spec.md §3.3.
 *
 * This is what makes "players can never see another player's card" (req §3)
 * structural rather than a discipline: the host only ever sends what `project`
 * returned for that viewer, so a card cannot leak into a broadcast by accident.
 */
import type { Viewer } from '@soonot/master';
import type { Room } from './shared/types';
import { filledCount, bestLineProgress } from './engine/bingo';

export interface RosterEntry {
  n: number;
  id: string;
  name: string;
  conn: boolean;
}

/** Everything every viewer may see. No cards, no fills. */
export interface PublicView {
  state: Room['state'];
  playerCount: number;
  connectedCount: number;
  bingoCount: number;
  startedAt: number | null;
  endedAt: number | null;
  revealStep: number;
  traitCount: number;
}

export interface PlayerView extends PublicView {
  kind: 'player';
  /** Present only once the player has joined and the game has started. */
  me: {
    id: string;
    number: number;
    nickname: string;
    permutation: readonly number[];
    fills: readonly (string | null)[];
    completedLines: readonly string[];
    bestLine: number;
    filled: number;
  } | null;
  traits: readonly string[];
  roster: RosterEntry[];
}

export interface MasterView extends PublicView {
  kind: 'master';
  roster: RosterEntry[];
  /** The live top 10 — a 100-row board is unreadable on a projector (req §9). */
  leaders: { n: number; name: string; at: number; lines: number }[];
}

export interface SpectatorView extends PublicView {
  kind: 'spectator';
}

export type BingoView = PlayerView | MasterView | SpectatorView;

function publicOf(room: Room): PublicView {
  let connected = 0;
  let bingos = 0;
  for (const p of room.players.values()) {
    if (p.connected) connected++;
    if (p.firstBingoAt !== null) bingos++;
  }
  return {
    state: room.state,
    playerCount: room.players.size,
    connectedCount: connected,
    bingoCount: bingos,
    startedAt: room.startedAt,
    endedAt: room.endedAt,
    revealStep: room.revealStep,
    traitCount: room.traits.length,
  };
}

function rosterOf(room: Room): RosterEntry[] {
  return [...room.players.values()].map((p) => ({
    n: p.number,
    id: p.id,
    name: p.nickname,
    conn: p.connected,
  }));
}

export function project(room: Room, viewer: Viewer): BingoView {
  const base = publicOf(room);

  if (viewer.kind === 'player') {
    const me = room.players.get(viewer.playerId);
    return {
      kind: 'player',
      ...base,
      traits: room.traits.map((t) => t.text),
      roster: rosterOf(room),
      me: me
        ? {
            id: me.id,
            number: me.number,
            nickname: me.nickname,
            permutation: me.permutation,
            fills: me.fills,
            completedLines: me.completedLines,
            bestLine: bestLineProgress(me),
            filled: filledCount(me),
          }
        : null,
    };
  }

  if (viewer.kind === 'master') {
    const leaders = [...room.players.values()]
      .filter((p) => p.firstBingoAt !== null)
      .sort((a, b) => a.firstBingoAt! - b.firstBingoAt! || a.firstBingoSeq! - b.firstBingoSeq!)
      .slice(0, 10)
      .map((p) => ({ n: p.number, name: p.nickname, at: p.firstBingoAt!, lines: p.completedLines.length }));
    return { kind: 'master', ...base, roster: rosterOf(room), leaders };
  }

  return { kind: 'spectator', ...base };
}
