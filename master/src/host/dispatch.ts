/**
 * The one dispatch loop (spec §6.1), written once for both games.
 *
 *     lock → host guards → allowed → apply → invariants → commit → persist → route
 *
 * Broadcast happens strictly after commit and persist-enqueue, so no client can
 * observe an event that a reconnect would not reproduce.
 */

import type { GameId, RoomState } from '../shared/lifecycle';
import { BASE_ALLOWED, sibling } from '../shared/lifecycle';
import type { EventRecord } from '../event/event';
import type { Registry } from '../event/registry';
import type { Action, AnyGameModule, Viewer } from './module';
import type { Emit } from './emit';
import { inDeliveryOrder } from './emit';
import { HostError } from './errors';
import type { Persistence } from './persist/strategy';

export interface DispatchDeps {
  registry: Registry;
  persistence: Persistence;
  /** Injected so tests drive time and `dispatch` stays the only clock reader. */
  now: () => number;
  /** Delivers routed emits. Milestone 2 wires the socket router in here. */
  deliver: (gameId: GameId, emits: readonly Emit[], at: number) => void;
  /** `production` disables the invariant assertions' throw-on-fail (spec §12). */
  checkInvariants?: boolean;
}

export interface DispatchResult {
  gameId: GameId;
  state: RoomState;
  emits: Emit[];
  at: number;
}

/**
 * The two host-level rules (spec §5.1). Checked **before** `apply`, because
 * neither is a game rule and neither game can see its sibling.
 */
export function hostGuards(
  event: EventRecord,
  gameId: GameId,
  action: Action,
  modules: Readonly<Record<GameId, AnyGameModule>>,
): void {
  const handle = event.games[gameId];
  if (!handle.enabled) throw new HostError('GAME_DISABLED');

  if (action.t !== 'REVEAL') return;

  const otherId = sibling(gameId);
  const other = event.games[otherId];
  const otherState = modules[otherId].lifecycle(other.state);

  // req §5.3 — the reveal is exclusive. Two podiums at once is not a technical
  // problem, it is a room problem: the reveal is the one moment the whole
  // gathering looks at one screen together.
  if (other.enabled && otherState === 'REVEAL') throw new HostError('REVEAL_BUSY');

  // req §5.2 — a reveal seizes the projector, unconditionally, and suspends
  // `'auto'` until it ends.
  event.projectorLock = gameId;
}

/** Effective whitelist = host base table ∪ the module's own (spec §5). */
export function assertAllowed(state: RoomState, action: Action, module: AnyGameModule): void {
  const base = BASE_ALLOWED[state];
  const own = module.allowed[state] ?? [];
  if (!base.includes(action.t) && !own.includes(action.t)) {
    throw new HostError('NOT_ALLOWED', `${state} 상태에서는 할 수 없어요`);
  }
}

/**
 * `projectorLock` clears when the locking game leaves `REVEAL`, restoring the
 * master's chosen `projector` setting (spec §5.1).
 */
function releaseProjectorLock(
  event: EventRecord,
  gameId: GameId,
  stateAfter: RoomState,
): void {
  if (event.projectorLock === gameId && stateAfter !== 'REVEAL') {
    event.projectorLock = null;
  }
}

export function createDispatch(deps: DispatchDeps) {
  const { registry, persistence, now, deliver } = deps;
  const checkInvariants = deps.checkInvariants ?? process.env['NODE_ENV'] !== 'production';

  return function dispatch<A extends Action>(
    gameId: GameId,
    action: A,
    _viewer: Viewer,
  ): Promise<DispatchResult> {
    return registry.lock(gameId, () => {
      const event = registry.require();
      const module = registry.modules[gameId];
      // The ONLY clock read in the system (spec §6.1). Both games' "every
      // timestamp is set by the server" requirement is a property of the
      // architecture here, not a rule to remember.
      const at = now();
      const handle = event.games[gameId];

      hostGuards(event, gameId, action, registry.modules);
      assertAllowed(module.lifecycle(handle.state), action, module);

      const { state, emits } = module.apply(handle.state, action, at);
      if (checkInvariants) module.invariants(state);

      registry.commit(gameId, state);

      const stateAfter = module.lifecycle(state);
      releaseProjectorLock(event, gameId, stateAfter);

      const ordered = inDeliveryOrder(emits);
      if (ordered.some((e) => e.to === 'room')) handle.lastRoomWideEmitAt = at;

      persistence.enqueue({ gameId, state, action, emits: ordered, at });
      deliver(gameId, ordered, at); // after commit, never before

      return { gameId, state: stateAfter, emits: ordered, at };
    });
  };
}

export type Dispatch = ReturnType<typeof createDispatch>;
