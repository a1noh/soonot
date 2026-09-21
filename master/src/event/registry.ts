/**
 * The one active event, and the per-game locks (spec §6.1).
 *
 * One active event at a time (req §1). The registry is the only thing that
 * holds mutable host state, and the only thing `dispatch` commits into.
 */

import type { GameId } from '../shared/lifecycle';
import { GAME_IDS } from '../shared/lifecycle';
import type { AnyGameModule } from '../host/module';
import { HostError } from '../host/errors';
import type { CreateEventInput, EventRecord } from './event';
import { createEvent } from './event';

export interface Registry {
  readonly modules: Readonly<Record<GameId, AnyGameModule>>;
  current(): EventRecord | null;
  require(): EventRecord;
  open(input: Omit<CreateEventInput, 'modules'>): EventRecord;
  /**
   * Install an event restored from disk (spec §8.4). Distinct from `open`:
   * it assigns no id and generates no code — both already exist, and a
   * reconnecting phone is holding the old ones.
   */
  adopt(event: EventRecord): void;
  close(now: number): void;
  /** Drop the active event entirely (a full reset back to "no event"). */
  clear(): void;
  commit(gameId: GameId, state: unknown): void;
  /**
   * Serializes actions **per game**, so a bingo cell fill never waits on a
   * yutnori throw. This is what makes req §11's "an action in one game never
   * blocks the other" true by construction rather than by hope.
   */
  lock<T>(gameId: GameId, fn: () => Promise<T> | T): Promise<T>;
}

export function createRegistry(modules: Readonly<Record<GameId, AnyGameModule>>): Registry {
  let event: EventRecord | null = null;

  // One promise chain per game. Not per event: the two games are independent
  // writers that happen to share a process.
  const chains = {} as Record<GameId, Promise<unknown>>;
  for (const gameId of GAME_IDS) chains[gameId] = Promise.resolve();

  return {
    modules,

    current: () => event,

    require() {
      if (!event || event.closedAt !== null) throw new HostError('NO_EVENT');
      return event;
    },

    open(input) {
      if (event && event.closedAt === null) {
        // req §12: one active event. Close the current one first.
        throw new HostError('NOT_ALLOWED', '이미 진행 중인 행사가 있어요');
      }
      event = createEvent({ ...input, modules });
      return event;
    },

    adopt(restored) {
      event = restored;
    },

    close(now) {
      if (event) event.closedAt = now;
    },

    clear() {
      event = null;
    },

    commit(gameId, state) {
      if (!event) throw new HostError('NO_EVENT');
      event.games[gameId].state = state;
    },

    lock(gameId, fn) {
      // Chain onto the tail regardless of how the previous action settled, so
      // one rejected action cannot wedge the game for the rest of the event.
      const run = chains[gameId].then(fn, fn);
      chains[gameId] = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}
