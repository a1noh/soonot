/**
 * Namespace wiring (spec §6.3).
 *
 * | Namespace | Viewer      | Registered handlers                          |
 * |-----------|-------------|----------------------------------------------|
 * | `/master` | master      | both modules' `route`, plus host ops          |
 * | `/b`      | player      | bingo's `route` only                          |
 * | `/y`      | spectator   | **none** — subscribe only (yutnori §3)        |
 * | `/p`      | spectator   | **none** — subscribe only; cookie ignored     |
 *
 * A namespace with no handlers cannot be driven, which is stronger than a
 * namespace whose handlers check a flag.
 */

import type { Namespace, Server, Socket } from 'socket.io';
import type { GameId } from '../shared/lifecycle.js';
import { GAME_IDS, isGameId } from '../shared/lifecycle.js';
import type { Registry } from '../event/registry.js';
import { summarize } from '../event/event.js';
import type { Dispatch } from './dispatch.js';
import type { Emit } from './emit.js';
import { STATE_EVENT } from './emit.js';
import { HostError, toWireError } from './errors.js';
import type { Viewer } from './module.js';
import type { Sessions } from '../identity/session.js';
import { decideHandshake } from '../identity/guard.js';
import { createBucketRegistry, type BucketRegistry } from './tokenbucket.js';
import { randomUUID } from 'node:crypto';

export interface SocketData {
  master: boolean;
  viewer: Viewer;
}

export interface NamespaceDeps {
  io: Server;
  registry: Registry;
  dispatch: Dispatch;
  sessions: Sessions;
  /** For persisting a reset (event close / fresh game state) off the action path. */
  persistence?: import('./persist/strategy.js').Persistence;
  now: () => number;
  /**
   * `playerId` → socket, for unicast (spec §6.2). Owned by the caller because
   * `createRouter` reads the same map; populated here, at join.
   */
  playerSockets?: Map<string, Socket>;
  buckets?: BucketRegistry;
}

/** The emojis a phone may fling onto the projector (Kahoot-style reactions). */
export const REACTION_EMOJI: ReadonlySet<string> = new Set([
  '❤️', '👏', '🎉', '😂', '🔥', '👍', '🙏', '😮', '😢',
]);

/**
 * Global reaction rate cap (anti-spam / "도배" guard), on top of the per-phone
 * throttle. No more than this many reactions reach the projector per second,
 * across everyone — a rolling 1-second window.
 */
const REACTIONS_PER_SEC = 12;
const reactionWindow = { since: 0, count: 0 };
function reactionAllowed(now: number): boolean {
  if (now - reactionWindow.since >= 1000) {
    reactionWindow.since = now;
    reactionWindow.count = 0;
  }
  if (reactionWindow.count >= REACTIONS_PER_SEC) return false;
  reactionWindow.count += 1;
  return true;
}

/** Rooms the emit router targets. One per game surface, one for the masters. */
export const ROOM = {
  game: (id: GameId) => `game:${id}`,
  master: 'masters',
  projector: 'projector',
} as const;

export function attachNamespaces(deps: NamespaceDeps): void {
  const { io, registry, dispatch, sessions, now } = deps;

  const master = io.of('/master');
  const player = io.of('/b');
  const board = io.of('/y');
  const projector = io.of('/p');

  // One guard, four namespaces. The flag is set at connect and never mutated.
  for (const [name, nsp] of [
    ['/master', master],
    ['/b', player],
    ['/y', board],
    ['/p', projector],
  ] as const) {
    nsp.use((socket, next) => {
      const decision = decideHandshake(sessions, {
        namespace: name,
        headers: socket.handshake.headers as Record<string, unknown>,
        now: now(),
      });
      if (decision.reject) return next(new Error('NOT_MASTER'));
      const data = socket.data as SocketData;
      data.master = decision.master;
      data.viewer = decision.viewer;
      next();
    });
  }

  master.on('connection', (socket) => attachMaster(socket, deps));

  // `/b` is the one player-driven surface (spec §6.3): bingo's `route`, and
  // nothing else. Players fill their own cells, so this namespace cannot be
  // subscribe-only the way `/y` and `/p` are.
  player.on('connection', (socket) => {
    void socket.join(ROOM.game('bingo'));
    sendSummary(socket, registry);
    // Initial projection on connect, exactly as the board does below: a phone
    // opening the card must see the current counts and (after join) its own
    // fills without waiting for its first action.
    pushState(socket, 'bingo', registry);
    attachPlayer(socket, deps);
  });

  // Subscribe-only namespaces. No `socket.on(...)` beyond joining a room —
  // there is nothing here to drive.
  board.on('connection', (socket) => {
    void socket.join(ROOM.game('yutnori'));
    sendSummary(socket, registry);
    pushState(socket, 'yutnori', registry);
  });
  projector.on('connection', (socket) => {
    for (const id of GAME_IDS) void socket.join(ROOM.game(id));
    void socket.join(ROOM.projector);
    sendSummary(socket, registry);
    // Both games' initial views on connect, so the switcher can show either the
    // instant it loads (the board and console do the same).
    for (const id of GAME_IDS) pushState(socket, id, registry);
  });

  void dispatch; // used by attachMaster below
}

