/**
 * Audience-scoped state. master/spec.md §3.3.
 *
 * This is what makes "players can never see another player's card" (req §3)
 * structural rather than a discipline: the host only ever sends what `project`
 * returned for that viewer, so a card cannot leak into a broadcast by accident.
 */
import type { RankEntry, Viewer } from '@soonot/master';
import type { Room } from './shared/types';
import { filledCount, bestLineProgress } from './engine/bingo';
import { rank, rankPlayers } from './engine/ranking';

export interface RosterEntry {
  n: number;
  id: string;
  name: string;
  conn: boolean;
}

/** One matched cell on a winner's card — a trait and the person they named for it. */
export interface MatchedCell {
  trait: string;
  name: string;
  number: number;
}

/**
 * A top-3 winner and the people they matched — the operator's "interview" tool
 * (interview 1등 and the people they named; on a lie, check 2등). Names are shown
 * only at the reveal, when identities are meant to be public.
 */
export interface WinnerCard {
  rank: number;
  n: number;
  name: string;
  lines: number;
  points: number;
  matched: MatchedCell[];
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
  /**
   * The official ranking, for the shared podium (master spec §3.4). Empty
   * during play — a card and its standing are private until the reveal, which
   * is the one moment they are meant to be public. Populated only once the game
   * is ENDED or REVEAL.
   */
  standings: RankEntry[];
  /**
   * Anonymous bingo distribution: how many players hold exactly N lines, for
   * N >= 1, ascending. Counts only — NO names — so it's safe to show live on the
   * projector for suspense while identities stay private until the reveal.
   */
  bingoBreakdown: { lines: number; count: number }[];
  /**
   * Top-3 winners with the people they matched (interview tool). Populated only at
   * the reveal — cards are private during play.
   */
  winners: WinnerCard[];
}

/** Is the ranking public yet? (Only at reveal — see `PublicView.standings`.) */
function revealPhase(room: Room): boolean {
  return room.state === 'ENDED' || room.state === 'REVEAL';
}

/** The top-3 winners and, for each, the people they named per trait. Reveal-only. */
function winnersOf(room: Room): WinnerCard[] {
  return rankPlayers(room)
    .slice(0, 3)
    .map((p, i) => {
      const matched: MatchedCell[] = [];
      p.fills.forEach((fill, cell) => {
        if (!fill) return;
        const trait = room.traits[p.permutation[cell] ?? -1]?.text ?? '';
        const person = room.players.get(fill);
        if (person) matched.push({ trait, name: person.nickname, number: person.number });
      });
      return {
        rank: i + 1,
        n: p.number,
        name: p.nickname,
        lines: p.completedLines.length,
        points: filledCount(p) + LINE_BONUS * p.completedLines.length,
        matched,
      };
    });
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

/** One rung of the live points ladder — number only, never a nickname, so the
 *  projector board is competitive but keeps identities private until the reveal. */
export interface ScoreEntry {
  n: number;
  points: number;
  lines: number;
}

/** Points: 1 per filled cell + a bonus per completed line (bingo). Tunable here. */
export const LINE_BONUS = 5;

export interface SpectatorView extends PublicView {
  kind: 'spectator';
  /** Names + connected flag for the projector's "who's online" box — no cards. */
  roster: RosterEntry[];
  /** The live points ladder (number-only), ranked high→low — always present on /p. */
  board: ScoreEntry[];
}

export type BingoView = PlayerView | MasterView | SpectatorView;

function publicOf(room: Room): PublicView {
  let connected = 0;
  let bingos = 0;
  const byLines = new Map<number, number>();
  for (const p of room.players.values()) {
    if (p.connected) connected++;
    const n = p.completedLines.length;
    if (n >= 1) {
      bingos++;
      byLines.set(n, (byLines.get(n) ?? 0) + 1);
    }
  }
  const bingoBreakdown = [...byLines.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lines, count]) => ({ lines, count }));
  return {
    state: room.state,
    playerCount: room.players.size,
    connectedCount: connected,
    bingoCount: bingos,
    startedAt: room.startedAt,
    endedAt: room.endedAt,
    revealStep: room.revealStep,
    traitCount: room.traits.length,
    standings: revealPhase(room) ? rank(room) : [],
    bingoBreakdown,
    winners: revealPhase(room) ? winnersOf(room) : [],
  };
}

/** The live points ladder, number-only, ranked points→lines→number. */
function boardOf(room: Room): ScoreEntry[] {
  return [...room.players.values()]
    .map((p) => ({
      n: p.number,
      lines: p.completedLines.length,
      points: filledCount(p) + LINE_BONUS * p.completedLines.length,
    }))
    .sort((a, b) => b.points - a.points || b.lines - a.lines || a.n - b.n);
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
      // Mark this player's own row so the podium can render 나의 순위 (bingo §9).
      standings: revealPhase(room) ? rank(room, viewer.playerId) : [],
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

  return { kind: 'spectator', ...base, roster: rosterOf(room), board: boardOf(room) };
}
