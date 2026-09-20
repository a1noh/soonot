/**
 * bingo/spec.md §4.2.
 *
 * There is no TICK. This game has no server-side clock: it ends when the
 * master says so, and elapsed time is computed client-side (req §16.4).
 */
export type Action =
  | { t: 'SET_TRAITS'; texts: readonly string[] } // exactly 81
  | { t: 'JOIN'; playerId: string; nickname: string }
  | { t: 'REJOIN'; playerId: string }
  | { t: 'DISCONNECT'; playerId: string }
  | { t: 'START' }
  | { t: 'FILL'; playerId: string; cellIndex: number; query: string }
  | { t: 'FILL_PICK'; playerId: string; cellIndex: number; targetId: string }
  | { t: 'CLEAR'; playerId: string; cellIndex: number }
  | { t: 'END' }
  | { t: 'REVEAL'; step: number };

export type ActionType = Action['t'];

/** Reasons a fill can be rejected. req §7.2 — the Korean strings live in i18n. */
export type FillReason =
  | 'NO_SUCH_PERSON'
  | 'SELF'
  | 'REUSED'
  | 'CELL_TAKEN';