/**
 * Bingo players, on `/b`.
 *
 * Identity is adopted here rather than at the handshake: a phone opening the
 * link has nothing to present yet. The host issues `playerId` on first join
 * (req §13) and the client keeps it in `localStorage`; possession is identity
 * thereafter, which is the documented model for a church icebreaker (§4.3).
 */
function attachPlayer(socket: Socket, deps: NamespaceDeps): void {
  const { registry, dispatch, now } = deps;
  const players = deps.playerSockets;
  const buckets = deps.buckets ?? (deps.buckets = createBucketRegistry());
  const data = socket.data as SocketData;

  const reply = (ack: unknown, value: unknown) => {
    if (typeof ack === 'function') (ack as (v: unknown) => void)(value);
  };

  // Kahoot-style reactions: a phone taps an emoji and it floats up on the
  // projector. Ephemeral — no state, no persistence, no identity needed — so it
  // is a plain relay to `/p`, lightly throttled against spam. Not a game emit.
  let lastReactAt = 0;
  socket.on('react', (payload: unknown) => {
    const at = now();
    if (at - lastReactAt < 700) return; // per-phone: ~1.4/sec
    const p = payload as { emoji?: unknown; name?: unknown } | null;
    if (typeof p?.emoji !== 'string' || !REACTION_EMOJI.has(p.emoji)) return;
    if (!reactionAllowed(at)) return; // global anti-flood cap
    lastReactAt = at;
    const name = typeof p.name === 'string' ? p.name.trim().slice(0, 20) : '';
    deps.io.of('/p').emit('reaction', { emoji: p.emoji, name });
  });

  const adopt = (playerId: string): void => {
    data.viewer = { kind: 'player', playerId };
    players?.set(playerId, socket);
  };

  socket.onAny((ev: string, payload: unknown, ack: unknown) => {
    // Identity first: `route` needs a playerId before it can build an action.
    if (ev === 'room:join' && (data.viewer.kind !== 'player' || !data.viewer.playerId)) {
      adopt(randomUUID());
    } else if (ev === 'room:rejoin') {
      const claimed = (payload as { playerId?: unknown } | null)?.playerId;
      if (typeof claimed === 'string' && claimed.length > 0) adopt(claimed);
    }

    const viewer = data.viewer;
    if (viewer.kind !== 'player' || !viewer.playerId) {
      const err = new HostError('BAD_PAYLOAD', '먼저 입장해주세요');
      reply(ack, { ok: false, error: toWireError(err) });
      return;
    }

    // Silent drop with a hint, never an error reply — see tokenbucket.ts.
    const at = now();
    if (!buckets.for(socket.id).take(at)) {
      reply(ack, { ok: false, throttled: true, retryAfterMs: buckets.for(socket.id).retryAfterMs(at) });
      return;
    }

    const action = registry.modules.bingo.route(ev, payload, viewer);
    if (!action) {
      reply(ack, { ok: false, error: { code: 'UNKNOWN_EVENT', message: '알 수 없는 요청이에요' } });
      return;
    }

    // A phone can (re)connect and act before the master has opened an event — a
    // reconnecting tab replays `room:rejoin` on its own. Answer, never throw: an
    // uncaught throw here crashes the whole process (both games).
    const current = registry.current();
    if (!current || current.closedAt !== null) {
      reply(ack, { ok: false, error: toWireError(new HostError('NO_EVENT', '아직 행사가 없어요')) });
      return;
    }
    const before = registry.modules.bingo.lifecycle(current.games.bingo.state);
    dispatch('bingo', action, viewer)
      .then((result) => {
        pushStateAll(
          deps.io,
          'bingo',
          registry,
          result.state !== before || registry.modules.bingo.liveProjection
            ? 'everyone'
            : 'controls',
        );
        // The acting player always gets their own picture back.
        pushState(socket, 'bingo', registry);
        reply(ack, { ok: true, playerId: viewer.playerId, state: result.state });
      })
      .catch((err: unknown) => {
        // Back to the originating socket only (spec §6.2).
        reply(ack, { ok: false, error: toWireError(err) });
        socket.emit('error', toWireError(err));
      });
  });

  socket.on('disconnect', () => {
    buckets.drop(socket.id);
    const viewer = data.viewer;
    if (viewer.kind !== 'player' || !viewer.playerId) return;
    // Only forget the socket if it is still the one registered — a reconnect
    // that raced ahead of this event must not be unregistered by it.
    if (players?.get(viewer.playerId) === socket) players.delete(viewer.playerId);
    // A disconnect never deletes the player: their fills stand and they stay
    // nameable on other cards (bingo §7.4). Illegal in SETUP, hence the catch.
    void dispatch('bingo', { t: 'DISCONNECT', playerId: viewer.playerId }, viewer).catch(() => {});
  });
}

