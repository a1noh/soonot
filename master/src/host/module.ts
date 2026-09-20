/**
 * The `GameModule` contract (spec §3) — the interface that makes one host serve
 * two games.
 *
 * The host's only knowledge of either game is this shape. It does not know what
 * a 말 is, what a trait is, what a line is, or how either game ranks anybody. It
 * knows five lifecycle states, a reveal counter, and how to hand an action to a
 * game and route what comes back.
 */

import type { GameId, RoomState } from '../shared/lifecycle';
import type { RankEntry } from '../shared/rank';
import type { Emit } from './emit';
import type { PersistenceStrategy } from './persist/strategy';

/** Who is asking. `project` scopes state to this; `route` rejects on it. */
export type Viewer =
  | { readonly kind: 'master' }
  | { readonly kind: 'player'; readonly playerId: string }
  /** Board and projector alike — read-only for life (req §3.3). */
  | { readonly kind: 'spectator' };

export type Action = { readonly t: string };

export interface GameModule<S = unknown, A extends Action = Action> {
  readonly id: GameId;

  /** Fresh state in `SETUP` for a new event. Pure; `now` is injected. */
  create(eventId: string, now: number): S;

  /**
   * The rules. Pure: no I/O, no `Date.now()`, no socket awareness.
   * Throws `EngineError` on an action that is illegal under the game's own
   * rules — the engine never silently no-ops.
   */
  apply(state: S, action: A, now: number): { state: S; emits: Emit[] };

  /**
   * Where the host reads the shared lifecycle out of opaque game state.
   *
   * The host must answer "what state is this game in?" to apply the §5 guard
   * table and the two §5.1 rules, but game state is deliberately opaque to it
   * (req §4.1). One accessor is the whole of the host's read access — strictly
   * less than the alternative of the host owning a `RoomState` field it would
   * then have to keep in sync with the game's own idea of itself.
   */
  lifecycle(state: S): RoomState;

  /** Per-state action whitelist, unioned with the host's `BASE_ALLOWED` (spec §5). */
  readonly allowed: Readonly<Record<RoomState, readonly A['t'][]>>;

  /**
   * Socket event + payload + who sent it → an action, or `null` to reject.
   * The whole protocol as data; the host never switches on event names.
   */
  route(ev: string, payload: unknown, viewer: Viewer): A | null;

  /**
   * State → the payload this viewer is allowed to see (spec §3.3).
   *
   * This is what makes "players can never see another player's card" (bingo §3)
   * structural rather than a discipline: the host only ever sends what
   * `project` returned for that viewer.
   */
  project(state: S, viewer: Viewer): unknown;

  /** State → the ranked list the shared podium renders (spec §3.4). */
  rank(state: S): RankEntry[];

  /** Dev and test only. Throws on a violated invariant. */
  invariants(state: S): void;

  readonly persistence: PersistenceStrategy<S, A>;

  /**
   * Subscribe to the 1 Hz clock? (spec §7) Yutnori opts in — its clock expiry is
   * a state transition. Bingo opts out: bingo §16.4 is explicit that pushing an
   * elapsed clock to 100 clients costs more than the rest of the game combined.
   */
  readonly ticks: boolean;

  /**
   * May the host re-`project` to **everyone on this game's surface** after every
   * action, or only on a lifecycle transition? (spec §6.4)
   *
   * 윷놀이 says yes: one writer, an action every few seconds, and a board that
   * is meaningless unless it moves as the sticks land.
   *
   * Bingo says no. ~8,100 fills × 100 players is the 810,000-message mistake
   * §6.2 exists to prevent, arrived at from a different direction. Its crowd
   * stays current from unicast `cell:result` and coalesced `roster:delta`
   * instead. The master console and the projector are a handful of screens and
   * are refreshed after every action either way.
   */
  readonly liveProjection: boolean;
}

/**
 * Erased form, for the registry and the dispatch loop. The host holds modules
 * whose state type it cannot name — that is the point of §9.1 — so `any` here
 * is the erasure, not a shortcut. It appears in exactly this one declaration.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export type AnyGameModule = GameModule<any, any>;

export type ModuleTable = Readonly<Record<GameId, AnyGameModule>>;
