/** Shared fixture: a registry, a dispatch, and a recording deliverer. */

import { createRegistry } from '../event/registry';
import { createDispatch } from '../host/dispatch';
import { createNullPersistence } from '../host/persist/strategy';
import type { Emit } from '../host/emit';
import type { GameId, RoomState } from '../shared/lifecycle';
import type { Viewer } from '../host/module';
import { createStubModule, type StubState } from './stub-module';

export const MASTER: Viewer = { kind: 'master' };
export const T0 = 1_700_000_000_000;

export function harness(options: { disabled?: readonly GameId[] } = {}) {
  const modules = {
    bingo: createStubModule('bingo'),
    yutnori: createStubModule('yutnori'),
  } as const;

  const registry = createRegistry(modules);
  const persistence = createNullPersistence();
  const delivered: { gameId: GameId; emits: readonly Emit[]; at: number }[] = [];
  // Ordering assertions need to know what was committed at the moment of
  // delivery, so the deliverer snapshots state rather than just recording.
  const seenAtDelivery: { gameId: GameId; committedPokes: number }[] = [];

  let clock = T0;
  const dispatch = createDispatch({
    registry,
    persistence,
    now: () => clock,
    deliver: (gameId, emits, at) => {
      delivered.push({ gameId, emits, at });
      const ev = registry.current();
      const state = ev?.games[gameId].state as { pokes?: number } | undefined;
      seenAtDelivery.push({ gameId, committedPokes: state?.pokes ?? -1 });
    },
  });

  const event = registry.open({
    title: '2026 가을 교회 한마당',
    now: clock,
    code: 'ABCD',
    ...(options.disabled ? { disabled: options.disabled } : {}),
  });

  return {
    modules,
    registry,
    persistence,
    dispatch,
    event,
    delivered,
    seenAtDelivery,
    advance(ms: number) {
      clock += ms;
      return clock;
    },
    now: () => clock,
    stateOf: (gameId: GameId): RoomState =>
      modules[gameId].lifecycle(registry.require().games[gameId].state as StubState),
    raw: (gameId: GameId): StubState => registry.require().games[gameId].state as StubState,
  };
}

/** SETUP → LOBBY → RUNNING, the path every game takes before it can be played. */
export async function toRunning(h: ReturnType<typeof harness>, gameId: GameId) {
  await h.dispatch(gameId, { t: 'SETUP', entrants: 12 }, MASTER);
  await h.dispatch(gameId, { t: 'START' }, MASTER);
}