/**
 * Send one socket its projected view (spec §3.3, §6.2).
 *
 * `project` is per-viewer, so this cannot be a broadcast — which is exactly why
 * it is **not** sent per action. Granular emits keep a client in sync during
 * play; the full picture goes out only on join and on a lifecycle transition,
 * which is what both games' protocol tables mean by "on transition only".
 */
export function pushState(socket: Socket, gameId: GameId, registry: Registry): void {
  const event = registry.current();
  if (!event) return;
  const module = registry.modules[gameId];
  const viewer = (socket.data as SocketData).viewer;
  // Tagged with its game: one console socket mirrors both, and the payload
  // itself carries nothing that identifies which game produced it.
  socket.emit(STATE_EVENT, { gameId, view: module.project(event.games[gameId].state, viewer) });
}

/**
 * Re-project to the screens watching one game.
 *
 * `scope: 'controls'` reaches the console and the projector — a handful of
 * screens, refreshed after every action so counts and clocks stay honest.
 * `scope: 'everyone'` additionally reaches the crowd on `/b` or `/y`, and is
 * used on a lifecycle transition, or after every action for a game whose
 * module sets `liveProjection` (spec §6.4).
 *
 * The split is the whole reason bingo can have a live console while 100 phones
 * are not sent 8,100 projections.
 */
export function pushStateAll(
  io: Server,
  gameId: GameId,
  registry: Registry,
  scope: 'controls' | 'everyone' = 'everyone',
): void {
  const namespaces = scope === 'everyone' ? ['/b', '/y', '/p', '/master'] : ['/p', '/master'];
  for (const ns of namespaces) {
    for (const socket of io.of(ns).sockets.values()) {
      if (socket.rooms.has(ROOM.game(gameId))) pushState(socket, gameId, registry);
    }
  }
}

function sendSummary(socket: Socket, registry: Registry): void {
  const event = registry.current();
  socket.emit('event:summary', event ? summarize(event, registry.modules) : null);
}

