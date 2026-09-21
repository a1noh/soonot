/**
 * Milestone 4's acceptance, end to end: a real bingo game played over real
 * sockets against the real host, with the real module plugged in.
 *
 * This is the test that would have caught `/b` being wired subscribe-only —
 * every engine test passed while the game was unplayable.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { createHost, type Host } from '@soonot/master/src/host/server';
import { hashPasscode } from '@soonot/master/src/identity/passcode';
import { loadConfig } from '@soonot/master/src/config';
import { COOKIE_NAME } from '@soonot/master/src/identity/session';
import { createStubModule } from '@soonot/master/src/__tests__/stub-module';
import { bingoModule } from '../module';
import { LINES } from '../shared/lines';
import { CELLS } from '../shared/constants';

const PASSCODE = '은혜로운2026';
const TRAITS = Array.from({ length: CELLS }, (_, i) => `특징${i}`);

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
    modules: { bingo: bingoModule, yutnori: createStubModule('yutnori') },
  });
  const port = await host.listen(0);
  return `http://127.0.0.1:${port}`;
}

async function masterSocket(base: string) {
  const res = await fetch(`${base}/master/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passcode: PASSCODE }),
  });
  const token = res.headers.get('set-cookie')?.match(new RegExp(`${COOKIE_NAME}=([^;]*)`))?.[1];
  const s = ioClient(`${base}/master`, {
    transports: ['websocket'],
    extraHeaders: { cookie: `${COOKIE_NAME}=${token}` },
  });
  sockets.push(s);
  await new Promise<void>((r) => s.on('connect', () => r()));
  return s;
}

async function playerSocket(base: string) {
  const s = ioClient(`${base}/b`, { transports: ['websocket'] });
  sockets.push(s);
  await new Promise<void>((r) => s.on('connect', () => r()));
  return s;
}

function send(s: Socket, ev: string, payload: unknown): Promise<any> {
  return new Promise((resolve) => s.emit(ev, payload, resolve));
}

/** Wait for one event, with a timeout that fails loudly rather than hanging. */
function once(s: Socket, ev: string, ms = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${ev}`)), ms);
    s.once(ev, (d: unknown) => {
      clearTimeout(timer);
      resolve(d);
    });
  });
}

describe('bingo end to end', () => {
  it('plays a full game: join → start → fill → bingo → reveal', async () => {
    const base = await boot();
    const m = await masterSocket(base);

    expect((await send(m, 'event:create', { title: '청년부 수련회' })).ok).toBe(true);
    expect((await send(m, 'master:setTraits', { gameId: 'bingo', texts: TRAITS })).ok).toBe(true);

    // ten players join over real sockets and are issued numbers
    const ps: Socket[] = [];
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const p = await playerSocket(base);
      const ack = await send(p, 'room:join', { nickname: `사람${i + 1}` });
      expect(ack.ok).toBe(true);
      expect(typeof ack.playerId).toBe('string');
      ps.push(p);
      ids.push(ack.playerId);
    }
    expect(new Set(ids).size).toBe(10); // the host issues distinct ids

    // starting deals a card to each player, unicast
    const dealt = Promise.all(ps.map((p) => once(p, 'card:assigned')));
    expect((await send(m, 'master:start', { gameId: 'bingo' })).ok).toBe(true);
    const cards = await dealt;
    for (const c of cards) expect(c.permutation).toHaveLength(CELLS);
    expect(new Set(cards.map((c: any) => c.number)).size).toBe(10);

    // player 1 fills a whole row; the last cell announces a bingo room-wide
    const p1 = ps[0]!;
    const row = LINES[0]!.cells;
    const announced = once(ps[1]!, 'bingo:announced');
    for (let i = 0; i < row.length; i++) {
      const ack = await send(p1, 'cell:fill', { cellIndex: row[i]!, query: String(i + 2) });
      expect(ack.ok).toBe(true);
    }
    const bingo = await announced;
    expect(bingo.number).toBe(1);
    expect(bingo.lineCount).toBe(1);

    // end and reveal
    expect((await send(m, 'master:end', { gameId: 'bingo' })).ok).toBe(true);
    // enter the reveal at 0, then advance one step at a time
    const entered = await send(m, 'master:reveal', { gameId: 'bingo', step: 0 });
    expect(entered.ok).toBe(true);
    expect(entered.state).toBe('REVEAL');
    expect((await send(m, 'master:reveal', { gameId: 'bingo', step: 1 })).ok).toBe(true);
    expect((await send(m, 'master:reveal', { gameId: 'bingo', step: 3 })).ok).toBe(false);
  }, 20000);

  it('a cell result is unicast — the other 9 players never see it', async () => {
    const base = await boot();
    const m = await masterSocket(base);
    await send(m, 'event:create', { title: 'x' });
    await send(m, 'master:setTraits', { gameId: 'bingo', texts: TRAITS });

    const ps: Socket[] = [];
    for (let i = 0; i < 3; i++) {
      const p = await playerSocket(base);
      await send(p, 'room:join', { nickname: `사람${i + 1}` });
      ps.push(p);
    }
    await send(m, 'master:start', { gameId: 'bingo' });

    let leaked = 0;
    ps[1]!.on('cell:result', () => leaked++);
    ps[2]!.on('cell:result', () => leaked++);
    const mine: unknown[] = [];
    ps[0]!.on('cell:result', (d) => mine.push(d));

    await send(ps[0]!, 'cell:fill', { cellIndex: 0, query: '2' });
    await new Promise((r) => setTimeout(r, 150));

    expect(mine).toHaveLength(1);
    expect(leaked).toBe(0); // req §16.2 — the mistake that would break the event
  }, 20000);

  it('rejects a fill from a socket that never joined', async () => {
    const base = await boot();
    const m = await masterSocket(base);
    await send(m, 'event:create', { title: 'x' });
    await send(m, 'master:setTraits', { gameId: 'bingo', texts: TRAITS });

    const ghost = await playerSocket(base);
    const ack = await send(ghost, 'cell:fill', { cellIndex: 0, query: '1' });
    expect(ack.ok).toBe(false);
  }, 20000);

  it('a player reconnecting with their id gets the same card and fills back', async () => {
    const base = await boot();
    const m = await masterSocket(base);
    await send(m, 'event:create', { title: 'x' });
    await send(m, 'master:setTraits', { gameId: 'bingo', texts: TRAITS });

    const a = await playerSocket(base);
    const { playerId } = await send(a, 'room:join', { nickname: '민수' });
    const b = await playerSocket(base);
    await send(b, 'room:join', { nickname: '지은' });
    // subscribe before triggering the deal, or the emit races the listener
    const dealt = once(a, 'card:assigned');
    await send(m, 'master:start', { gameId: 'bingo' });
    const first = await dealt;
    await send(a, 'cell:fill', { cellIndex: 4, query: '2' });

    a.close();
    await new Promise((r) => setTimeout(r, 100));

    const again = await playerSocket(base);
    const restorePromise = once(again, 'card:restore');
    const ack = await send(again, 'room:rejoin', { playerId });
    expect(ack.ok).toBe(true);
    const restored = await restorePromise;
    expect(restored.permutation).toEqual(first.permutation);
    expect(restored.fills[4]).not.toBeNull();
  }, 20000);
});
