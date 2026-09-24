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
  readonly games: Record<GameId, GameHandle>;
  readonly createdAt: number;
  closedAt: number | null;
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
  games: Record<GameId, { enabled: boolean; state: RoomState }>;
}

export function summarize(
  event: EventRecord,
  modules: Readonly<Record<GameId, AnyGameModule>>,
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
    games,
  };
}