function attachMaster(socket: Socket, deps: NamespaceDeps): void {
  const { registry, dispatch, now } = deps;
  void socket.join(ROOM.master);
  for (const id of GAME_IDS) void socket.join(ROOM.game(id));
  sendSummary(socket, registry);
  // The console must have each game's view the instant it connects — otherwise
  // the yutnori pane (setup form, throw pad, move picker) and the bingo pane sit
  // blank until the master happens to act, which they cannot do without it. The
  // board on `/y` already pushes on connect; the console was the one surface
  // that did not.
  for (const id of GAME_IDS) pushState(socket, id, registry);

  const reply = (ack: unknown, value: unknown) => {
    if (typeof ack === 'function') (ack as (v: unknown) => void)(value);
  };

  /** Host ops — event-level, not game-level. Not routed to any module. */
  socket.on('event:create', (payload: unknown, ack: unknown) => {
    try {
      const title = String((payload as { title?: unknown })?.title ?? '').trim();
      if (!title) throw new HostError('BAD_PAYLOAD', '행사 이름을 입력해주세요');
      const event = registry.open({ title, now: now() });
      broadcastSummary(deps);
      // Push the new event's game views to every surface — the console needs
      // them to render each pane's setup form; without this it hangs on
      // "불러오는 중…" because a fresh master connected before the event existed.
      for (const id of GAME_IDS) pushStateAll(deps.io, id, registry, 'everyone');
      reply(ack, { ok: true, event: summarize(event, registry.modules) });
    } catch (err) {
      reply(ack, { ok: false, error: toWireError(err) });
      socket.emit('error', toWireError(err));
    }
  });

  socket.on('projector:set', (payload: unknown, ack: unknown) => {
    try {
      const value = (payload as { setting?: unknown })?.setting;
      if (value !== 'auto' && !isGameId(value)) throw new HostError('BAD_PAYLOAD');
      const event = registry.require();
      event.projector = value;
      // A manual switch is the operator taking control — it releases any reveal
      // lock, so after a 순위 발표 they can move the screen to the other game
      // (e.g. on to 윷놀이) WITHOUT a 다시 하기 that would kick the players.
      event.projectorLock = null;
      broadcastSummary(deps);
      reply(ack, { ok: true });
    } catch (err) {
      reply(ack, { ok: false, error: toWireError(err) });
      socket.emit('error', toWireError(err));
    }
  });

  socket.on('game:enable', (payload: unknown, ack: unknown) => {
    try {
      const { gameId, enabled } = (payload ?? {}) as { gameId?: unknown; enabled?: unknown };
      if (!isGameId(gameId) || typeof enabled !== 'boolean') throw new HostError('BAD_PAYLOAD');
      registry.require().games[gameId].enabled = enabled;
      broadcastSummary(deps);
      reply(ack, { ok: true });
    } catch (err) {
      reply(ack, { ok: false, error: toWireError(err) });
      socket.emit('error', toWireError(err));
    }
  });

  /** Reset one game back to a fresh SETUP — "다시 하기", keeping the event and the
   *  sibling game untouched. */
  socket.on('game:reset', (payload: unknown, ack: unknown) => {
    try {
      const gameId = (payload as { gameId?: unknown } | null)?.gameId;
      if (!isGameId(gameId)) throw new HostError('BAD_PAYLOAD', '어느 게임인지 지정해주세요');
      const event = registry.require();
      const at = now();
      const fresh = registry.modules[gameId].create(event.id, at);
      registry.commit(gameId, fresh);
      if (event.projectorLock === gameId) event.projectorLock = null;
      deps.persistence?.enqueue({ gameId, state: fresh, action: { t: 'RESET' }, emits: [], at });
      broadcastSummary(deps);
      pushStateAll(deps.io, gameId, registry, 'everyone');
      // Bounce connected bingo phones out of their now-orphaned card back to the
      // waiting screen, so 다시 하기 leaves no lingering (or offline) players.
      if (gameId === 'bingo') deps.io.of('/b').emit('room:reset');
      reply(ack, { ok: true });
    } catch (err) {
      reply(ack, { ok: false, error: toWireError(err) });
      socket.emit('error', toWireError(err));
    }
  });

  /** Reset the whole event — "새 행사". Closes the current one (so a restart will
   *  not recover it) and returns to the create screen. */
  socket.on('event:reset', (_payload: unknown, ack: unknown) => {
    try {
      const current = registry.current();
      if (current) {
        current.closedAt = now();
        deps.persistence?.closeEvent?.(current);
      }
      registry.clear();
      broadcastSummary(deps); // now null everywhere
      reply(ack, { ok: true });
    } catch (err) {
      reply(ack, { ok: false, error: toWireError(err) });
      socket.emit('error', toWireError(err));
    }
  });

  /**
   * Everything else is a game action, and on `/master` it must say **which**
   * game.
   *
   * Both games' protocol tables use `master:start`, `master:end` and
   * `master:reveal` (bingo §10, yutnori §12). On a per-game console those names
   * were unambiguous; on one console driving two games they are not, so every
   * `/master` action carries `gameId` and the host consults that module alone.
   * On `/b` and `/y` the namespace already names the game, so nothing changes
   * there — and neither game's own event names had to be renamed.
   */
  socket.onAny((ev: string, payload: unknown, ack: unknown) => {
    if (ev.startsWith('event:') || ev.startsWith('projector:') || ev.startsWith('game:')) return;

    const viewer = (socket.data as SocketData).viewer;
    const gameId = (payload as { gameId?: unknown } | null)?.gameId;

    if (!isGameId(gameId)) {
      const err = new HostError('BAD_PAYLOAD', '어느 게임인지 지정해주세요');
      reply(ack, { ok: false, error: toWireError(err) });
      socket.emit('error', toWireError(err));
      return;
    }

    const action = registry.modules[gameId].route(ev, payload, viewer);
    if (!action) {
      reply(ack, { ok: false, error: { code: 'UNKNOWN_EVENT', message: '알 수 없는 요청이에요' } });
      return;
    }

    // Answer, never throw, if there is no open event yet (a reconnecting console
    // could act before `event:create`): an uncaught throw crashes the process.
    const current = registry.current();
    if (!current || current.closedAt !== null) {
      const err = new HostError('NO_EVENT', '아직 행사가 없어요');
      reply(ack, { ok: false, error: toWireError(err) });
      return;
    }
    const before = registry.modules[gameId].lifecycle(current.games[gameId].state);
    dispatch(gameId, action, viewer)
      .then((result) => {
        broadcastSummary(deps);
        // A transition (START deals, END freezes, REVEAL advances) always
        // reaches everyone. Otherwise the crowd is included only for a game
        // that can afford it — 윷놀이 can, bingo cannot (spec §6.4).
        pushStateAll(
          deps.io,
          gameId,
          registry,
          result.state !== before || registry.modules[gameId].liveProjection
            ? 'everyone'
            : 'controls',
        );
        reply(ack, { ok: true, gameId, state: result.state });
      })
      .catch((err: unknown) => {
        // `error` goes back only to the socket that sent the action
        // (spec §6.2): a bad tap on the phone must not raise a banner on the
        // projector-attached laptop.
        reply(ack, { ok: false, error: toWireError(err) });
        socket.emit('error', toWireError(err));
      });
  });
}

