import type { Roll } from './types';

/** req §6 — one loop, twenty stations, no shortcuts. */
export const STATION_COUNT = 20;

/** `progress` sentinels (req §6). */
export const WAITING = 0;   // 대기 — off-board, uncatchable
export const HOME = 20;     // 집   — finished, uncatchable

export const MS_PER_MIN = 60_000;

/** req §7 — five values, no 백도. */
export const ROLLS: readonly Roll[] = ['도', '개', '걸', '윷', '모'] as const;

export const ROLL_STEPS: Readonly<Record<Roll, number>> = {
  도: 1,
  개: 2,
  걸: 3,
  윷: 4,
  모: 5,
};

/** Rolls that grant an extra throw (req §7). */
export const BONUS_ROLLS: readonly Roll[] = ['윷', '모'] as const;

/**
 * Fixed high-contrast palette (req §16). Assigned by team order, never picked per
 * event — the contrast check against the board background is a client concern (spec
 * §7.4, milestone 6), but the values are fixed here so the check has one target.
 */
export const TEAM_COLORS: readonly string[] = [
  '#C0392B', // red
  '#1F6FB2', // blue
  '#1E8449', // green
  '#B7791F', // amber
  '#6C3483', // purple
  '#117A73', // teal
  '#A04000', // burnt orange
  '#2C3E50', // slate
] as const;

export const DEFAULT_TIME_LIMIT_MIN = 20;
export const MIN_TEAMS = 2;
export const MAX_REVEAL_STEP = 4;
