/**
 * Milestone 3's acceptance: a real 윷놀이 game driven by a real master socket
 * against the real host, with a board client watching.
 *
 * req §3 — the teams have no client. One writer, and it is the master.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { createHost, type Host } from '@soonot/master/src/host/server';
import { hashPasscode } from '@soonot/master/src/identity/passcode';
import { loadConfig } from '@soonot/master/src/config';
import { COOKIE_NAME } from '@soonot/master/src/identity/session';
import { createStubModule } from '@soonot/master/src/__tests__/stub-module';
import { yutnoriModule } from '../module';

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
    modules: { bingo: createStubModule('bingo'), yutnori: yutnoriModule },
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

async function boardSocket(base: string) {
  const s = ioClient(`${base}/y`, { transports: ['websocket'] });
  sockets.push(s);
  await new Promise<void>((r) => s.on('connect', () => r()));
  return s;
}

const send = (s: Socket, ev: string, p: unknown): Promise<any> =>
  new Promise((resolve) => s.emit(ev, p, resolve));

function once(s: Socket, ev: string, ms = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${ev}`)), ms);
    s.once(ev, (d: unknown) => {
      clearTimeout(t);
      resolve(d);
    });
  });
}

async function setupGame(base: string) {
  const m = await masterSocket(base);
  await send(m, 'event:create', { title: '청년부 한마당' });
  const ack = await send(m, 'master:setup', {
    gameId: 'yutnori',
    teams: [{ name: '청년 1조' }, { name: '청년 2조' }, { name: '장년부' }],
    malPerTeam: 2,
    timeLimitMin: 30,
  });
  expect(ack.ok).toBe(true);
  return m;
}

describe('yutnori end to end', () => {
  it('sets up, starts, throws and moves — the board follows', async () => {
    const base = await boot();
    const m = await setupGame(base);
    const board = await boardSocket(base);

    const started = once(board, 'room:state');
    expect((await send(m, 'master:start', { gameId: 'yutnori' })).ok).toBe(true);
    const { gameId, view } = await started;
    expect(gameId).toBe('yutnori');
    expect(view.state).toBe('RUNNING');
    expect(view.teams).toHaveLength(3);
    expect(view.turnTeamName).toBe('청년 1조');

    // 도 with two 말 in 대기 gives the master a choice
    const recorded = once(board, 'throw:recorded');
    expect((await send(m, 'master:throw', { gameId: 'yutnori', roll: '도' })).ok).toBe(true);
    const thrown = await recorded;
    expect(thrown.roll).toBe('도');
    expect(thrown.candidates.length).toBeGreaterThan(0);

    const moved = once(board, 'board:update');
    const malId = thrown.candidates[0].malId;
    expect((await send(m, 'master:move', { gameId: 'yutnori', malId })).ok).toBe(true);
    const update = await moved;
    expect(update.mal.find((x: any) => x.malId === malId).progress).toBe(1);
  });

  it('윷 grants a bonus throw, so the turn does not pass', async () => {
    const base = await boot();
    const m = await setupGame(base);
    const board = await boardSocket(base);
    await send(m, 'master:start', { gameId: 'yutnori' });

    const t1 = once(board, 'throw:recorded');
    await send(m, 'master:throw', { gameId: 'yutnori', roll: '윷' });
    const first = await t1;
    await send(m, 'master:move', { gameId: 'yutnori', malId: first.candidates[0].malId });

    // still 청년 1조's turn — a second throw is owed
    const again = await send(m, 'master:throw', { gameId: 'yutnori', roll: '개' });
    expect(again.ok).toBe(true);
  });

  it('undo reverts the last move', async () => {
    const base = await boot();
    const m = await setupGame(base);
    const board = await boardSocket(base);
    await send(m, 'master:start', { gameId: 'yutnori' });

    const t = once(board, 'throw:recorded');
    await send(m, 'master:throw', { gameId: 'yutnori', roll: '걸' });
    const thrown = await t;
    await send(m, 'master:move', { gameId: 'yutnori', malId: thrown.candidates[0].malId });

    const undone = once(board, 'undo:applied');
    expect((await send(m, 'master:undo', { gameId: 'yutnori' })).ok).toBe(true);
    await undone;

    const state = once(board, 'room:state');
    await send(m, 'master:pause', { gameId: 'yutnori' });
    const { view } = await state;
    expect(view.teams.every((t: any) => t.mal.every((x: any) => x.progress === 0))).toBe(true);
  });

  it('a spectator on /y cannot drive the game', async () => {
    const base = await boot();
    await setupGame(base);
    const board = await boardSocket(base);
    // /y registers no handlers at all, so an emit is simply never acknowledged
    const answered = await Promise.race([
      send(board, 'master:throw', { gameId: 'yutnori', roll: '모' }),
      new Promise((r) => setTimeout(() => r('no-handler'), 400)),
    ]);
    expect(answered).toBe('no-handler');
  });

  it('keeps the engine error code instead of flattening it to INTERNAL', async () => {
    const base = await boot();
    const m = await setupGame(base);
    await send(m, 'master:start', { gameId: 'yutnori' });
    // a MOVE with no pending throw
    const ack = await send(m, 'master:move', { gameId: 'yutnori', malId: 'nope' });
    expect(ack.ok).toBe(false);
    expect(ack.error.code).toBe('NO_PENDING_THROW');
  });

  it('ends and reveals the podium through the shared rank()', async () => {
    const base = await boot();
    const m = await setupGame(base);
    await send(m, 'master:start', { gameId: 'yutnori' });
    expect((await send(m, 'master:end', { gameId: 'yutnori' })).ok).toBe(true);
    const entered = await send(m, 'master:reveal', { gameId: 'yutnori', step: 0 });
    expect(entered.ok).toBe(true);
    expect(entered.state).toBe('REVEAL');
    // 3rd, then 2nd, then 1st — one step at a time, never skipping
    expect((await send(m, 'master:reveal', { gameId: 'yutnori', step: 1 })).ok).toBe(true);
    expect((await send(m, 'master:reveal', { gameId: 'yutnori', step: 3 })).ok).toBe(false);
    expect((await send(m, 'master:reveal', { gameId: 'yutnori', step: 2 })).ok).toBe(true);
  });
});