function broadcastSummary(deps: NamespaceDeps): void {
  const event = deps.registry.current();
  const summary = event ? summarize(event, deps.registry.modules) : null;
  for (const name of ['/master', '/b', '/y', '/p']) {
    deps.io.of(name).emit('event:summary', summary);
  }
}

/**
 * The only place in the codebase permitted to call `io.to(...)` (spec §6.2).
 * An exhaustive switch over the audience: adding a token without handling it
 * here is a compile error.
 */
export function createRouter(io: Server, playerSocketOf: (id: string) => Socket | undefined) {
  return function route(gameId: GameId, emits: readonly Emit[], at: number): void {
    for (const emit of emits) {
      const data = { ...(emit.data as object), serverNow: at };
      switch (emit.to) {
        case 'player':
          playerSocketOf(emit.playerId)?.emit(emit.ev, data);
          break;
        case 'room':
          io.of('/b').to(ROOM.game(gameId)).emit(emit.ev, data);
          io.of('/y').to(ROOM.game(gameId)).emit(emit.ev, data);
          io.of('/p').to(ROOM.game(gameId)).emit(emit.ev, data);
          io.of('/master').to(ROOM.game(gameId)).emit(emit.ev, data);
          break;
        case 'master':
          io.of('/master').to(ROOM.master).emit(emit.ev, data);
          break;
        case 'projector':
          io.of('/p').to(ROOM.projector).emit(emit.ev, data);
          break;
        default: {
          const never: never = emit;
          throw new Error(`unrouted audience: ${JSON.stringify(never)}`);
        }
      }
    }
  };
}

export type Router = ReturnType<typeof createRouter>;
export type { Namespace };
