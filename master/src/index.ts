/**
 * `@soonot/master` — the public surface a game module compiles against.
 *
 * Spec §2 draws one dependency rule:
 *
 *     bingo ──┐
 *             ├──► master/shared      (types, lifecycle, rank, i18n)
 *   yutnori ──┘
 *
 *     master/host ──► bingo, yutnori  (their GameModule export, nothing else)
 *
 * So this file exports `shared/` plus the two contract types a module must
 * implement against — and **nothing from `host/`**. A game cannot reach the
 * registry, the dispatch loop, the session or `HostError` through it, which is
 * what keeps req §9.1's "the host contains no game rules" true in both
 * directions as the code grows.
 */

// The shared lifecycle and reveal machines (req §4.2).
export {
  BASE_ALLOWED,
  GAME_IDS,
  MAX_REVEAL_STEP,
  ROOM_STATES,
  isGameId,
  isRevealStep,
  nextRevealStep,
  sibling,
  type GameId,
  type RevealStep,
  type RoomState,
} from './shared/lifecycle.js';

// The podium contract (spec §3.4).
export { podiumAt, type RankEntry } from './shared/rank.js';

// The error a game throws from `apply` (spec §2).
export { EngineError } from './shared/errors.js';

// The contract itself, and the audience vocabulary every module's `Emit`
// union is built from (spec §3, §6.2).
export type { Action, GameModule, Viewer } from './host/module.js';
export {
  AUDIENCE_TOKENS,
  STATE_EVENT,
  type Audience,
  type AudienceToken,
  type Emit,
} from './host/emit.js';
export type {
  EventLogStrategy,
  HostDb,
  PersistenceStrategy,
  SnapshotStrategy,
} from './host/persist/strategy.js';
