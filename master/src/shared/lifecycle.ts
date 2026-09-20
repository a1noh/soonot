/**
 * The shared lifecycle and reveal machines (req §4.2).
 *
 * Both games declared these identically before the host existed. They are
 * written once here and neither game may redefine them.
 */

export type GameId = 'bingo' | 'yutnori';

export const GAME_IDS = ['bingo', 'yutnori'] as const satisfies readonly GameId[];

export type RoomState = 'SETUP' | 'LOBBY' | 'RUNNING' | 'ENDED' | 'REVEAL';

export const ROOM_STATES = [
  'SETUP',
  'LOBBY',
  'RUNNING',
  'ENDED',
  'REVEAL',
] as const satisfies readonly RoomState[];

/**
 * The host's base action whitelist (spec §5). A module's own `allowed` table is
 * unioned with this one; the host answers "can this happen right now?" in
 * exactly one place.
 */
export const BASE_ALLOWED: Record<RoomState, readonly string[]> = {
  SETUP: ['SETUP'],
  LOBBY: ['START'],
  RUNNING: ['END'],
  ENDED: ['REVEAL'],
  REVEAL: ['REVEAL'],
};

/** 0 = holding screen, 1 = 3rd, 2 = 2nd, 3 = 1st, 4 = full standings (req §4.2). */
export type RevealStep = 0 | 1 | 2 | 3 | 4;

export const MAX_REVEAL_STEP: RevealStep = 4;

export function isRevealStep(n: unknown): n is RevealStep {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_REVEAL_STEP;
}

/**
 * The reveal counts *up* — 3rd, then 2nd, then 1st — in both games (req §4.2).
 * Advancing past the last step is a no-op rather than an error: the master
 * tapping `다음` once more in front of a room must never surface a red banner.
 */
export function nextRevealStep(step: RevealStep): RevealStep {
  return (step >= MAX_REVEAL_STEP ? MAX_REVEAL_STEP : step + 1) as RevealStep;
}

export function isGameId(v: unknown): v is GameId {
  return v === 'bingo' || v === 'yutnori';
}

/** The other game. The host needs this for the two §5.1 rules; no game does. */
export function sibling(id: GameId): GameId {
  return id === 'bingo' ? 'yutnori' : 'bingo';
}
