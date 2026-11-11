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
        stones: [{ name: '스페이스 스톤' }, { name: '마인드 스톤' }, { name: '타임 스톤' }],
        games: [
          { name: '코끼리 종이비행기', players: '2명', instructions: '멀리 날리기' },
          { name: '찬양 퀴즈', players: '모두', instructions: '제목 맞히기' },
          { name: '넌센스', players: '모두', instructions: '엉뚱하게' },
        ],
      }),
    ).toMatchObject({ ok: true });
    const running = nextView(p, (v) => v.state === 'RUNNING');
    expect(await send(m, 'master:start')).toMatchObject({ ok: true });

    // Before any pick, the projector cannot know the game order.
    const lobby = await running;
    expect(JSON.stringify(lobby)).not.toContain('코끼리');

    const picked = nextView(p, (v) => v.pending !== null);
    expect(await send(m, 'master:pick', { stone: 's3' })).toMatchObject({ ok: true });
    const shown = (await picked).pending!;
    expect(shown).toMatchObject({ chooserName: '선교', stoneId: 's3', number: 1, game: { name: '코끼리 종이비행기', players: '2명' } });
    expect(JSON.stringify(await picked)).not.toContain('찬양'); // the next game stays secret

    const won = nextView(p, (v) => v.lastResult !== null);
    await send(m, 'master:resolve', { winners: ['t2', 't3'] });
    const after = await won;
    expect(after.turnTeamName).toBe('예배');
    expect(after.standings.slice(0, 2).map((s) => s.teamName)).toEqual(['예배', '양육']);
    expect(after.blocking).toBeUndefined(); // the projector never gets master affordances

    // A played stone cannot be picked again.
    const again = await send(m, 'master:pick', { stone: 's3' });
    expect(again).toMatchObject({ ok: false, error: { code: 'STONE_TAKEN' } });

    // A player phone cannot drive it.
    const phone = await connect(base, '/b');
    const denied: any = await new Promise((r) => phone.emit('master:skip', { gameId: 'stones' }, r));
    expect(denied?.ok).not.toBe(true);

    expect(await send(m, 'master:end')).toMatchObject({ ok: true });
    const revealed = nextView(p, (v) => v.state === 'REVEAL' && v.revealStep === 1);
    await send(m, 'master:reveal', { step: 0 });
    await send(m, 'master:reveal', { step: 1 });
    expect((await revealed).standings[0]!.stoneIds).toEqual(['s3']);
  }, 20000);

  it('a tie at 1st goes to 엔드게임, and the podium shows the decided order', async () => {
    const base = await boot();
    const m = await masterSocket(base);
    await new Promise((r) => m.emit('event:create', { title: '한마당' }, r));
    const p = await connect(base, '/p');
    await send(m, 'master:setup', {
      teams: [{ name: '아이언맨' }, { name: '헐크' }, { name: '토르' }].map((t) => ({ ...t, playing: true })),
      stones: [{ name: '예배 스톤' }, { name: '섬김 스톤' }],
      games: [
        { name: 'a', players: '모두', instructions: 'x' },
        { name: 'b', players: '모두', instructions: 'y' },
      ],
    });
    await send(m, 'master:start');
    await send(m, 'master:pick', { stone: 's1' });
    await send(m, 'master:resolve', { winners: ['t1', 't2'] });
    await send(m, 'master:pick', { stone: 's2' });
    await send(m, 'master:resolve', { winners: [] });
    await send(m, 'master:end');


    // 아이언맨 and 헐크 share 1st until 엔드게임 decides it.
    const open = nextView(p, (v) => v.activeTiebreak !== null);
    expect(await send(m, 'master:tiebreak:start', { teamIds: ['t1', 't2'] })).toMatchObject({ ok: true });
    const shown = await open;
    expect(shown.activeTiebreak).toMatchObject({ teams: [{ name: '아이언맨' }, { name: '헐크' }], game: { name: '엔드게임' } });
    expect(await send(m, 'master:reveal', { step: 0 })).toMatchObject({ ok: false, error: { code: 'TIEBREAK_PENDING' } });

    const decided = nextView(p, (v) => v.activeTiebreak === null && v.standings[0]?.teamName === '헐크');
    expect(await send(m, 'master:tiebreak:resolve', { order: ['t2', 't1'] })).toMatchObject({ ok: true });
    const after = await decided;
    expect(after.standings.map((s) => [s.teamName, s.rank])).toEqual([
      ['헐크', 1],
      ['아이언맨', 2],
      ['토르', 3],
    ]);

    const podium = nextView(p, (v) => v.state === 'REVEAL' && v.revealStep === 3);
    for (const step of [0, 1, 2, 3]) await send(m, 'master:reveal', { step });
    expect((await podium).standings[0]!.teamName).toBe('헐크');
  }, 20000);
});
