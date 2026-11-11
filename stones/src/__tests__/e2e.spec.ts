/**
 * A real 스톤 game driven by a real master socket against the real host, with
 * the projector watching.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { createHost, type Host } from '@soonot/master/src/host/server';
import { hashPasscode } from '@soonot/master/src/identity/passcode';
import { loadConfig } from '@soonot/master/src/config';
import { COOKIE_NAME } from '@soonot/master/src/identity/session';
import { createStubModule } from '@soonot/master/src/__tests__/stub-module';
import { stonesModule } from '../module';
import type { StonesView } from '../project';

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
    modules: { bingo: createStubModule('bingo'), yutnori: createStubModule('yutnori'), stones: stonesModule },
  });
  const port = await host.listen(0);
  return `http://127.0.0.1:${port}`;
}

async function connect(base: string, ns: string, cookie?: string) {
  const s = ioClient(`${base}${ns}`, {
    transports: ['websocket'],
    ...(cookie ? { extraHeaders: { cookie } } : {}),
  });
  sockets.push(s);
  await new Promise<void>((r) => s.on('connect', () => r()));
  return s;
}

async function masterSocket(base: string) {
  const res = await fetch(`${base}/master/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passcode: PASSCODE }),
  });
  const token = res.headers.get('set-cookie')?.match(new RegExp(`${COOKIE_NAME}=([^;]*)`))?.[1];
  return connect(base, '/master', `${COOKIE_NAME}=${token}`);
}

const send = (s: Socket, ev: string, p: Record<string, unknown> = {}): Promise<any> =>
  new Promise((resolve) => s.emit(ev, { gameId: 'stones', ...p }, resolve));

/** The next 스톤 room:state this socket sees that passes `test`. */
function nextView(s: Socket, test: (v: StonesView) => boolean, ms = 3000): Promise<StonesView> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for room:state')), ms);
    const on = (msg: { data?: { gameId: string; view: StonesView }; gameId?: string; view?: StonesView }) => {
      const m = (msg.data ?? msg) as { gameId: string; view: StonesView };
      if (m.gameId === 'stones' && test(m.view)) {
        clearTimeout(t);
        s.off('room:state', on);
        resolve(m.view);
      }
    };
    s.on('room:state', on);
  });
}

describe('스톤 end to end', () => {
  it('master runs a game the projector can follow, through the reveal', async () => {
    const base = await boot();
    const m = await masterSocket(base);
    await new Promise((r) => m.emit('event:create', { title: '한마당' }, r));
    const p = await connect(base, '/p');

    expect(
      await send(m, 'master:setup', {
        teams: [
          { name: '선교', playing: true },
          { name: '예배', playing: true },
          { name: '양육', playing: false },
        ],
        stones: [{ name: '빨강', mission: '노래 한 소절' }, { name: '파랑', mission: '퀴즈' }],
      }),
    ).toMatchObject({ ok: true });
    expect(await send(m, 'master:start')).toMatchObject({ ok: true });

    const picked = nextView(p, (v) => v.pending !== null);
    expect(await send(m, 'master:pick', { stone: 's1' })).toMatchObject({ ok: true });
    expect((await picked).pending).toMatchObject({ teamName: '선교', stoneId: 's1' });

    const won = nextView(p, (v) => v.lastResult !== null);
    await send(m, 'master:resolve', { success: true });
    const after = await won;
    expect(after.turnTeamName).toBe('예배');
    expect(after.standings[0]).toMatchObject({ teamName: '선교', stoneIds: ['s1'] });
    expect(after.blocking).toBeUndefined(); // the projector never gets master affordances

    // Illegal moves come back as errors, not silence.
    await send(m, 'master:pick', { stone: 's1' });
    await send(m, 'master:resolve', { success: false });
    const again = await send(m, 'master:pick', { stone: 's1' }); // 선교 already holds s1
    expect(again).toMatchObject({ ok: false, error: { code: 'ALREADY_HELD' } });

    // A player phone cannot drive it.
    const phone = await connect(base, '/b');
    const denied: any = await new Promise((r) => phone.emit('master:skip', { gameId: 'stones' }, r));
    expect(denied?.ok).not.toBe(true);

    expect(await send(m, 'master:end')).toMatchObject({ ok: true });
    const revealed = nextView(p, (v) => v.state === 'REVEAL' && v.revealStep === 1);
    await send(m, 'master:reveal', { step: 0 });
    await send(m, 'master:reveal', { step: 1 });
    expect((await revealed).standings.map((s) => s.teamName)).toEqual(['선교', '예배']);
  }, 20000);
});
