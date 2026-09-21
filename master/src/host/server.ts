/**
 * Express + Socket.IO bootstrap (spec §2, §12).
 *
 * One process, one port: the HTTP surface, the four socket namespaces and the
 * built client assets all live here. One command, one thing to plug in.
 */

import { createServer, type Server as HttpServer } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type Request, type Response } from 'express';
import { Server as IOServer } from 'socket.io';
import type { GameId } from '../shared/lifecycle.js';
import type { AnyGameModule } from './module.js';
import { createRegistry, type Registry } from '../event/registry.js';
import { createDispatch, type Dispatch } from './dispatch.js';
import { type Persistence } from './persist/strategy.js';
import { openDb, type OpenedDb } from './persist/db.js';
import { createSqlitePersistence } from './persist/persistence.js';
import { recoverEvent, writeEventRow } from './persist/recover.js';
import { attachNamespaces, createRouter, pushStateAll } from './namespaces.js';
import { GAME_IDS } from '../shared/lifecycle.js';
import { createSessions, createMemorySecretStore, sessionCookie, clearedCookie, type Sessions } from '../identity/session.js';
import { verifyPasscode } from '../identity/passcode.js';
import { createAttemptLimiter } from '../identity/ratelimit.js';
import { cookieOf } from '../identity/guard.js';
import type { Config } from '../config.js';

export interface Host {
  app: Express;
  http: HttpServer;
  io: IOServer;
  registry: Registry;
  dispatch: Dispatch;
  sessions: Sessions;
  persistence: Persistence;
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
}

export interface HostOptions {
  config: Config;
  modules: Readonly<Record<GameId, AnyGameModule>>;
  passcodeHash: string;
  persistence?: Persistence;
  now?: () => number;
  /**
   * Run the shared 1 Hz clock (spec §7). Off by default so tests drive time
   * deterministically; the real process (`index.server.ts`) turns it on. Games
   * opt in per module via `ticks` — only 윷놀이 does.
   */
  autoTick?: boolean;
}

