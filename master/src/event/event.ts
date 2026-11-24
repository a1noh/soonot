/**
 * The `Event` and its `GameHandle`s (req §4.1).
 *
 * One event, one code, two games. Creating it mints the code and both game
 * instances in `SETUP` — there is no separate "create a bingo room" step and no
 * second passcode prompt.
 */

import { randomUUID } from 'node:crypto';
import type { GameId, RoomState } from '../shared/lifecycle';
import { GAME_IDS } from '../shared/lifecycle';
import { generateCode } from './code';
import type { AnyGameModule } from '../host/module';
import { defaultShow, type BgmOnAir, type Cue, type ShowState, type SlideOnAir, type Transition } from './show';

export type ProjectorSetting = GameId | 'auto';

export interface GameHandle {
  /** The master may hide a game the event will not play tonight (req §12). */
  enabled: boolean;
  /** Opaque to the host. Read through `module.lifecycle(state)`, never directly. */
  state: unknown;
  /** Last emit with `to: 'room'`, for `'auto'` projector arbitration (spec §5.2). */
  lastRoomWideEmitAt: number;
}

export interface EventRecord {
  readonly id: string;
  readonly code: string;
  title: string;
  /** The master's choice. `'auto'` resolves server-side so every screen agrees. */
  projector: ProjectorSetting;
  /** A reveal seizes the screen and overrides `projector` until it ends (req §5.2). */
  projectorLock: GameId | null;
  /**
   * Which winner's whole bingo card the operator is spotlighting on `/p` — the
   * winner's player number, or null for none. The interview tool: at the reveal
   * the master can push a chosen 1등/2등/3등's card (their matched people) to the
   * projector. Reveal-only on screen; harmless otherwise.
   */
  bingoSpotlight: number | null;
  /** The 1등 mystery box on `/p` — false = closed 🎁, true = opened to reveal the prize
   *  (첫 스톤 선택권). Operator-toggled during the bingo reveal. */
  bingoPrize: boolean;
  /**
   * The 랜덤 5명 확인 on the spotlighted winner's card: the cell indexes the
   * master drew (in call-out order), or null. Cleared when the spotlight moves.
   */
  bingoCheck: number[] | null;
  /** A countdown over whatever the projector shows (any game), or null. */
  projectorTimer: ProjectorTimer | null;
  /** A 4지선다 question over the projector (number 1–4 only, never the 보기), or null. */
  projectorQuiz: ProjectorQuiz | null;
  /** 진행 순서: the script's slides, screens and BGM, and what is on air now. */
  show: ShowState;
  readonly games: Record<GameId, GameHandle>;
  readonly createdAt: number;
  closedAt: number | null;
}

export interface ProjectorQuiz {
  /** 1-based question number, and how many there are. */
  n: number;
  total: number;
  question: string;
}

export interface ProjectorTimer {
  /** What it counts down for, e.g. "종이비행기 접기". May be empty. */
  label: string;
  totalMs: number;
  /** Server clock. Screens correct for their own clock with `serverNow`. */
  endsAt: number;
}

export interface CreateEventInput {
  title: string;
  modules: Readonly<Record<GameId, AnyGameModule>>;
  now: number;
  /** Games the event will not play tonight. Both enabled unless named here. */
  disabled?: readonly GameId[];
  /** Tests pin the code; production mints one. */
  code?: string;
}

export function createEvent(input: CreateEventInput): EventRecord {
  const { title, modules, now } = input;
  const id = randomUUID();
  const disabled = new Set(input.disabled ?? []);

  const games = {} as Record<GameId, GameHandle>;
  for (const gameId of GAME_IDS) {
    games[gameId] = {
      enabled: !disabled.has(gameId),
      state: modules[gameId].create(id, now),
      lastRoomWideEmitAt: 0,
    };
  }

  return {
    id,
    code: input.code ?? generateCode(),
    title,
    projector: 'auto',
    projectorLock: null,
    bingoSpotlight: null,
    bingoPrize: false,
    bingoCheck: null,
    projectorTimer: null,
    projectorQuiz: null,
    show: defaultShow(),
    games,
    createdAt: now,
    closedAt: null,
  };
}

/** The shared lifecycle state of one game, read through its module (spec §3). */
export function stateOf(
  event: EventRecord,
  gameId: GameId,
  modules: Readonly<Record<GameId, AnyGameModule>>,
): RoomState {
  return modules[gameId].lifecycle(event.games[gameId].state);
}

/**
 * What the console and every surface show above the games (req §7).
 * Never includes game state — that comes from each module's `project`.
 */
export interface EventSummary {
  id: string;
  code: string;
  title: string;
  projector: ProjectorSetting;
  projectorLock: GameId | null;
  bingoSpotlight: number | null;
  bingoPrize: boolean;
  bingoCheck: number[] | null;
  projectorTimer: ProjectorTimer | null;
  projectorQuiz: ProjectorQuiz | null;
  /** A slide over the projector, or null for the game screen. */
  slide: SlideOnAir | null;
  /** The BGM the projector plays (or, with no file, a placeholder for the MC). */
  bgm: BgmOnAir | null;
  /** How the projector moves between game screens. */
  screenTransition: Transition;
  /** 🔇 소리 끄기 on the console: the projector stays silent. */
  muted: boolean;
  /** The cue last sent to the projector. */
  liveCue: string | null;
  /**
   * The whole 진행 순서 — the CONSOLE's copy only. It names every round in
   * order, which the room must not learn early, so phones and the projector
   * never get it.
   */
  cues?: Cue[];
  /** The server's clock when this summary was made, so a screen can line its countdown up. */
  serverNow: number;
  games: Record<GameId, { enabled: boolean; state: RoomState }>;
}

export function summarize(
  event: EventRecord,
  modules: Readonly<Record<GameId, AnyGameModule>>,
  forMaster = false,
): EventSummary {
  const games = {} as EventSummary['games'];
  for (const gameId of GAME_IDS) {
    games[gameId] = {
      enabled: event.games[gameId].enabled,
      state: stateOf(event, gameId, modules),
    };
  }
  return {
    id: event.id,
    code: event.code,
    title: event.title,
    projector: event.projector,
    projectorLock: event.projectorLock,
    bingoSpotlight: event.bingoSpotlight,
    bingoPrize: event.bingoPrize,
    bingoCheck: event.bingoCheck,
    projectorTimer: event.projectorTimer,
    projectorQuiz: event.projectorQuiz,
    slide: event.show.slide,
    bgm: event.show.bgm,
    screenTransition: event.show.screenTransition,
    muted: event.show.muted,
    liveCue: event.show.liveCue,
    ...(forMaster ? { cues: event.show.cues } : {}),
    serverNow: Date.now(),
    games,
  };
}
