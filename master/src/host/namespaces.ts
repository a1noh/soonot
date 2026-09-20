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
import { HostError, toWireError } from './errors.js';
import type { Viewer } from './module.js';
import type { Sessions } from '../identity/session.js';
import { decideHandshake } from '../identity/guard.js';

export interface SocketData {
  master: boolean;
  viewer: Viewer;
}

export interface NamespaceDeps {
  io: Server;
  registry: Registry;
  dispatch: Dispatch;
  sessions: Sessions;
  now: () => number;
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

  // Subscribe-only namespaces. No `socket.on(...)` beyond joining a room —
  // there is nothing here to drive.
  player.on('connection', (socket) => {
    for (const id of GAME_IDS) if (id === 'bingo') void socket.join(ROOM.game(id));
    sendSummary(socket, registry);
  });
  board.on('connection', (socket) => {
    void socket.join(ROOM.game('yutnori'));
    sendSummary(socket, registry);
  });
  projector.on('connection', (socket) => {
    for (const id of GAME_IDS) void socket.join(ROOM.game(id));
    void socket.join(ROOM.projector);
    sendSummary(socket, registry);
  });

  void dispatch; // used by attachMaster below
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
      registry.require().projector = value;
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

    dispatch(gameId, action, viewer)
      .then((result) => {
        broadcastSummary(deps);
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
