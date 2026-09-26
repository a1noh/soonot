import type { Roll } from './types';

/** req §6 — one loop, twenty stations, no shortcuts. */
export const STATION_COUNT = 20;

/** `progress` sentinels (req §6). */
export const WAITING = 0;   // 대기 — off-board, uncatchable
export const HOME = 20;     // 집   — finished, uncatchable

/**
 * 미니게임 칸 — landing a 말 exactly on one of these 밭 triggers a mini-game (a
 * roulette picks one; the team plays it in the room; a fail cancels the move).
 * Spread across the WHOLE map so a game keeps hitting them: every other 밭 on the
 * outer ring (skipping the 4 corners 0/5/10/15), one on each diagonal 지름길 arm,
 * and one dead centre (방). Never a corner (those are the 갈림길 choice 밭) and
 * never 대기/집.
 */
export const MINIGAME_STATIONS: readonly number[] = [
  1, 3, 6, 8, 11, 13, 16, 18, // outer ring — every other 밭
  22, 25, 27, 29, // one per diagonal arm, staggered radius so they scatter (not a cluster)
  23, // 방 — the centre
];
export function isMiniGameStation(progress: number): boolean {
  return MINIGAME_STATIONS.includes(progress);
}

/** One quick 1:1 head-to-head game for a 잡기 방어전 (대표 대결). */
export interface DuelGame {
  readonly id: string;
  readonly name: string;
  readonly instruction: string;
}

/** Built-in 1:1 대결 종목 — the default `duelGameSet`; the console can edit the list. */
export const DUEL_GAMES: readonly DuelGame[] = [
  { id: 'rps', name: '가위바위보', instruction: '단판 승부' },
  { id: 'chamchamcham', name: '참참참', instruction: '고개 방향 피하기' },
  { id: 'staredown', name: '눈싸움', instruction: '먼저 눈 깜빡이면 패' },
  { id: 'mukjjippa', name: '묵찌빠', instruction: '먼저 이기면 승' },
  { id: 'thumbwar', name: '엄지씨름', instruction: '엄지로 상대 엄지 3초 누르면 승' },
  { id: 'onefoot', name: '한 발 서기', instruction: '먼저 발 닿으면 패' },
  { id: 'nolaugh', name: '웃음 참기', instruction: '먼저 웃으면 패' },
  { id: 'bottleflip', name: '물병 세우기', instruction: '먼저 성공하면 승' },
  { id: 'palmpush', name: '손바닥 밀치기', instruction: '먼저 발 움직이면 패' },
  { id: 'category', name: '카테고리 배틀', instruction: '3초 안에 못 말하면 패' },
];

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
