/**
 * Bingo state. bingo/req.md §5, with the host migration applied:
 * no `joinCode`, no `masterPasscodeHash` — the event owns both (master §4.1).
 */
import type { RoomState } from '@soonot/master';
import type { LineId } from './lines';

export interface Trait {
  /** 0..80 — the index into Room.traits. A small int so the permutation packs tightly. */
  readonly id: number;
  readonly text: string;
  readonly category: string;
  /** True if the master typed it rather than picking it from the pack. */
  readonly custom: boolean;
}

export interface Player {
  readonly id: string;
  /** 1..999, displayed as #042. THE identity (req §7.0). Never reused. */
  readonly number: number;
  /** Display form, as typed. MAY collide with another player's. */
  readonly nickname: string;
  /** Normalized (req §7.1). Used for search only, NOT for uniqueness. */
  readonly nicknameKey: string;
  readonly joinedAt: number;
  readonly lateJoin: boolean;
  readonly connected: boolean;
  /** length 81; permutation[cellIndex] = traitId */
  readonly permutation: readonly number[];
  /** length 81; fills[cellIndex] = playerId of the person named */
  readonly fills: readonly (string | null)[];
  /** length 81, server timestamps */
  readonly filledAt: readonly (number | null)[];
  /** O(1) once-per-card check (req §7.2 rule 5) */
  readonly usedPlayerIds: ReadonlySet<string>;
  readonly firstBingoAt: number | null;
  /** Total-order tie-break (req §9) */
  readonly firstBingoSeq: number | null;
  readonly completedLines: readonly LineId[];
}

export interface BingoEvent {
  readonly playerId: string;
  readonly lineId: LineId;
  readonly at: number;
  /** Room.seq++. Total order even within one millisecond. */
  readonly seq: number;
  readonly lineCount: number;
}

export interface Room {
  readonly eventId: string;
  readonly state: RoomState;
  /** Exactly 81 once state is past SETUP. */
  readonly traits: readonly Trait[];
  readonly players: ReadonlyMap<string, Player>;
  /** player number → playerId. O(1) entry lookup. */
  readonly byNumber: ReadonlyMap<number, string>;
  /** nicknameKey → playerIds[]. Many per key is legal (req §7.0). */
  readonly nameIndex: ReadonlyMap<string, readonly string[]>;
  readonly nextNumber: number;
  readonly bingoEvents: readonly BingoEvent[];
  readonly seq: number;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
  readonly revealStep: number;
  readonly createdAt: number;
}
