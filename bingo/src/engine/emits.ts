/**
 * Bingo's Emit union. bingo/spec.md §1.2.
 *
 * Each event name is paired with its legal audience. `cell:result` has NO
 * `to: 'room'` variant, so broadcasting one is a compile error rather than a
 * load-test finding — at 100 players that mistake turns 8,100 events into
 * 810,000 messages (req §16.2).
 *
 * `error` is deliberately absent: the host replies to the originating socket.
 */
import type { FillReason } from './actions';
import type { LineId } from '../shared/lines';

export interface CellResult {
  cellIndex: number;
  ok: boolean;
  reason?: FillReason;
  target?: { number: number; nickname: string };
}

export interface Candidate {
  number: number;
  nickname: string;
  playerId: string;
}

export type BingoEmit =
  // unicast — never broadcast
  | { to: 'player'; playerId: string; ev: 'cell:result'; data: CellResult }
  | { to: 'player'; playerId: string; ev: 'cell:candidates'; data: { cellIndex: number; candidates: Candidate[] } }
  | { to: 'player'; playerId: string; ev: 'traits:dict'; data: { traits: string[] } }
  | { to: 'player'; playerId: string; ev: 'card:assigned'; data: { permutation: readonly number[]; number: number } }
  | { to: 'player'; playerId: string; ev: 'card:restore'; data: { permutation: readonly number[]; fills: readonly (string | null)[]; filledAt: readonly (number | null)[]; completedLines: readonly LineId[] } }
  | { to: 'player'; playerId: string; ev: 'roster:snapshot'; data: { players: { n: number; id: string; name: string; conn: boolean }[] } }
  // room-wide
  | { to: 'room'; ev: 'roster:delta'; data: { added: { n: number; id: string; name: string }[]; removed: string[]; changed: { id: string; conn: boolean }[] } }
  | { to: 'room'; ev: 'bingo:announced'; data: { number: number; nickname: string; lineCount: number; at: number } }
  // master console only
  | { to: 'master'; ev: 'dashboard:update'; data: { bingoCount: number; playerCount: number; connectedCount: number } };
