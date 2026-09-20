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
import { attachNamespaces, createRouter } from './namespaces.js';
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

  attachNamespaces({ io, registry, dispatch, sessions, now, playerSockets });

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
    app.get('/master', (_req: Request, res: Response) => {
      res.sendFile(join(clientDir, 'master.html'));
    });
    // The 윷놀이 board surface. `/y/:code` and bare `/y` both land here — the
    // code is cosmetic on a read-only screen, and one active event is the v1
    // scope (req §1).
    app.get(['/y', '/y/:code'], (_req: Request, res: Response) => {
      res.sendFile(join(clientDir, 'board.html'));
    });
  } else {
    const unbuilt = (_req: Request, res: Response) => {
      res
        .status(503)
        .type('text/plain')
        .send('Client not built. Run `npm run build`, or `npm run dev` for the Vite server.');
    };
    app.get('/master', unbuilt);
    app.get(['/y', '/y/:code'], unbuilt);
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
      persistence.dispose?.() ?? persistence.flush();
      opened?.close();
      return new Promise<void>((resolve) => {
        io.close(() => http.close(() => resolve()));
      });
    },
  };
}
