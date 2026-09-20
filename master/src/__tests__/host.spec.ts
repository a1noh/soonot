/**
 * Milestone 2's acceptance, end to end (spec §13):
 * **sign in once; two empty panes; sign-out rotates.**
 *
 * Drives the real Express + Socket.IO host over a real port with real cookies.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { createHost, type Host } from '../host/server.js';
import { hashPasscode } from '../identity/passcode.js';
import { loadConfig } from '../config.js';
import { createStubModule } from './stub-module.js';
import { COOKIE_NAME } from '../identity/session.js';
import { summarize, type EventSummary } from '../event/event.js';

const PASSCODE = '은혜로운2026';

let host: Host | null = null;
const sockets: Socket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await host?.close();
  host = null;
});

async function boot() {
  host = createHost({
    config: { ...loadConfig({}), production: false, tls: false, dbPath: ':memory:' },
    passcodeHash: hashPasscode(PASSCODE),
    modules: { bingo: createStubModule('bingo'), yutnori: createStubModule('yutnori') },
  });
  const port = await host.listen(0);
  return { host: host!, base: `http://127.0.0.1:${port}`, port };
}

async function signIn(base: string, passcode = PASSCODE) {
  const res = await fetch(`${base}/master/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  const setCookie = res.headers.get('set-cookie');
  const token = setCookie?.match(new RegExp(`${COOKIE_NAME}=([^;]*)`))?.[1] ?? null;
  return { status: res.status, token };
}

type Wired = Socket & { firstSummary: Promise<EventSummary | null> };

function connect(base: string, namespace: string, token?: string): Promise<Wired> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`${base}${namespace}`, {
      transports: ['websocket'],
      extraHeaders: token ? { cookie: `${COOKIE_NAME}=${token}` } : {},
      reconnection: false,
    }) as Wired;
    sockets.push(socket);
    // The server sends `event:summary` from its `connection` handler, so the
    // listener has to exist before the handshake completes. A real client does
    // this naturally (handlers are attached at `io()` time); a test that waits
    // for `connect` first would race it.
    socket.firstSummary = new Promise((res) => socket.once('event:summary', res));
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

function once<T>(socket: Socket, ev: string): Promise<T> {
  return new Promise((resolve) => socket.once(ev, resolve as (v: unknown) => void));
}

function emit(
  socket: Socket,
  ev: string,
  payload: unknown,
): Promise<{ ok: boolean; error?: { code: string } }> {
  return new Promise((resolve) => socket.emit(ev, payload, resolve));
}

describe('sign in once', () => {
  it('accepts the passcode and issues an HttpOnly session cookie', async () => {
    const { base } = await boot();
    const res = await fetch(`${base}/master/auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passcode: PASSCODE }),
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('rejects the wrong passcode with one generic 401', async () => {
    const { base } = await boot();
    const res = await fetch(`${base}/master/auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passcode: 'wrong' }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false });
  });

  it('reports the session back, so a reload needs no passcode', async () => {
    const { base } = await boot();
    const { token } = await signIn(base);
    const res = await fetch(`${base}/master/session`, {
      headers: { cookie: `${COOKIE_NAME}=${token}` },
    });
    expect((await res.json()).ok).toBe(true);

    const anon = await fetch(`${base}/master/session`);
    expect((await anon.json()).ok).toBe(false);
  });

  it('opens the /master socket with the cookie and refuses it without', async () => {
    const { base } = await boot();
    const { token } = await signIn(base);

    const master = await connect(base, '/master', token!);
    expect(master.connected).toBe(true);

    await expect(connect(base, '/master')).rejects.toThrow(/NOT_MASTER/);
  });

  it('drives BOTH games from the one sign-in', async () => {
    // req §3.3 — one session, every game. There is nothing further to unlock.
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);
    await emit(master, 'event:create', { title: '한마당' });

    for (const gameId of ['bingo', 'yutnori'] as const) {
      expect((await emit(master, 'master:setup', { gameId, entrants: 4 })).ok).toBe(true);
      expect((await emit(master, 'master:start', { gameId })).ok).toBe(true);
    }

    // Read the committed state rather than waiting for another broadcast — the
    // summaries for those four actions have already gone out.
    const summary = summarize(host!.registry.require(), host!.registry.modules);
    expect(summary.games.bingo.state).toBe('RUNNING');
    expect(summary.games.yutnori.state).toBe('RUNNING');
  });

  it('requires a game action to name its game', async () => {
    // Both protocol tables use `master:start`; on one console that is ambiguous.
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);
    await emit(master, 'event:create', { title: 'x' });

    const ack = await emit(master, 'master:setup', { entrants: 4 });
    expect(ack.ok).toBe(false);
    expect(ack.error?.code).toBe('BAD_PAYLOAD');
  });

  it('runs both games at once, on independent locks', async () => {
    // req §5.1 — bingo in the background while yutnori is on stage.
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);
    await emit(master, 'event:create', { title: 'x' });

    for (const gameId of ['bingo', 'yutnori'] as const) {
      await emit(master, 'master:setup', { gameId, entrants: 4 });
      await emit(master, 'master:start', { gameId });
    }

    await Promise.all([
      ...Array.from({ length: 10 }, () => emit(master, 'master:poke', { gameId: 'bingo' })),
      ...Array.from({ length: 10 }, () => emit(master, 'master:poke', { gameId: 'yutnori' })),
    ]);

    const games = host!.registry.require().games;
    expect((games.bingo.state as { pokes: number }).pokes).toBe(10);
    expect((games.yutnori.state as { pokes: number }).pokes).toBe(10);
  });
});

describe('two empty panes', () => {
  it('creates one event holding both games in SETUP', async () => {
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);

    const ack = (await emit(master, 'event:create', { title: '2026 가을 교회 한마당' })) as {
      ok: boolean;
      event: EventSummary;
    };

    expect(ack.ok).toBe(true);
    expect(ack.event.code).toMatch(/^[A-HJ-NP-Z]{4}$/); // no I, no O
    expect(ack.event.title).toBe('2026 가을 교회 한마당');
    expect(ack.event.games.bingo.state).toBe('SETUP');
    expect(ack.event.games.yutnori.state).toBe('SETUP');
    expect(ack.event.projector).toBe('auto');
  });

  it('switches the projector channel from the console', async () => {
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);
    await emit(master, 'event:create', { title: 'x' });

    const updated = once<EventSummary>(master, 'event:summary');
    await emit(master, 'projector:set', { setting: 'yutnori' });
    expect((await updated).projector).toBe('yutnori');

    expect((await emit(master, 'projector:set', { setting: 'nope' })).ok).toBe(false);
  });

  it('hides a game the event will not play tonight', async () => {
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);
    await emit(master, 'event:create', { title: 'x' });

    const updated = once<EventSummary>(master, 'event:summary');
    await emit(master, 'game:enable', { gameId: 'bingo', enabled: false });
    expect((await updated).games.bingo.enabled).toBe(false);
  });
});

describe('the read-only surfaces', () => {
  it('lets the projector connect with no session at all', async () => {
    const { base } = await boot();
    const projector = await connect(base, '/p');
    expect(projector.connected).toBe(true);
    expect(await projector.firstSummary).toBeNull();
  });

  it('registers no handlers a spectator could drive', async () => {
    // req §8 / spec §6.3 — a namespace with no handlers cannot be driven, which
    // is stronger than one whose handlers check a flag.
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);
    await emit(master, 'event:create', { title: 'x' });
    await emit(master, 'master:setup', { gameId: 'bingo', entrants: 9 });

    // Even holding a valid master cookie, the projector namespace does nothing.
    const projector = await connect(base, '/p', token!);
    const before = host!.registry.require().games.bingo.state;
    projector.emit('master:start', { gameId: 'bingo' });
    await new Promise((r) => setTimeout(r, 80));
    expect(host!.registry.require().games.bingo.state).toBe(before);
  });
});

describe('sign-out rotates', () => {
  it('invalidates every device when signing out everywhere', async () => {
    // req §3.4 — the laptop and the phone are both signed in; `모든 기기에서
    // 로그아웃` drops both.
    const { base } = await boot();
    const laptop = await signIn(base);
    const phone = await signIn(base);

    const stillValid = async (token: string) =>
      (await (await fetch(`${base}/master/session`, { headers: { cookie: `${COOKIE_NAME}=${token}` } })).json()).ok;

    expect(await stillValid(laptop.token!)).toBe(true);
    expect(await stillValid(phone.token!)).toBe(true);

    await fetch(`${base}/master/signout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `${COOKIE_NAME}=${laptop.token}` },
      body: JSON.stringify({ everywhere: true }),
    });

    expect(await stillValid(laptop.token!)).toBe(false);
    expect(await stillValid(phone.token!)).toBe(false);
  });

  it('leaves the other device signed in on a plain sign-out', async () => {
    const { base } = await boot();
    const laptop = await signIn(base);
    const phone = await signIn(base);

    await fetch(`${base}/master/signout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `${COOKIE_NAME}=${laptop.token}` },
      body: JSON.stringify({ everywhere: false }),
    });

    const res = await fetch(`${base}/master/session`, {
      headers: { cookie: `${COOKIE_NAME}=${phone.token}` },
    });
    expect((await res.json()).ok).toBe(true);
  });

  it('disconnects open master sockets when rotating', async () => {
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);

    const gone = new Promise<void>((resolve) => master.on('disconnect', () => resolve()));
    await fetch(`${base}/master/signout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ everywhere: true }),
    });
    await gone;
    expect(master.connected).toBe(false);
  });
});