export function createHost(options: HostOptions): Host {
  const { config, modules, passcodeHash } = options;
  const now = options.now ?? (() => Date.now());

  // One SQLite file for the whole host (spec §8.1). Each game contributes its
  // own schema; the host owns the connection, the WAL and the write order.
  const opened: OpenedDb | null = options.persistence
    ? null
    : openDb(
        config.dbPath,
        Object.values(modules).map((m) => m.persistence.schema),
      );

  const app = express();
  app.use(express.json({ limit: '32kb' }));

  const http = createServer(app);
  const io = new IOServer(http, {
    // Bad church wifi never upgrades some clients; 100 stuck pollers are still
    // fine (bingo §16.5). Jittered backoff is the client's side of this.
    transports: ['websocket', 'polling'],
  });

  const sessions = createSessions(createMemorySecretStore(config.sessionSecret ?? undefined));
  const registry = createRegistry(modules);

  const persistence: Persistence =
    options.persistence ??
    createSqlitePersistence({
      db: opened!.db,
      modules,
      event: () => registry.current(),
      now,
    });

  // Recovery, before a single socket is accepted: a client that reconnects
  // into a half-restored host would see a game that never existed (spec §8.4).
  if (opened) {
    const restored = recoverEvent(opened.db, modules, now());
    if (restored) {
      registry.adopt(restored);
      // eslint-disable-next-line no-console
      console.log(`[master] recovered event ${restored.code} — ${restored.title}`);
    }
  }

  const playerSockets = new Map<string, import('socket.io').Socket>();
  const router = createRouter(io, (id) => playerSockets.get(id));

  const dispatch = createDispatch({
    registry,
    persistence,
    now,
    deliver: (gameId, emits, at) => router(gameId, emits, at),
    checkInvariants: !config.production,
  });

  attachNamespaces({ io, registry, dispatch, sessions, persistence, now, playerSockets });

  // The shared 1 Hz clock (spec §7). Re-projecting each second is what actually
  // moves the countdown on the board and console; dispatching TICK is what lets
  // a game end itself on time expiry. Only modules with `ticks` participate
  // (윷놀이 opts in, bingo opts out), and only while a game is RUNNING. TICK is
  // a no-op until expiry, so this never grows the event log.
  let ticker: ReturnType<typeof setInterval> | null = null;
  if (options.autoTick) {
    ticker = setInterval(() => {
      const event = registry.current();
      if (!event || event.closedAt !== null) return;
      for (const gameId of GAME_IDS) {
        const module = modules[gameId];
        if (!module.ticks) continue;
        const handle = event.games[gameId];
        if (!handle.enabled) continue;
        if (module.lifecycle(handle.state) !== 'RUNNING') continue;
        dispatch(gameId, { t: 'TICK' } as never, { kind: 'master' })
          .then(() => {
            pushStateAll(io, gameId, registry, module.liveProjection ? 'everyone' : 'controls');
          })
          .catch(() => {
            /* a tick that races a shutdown or a lost event is harmless */
          });
      }
    }, 1000);
    if (typeof ticker.unref === 'function') ticker.unref();
  }

  // ---- Identity routes (spec §4.2) ------------------------------------------
  const limiter = createAttemptLimiter();
  const cookieOpts = { secure: config.tls };

  app.post('/master/auth', (req: Request, res: Response) => {
    const at = now();
    const key = req.ip ?? 'unknown';

    const gate = limiter.check(key, at);
    if (!gate.ok) {
      res.status(429).json({ ok: false, retryAfterMs: gate.retryAfterMs });
      return;
    }

    const passcode = String((req.body as { passcode?: unknown })?.passcode ?? '');
    if (!passcode || !verifyPasscode(passcode, passcodeHash)) {
      limiter.fail(key, at);
      // One generic message; failures are never distinguished (spec §4.2).
      res.status(401).json({ ok: false });
      return;
    }

    limiter.succeed(key);
    res.setHeader('Set-Cookie', sessionCookie(sessions.issue(at), cookieOpts));
    res.json({ ok: true });
  });

  /** Lets the console skip the sign-in screen on reload with zero input (req §12). */
  app.get('/master/session', (req: Request, res: Response) => {
    const payload = sessions.verify(cookieOf(req.headers as Record<string, unknown>), now());
    res.json({ ok: payload !== null, expiresAt: payload?.exp ?? null });
  });

  app.post('/master/signout', (req: Request, res: Response) => {
    const everywhere = (req.body as { everywhere?: unknown })?.everywhere === true;
    if (everywhere) {
      // `모든 기기에서 로그아웃` — rotating the secret invalidates every
      // outstanding token at once (req §3.4).
      sessions.rotate();
      io.of('/master').disconnectSockets();
    }
    res.setHeader('Set-Cookie', clearedCookie(cookieOpts));
    res.json({ ok: true, everywhere });
  });

  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ ok: true, event: registry.current()?.code ?? null });
  });

  // ---- Static surfaces (spec §2, §9) ---------------------------------------
  // One process serves the API, the sockets and the built client. `/` and
  // `/:code` are plain static assets with no server-rendered data — that is
  // the path ~100 phones hit inside a minute (bingo §16.5).
  const clientDir = fileURLToPath(new URL('../../dist/client/', import.meta.url));
  if (existsSync(clientDir)) {
    app.use('/assets', express.static(join(clientDir, 'assets'), { immutable: true, maxAge: '1y' }));
    // The HTML shells are tiny and reference hashed assets. They must NOT be
    // cached, or a redeploy leaves a phone/projector loading yesterday's bundle
    // (the "I don't see my change" trap). Assets above stay immutable (hashed).
    const html = (file: string) => (_req: Request, res: Response) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(join(clientDir, file));
    };
    app.get('/master', html('master.html'));
    // The projector (spec §9) is now THE presentation screen — it shows the full
    // 윷놀이 board plus the roulette, podium and reactions. `/y` is kept as an
    // alias so old links/bookmarks still land on the same screen.
    app.get(['/p', '/p/:code', '/y', '/y/:code'], html('projector.html'));
    // The bingo player card (bingo §16.5): a static asset ~100 phones hit in a
    // minute. `/b` is the canonical player URL; `/` and `/:code` also land here.
    app.get(['/b', '/', '/:code'], html('player.html'));
  } else {
    const unbuilt = (_req: Request, res: Response) => {
      res
        .status(503)
        .type('text/plain')
        .send('Client not built. Run `npm run build`, or `npm run dev` for the Vite server.');
    };
    app.get('/master', unbuilt);
    app.get(['/y', '/y/:code'], unbuilt);
    app.get(['/p', '/p/:code'], unbuilt);
    app.get(['/b', '/', '/:code'], unbuilt);
  }

  return {
    app,
    http,
    io,
    registry,
    dispatch,
    sessions,
    persistence,
    listen(port = config.port) {
      return new Promise<number>((resolve) => {
        http.listen(port, () => {
          const addr = http.address();
          resolve(typeof addr === 'object' && addr ? addr.port : port);
        });
      });
    },
    close() {
      if (ticker) clearInterval(ticker);
      persistence.dispose?.() ?? persistence.flush();
      opened?.close();
      return new Promise<void>((resolve) => {
        io.close(() => http.close(() => resolve()));
      });
    },
  };
}
