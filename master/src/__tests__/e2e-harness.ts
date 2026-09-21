/**
 * A reusable real-socket harness for multi-user / cross-game integration tests.
 *
 * It boots the real host in-process (one SQLite `:memory:` file, both real game
 * modules), and hands back the same connect/send/once helpers the per-game
 * e2e specs use — but bound to a per-test lifecycle and with a controllable
 * clock, so a test can skip time to force 윷놀이's expiry (spec §5.4).
 */
import { io as ioClient, type Socket } from 'socket.io-client';
import { createHost, type Host } from '../host/server.js';
import { hashPasscode } from '../identity/passcode.js';
import { loadConfig } from '../config.js';
import { COOKIE_NAME } from '../identity/session.js';
import { bingoModule } from '@soonot/bingo/src/module.js';
import { yutnoriModule } from '@soonot/yutnori/src/module.js';

export const PASSCODE = 'harness2026';

export interface Harness {
  base: string;
  host: Host;
  /** Advance the injected server clock by `ms` (for time-skip simulations). */
  advance(ms: number): void;
  now(): number;
  masterSocket(): Promise<Socket>;
  playerSocket(): Promise<Socket>;
  boardSocket(): Promise<Socket>;
  projectorSocket(): Promise<Socket>;
  send(s: Socket, ev: string, payload?: unknown): Promise<any>;
  once(s: Socket, ev: string, ms?: number): Promise<any>;
  cleanup(): Promise<void>;
}

export async function boot(opts: { autoTick?: boolean; startAt?: number } = {}): Promise<Harness> {
  let clock = opts.startAt ?? 1_700_000_000_000;
  const sockets: Socket[] = [];

  const host = createHost({
    config: { ...loadConfig({}), production: false, tls: false, dbPath: ':memory:' },
    passcodeHash: hashPasscode(PASSCODE),
    modules: { bingo: bingoModule, yutnori: yutnoriModule },
    now: () => clock,
    autoTick: opts.autoTick ?? false,
  });
  const port = await host.listen(0);
  const base = `http://127.0.0.1:${port}`;

  const track = (s: Socket) => {
    sockets.push(s);
    return s;
  };
  const awaitConnect = (s: Socket) => new Promise<Socket>((r) => s.on('connect', () => r(s)));

  return {
    base,
    host,
    now: () => clock,
    advance(ms) {
      clock += ms;
    },
    async masterSocket() {
      const res = await fetch(`${base}/master/auth`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passcode: PASSCODE }),
      });
      const token = res.headers.get('set-cookie')?.match(new RegExp(`${COOKIE_NAME}=([^;]*)`))?.[1];
      return awaitConnect(
        track(ioClient(`${base}/master`, { transports: ['websocket'], extraHeaders: { cookie: `${COOKIE_NAME}=${token}` } })),
      );
    },
    playerSocket() {
      return awaitConnect(track(ioClient(`${base}/b`, { transports: ['websocket'] })));
    },
    boardSocket() {
      return awaitConnect(track(ioClient(`${base}/y`, { transports: ['websocket'] })));
    },
    projectorSocket() {
      return awaitConnect(track(ioClient(`${base}/p`, { transports: ['websocket'] })));
    },
    send(s, ev, payload) {
      return new Promise((resolve) => s.emit(ev, payload, resolve));
    },
    once(s, ev, ms = 3000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout waiting for ${ev}`)), ms);
        s.once(ev, (d: unknown) => {
          clearTimeout(timer);
          resolve(d);
        });
      });
    },
    async cleanup() {
      for (const s of sockets.splice(0)) s.close();
      await host.close();
    },
  };
}
