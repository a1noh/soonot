/**
 * Milestone 2's acceptance, end to end (spec §13):
 * **sign in once; two empty panes; sign-out rotates.**
 *
 * Drives the real Express + Socket.IO host over a real port with real cookies.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    config: { ...loadConfig({}), production: false, tls: false, dbPath: ':memory:', mediaDir: mkdtempSync(join(tmpdir(), 'soonot-media-')) },
    passcodeHash: hashPasscode(PASSCODE),
    modules: { bingo: createStubModule('bingo'), yutnori: createStubModule('yutnori'), stones: createStubModule('stones') },
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

describe('projector overlays the master drives', () => {
  it('puts a 4지선다 question up by number (text from the host, never the 보기) and takes it down', async () => {
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);
    await emit(master, 'event:create', { title: 'x' });

    const shown = once<EventSummary>(master, 'event:summary');
    expect((await emit(master, 'projector:quiz', { n: 2 })).ok).toBe(true);
    const s = await shown;
    expect(s.projectorQuiz).toMatchObject({ n: 2, total: 19, label: '문제 1' });
    expect(s.projectorQuiz!.question).toContain('다윗');
    expect(JSON.stringify(s.projectorQuiz)).not.toContain('돌팔매');

    const down = once<EventSummary>(master, 'event:summary');
    await emit(master, 'projector:quiz', { n: null });
    expect((await down).projectorQuiz).toBeNull();

    for (const bad of [{ n: 0 }, { n: 20 }, { n: 1.5 }, { n: 'x' }]) {
      expect((await emit(master, 'projector:quiz', bad)).ok).toBe(false);
    }
  });

  it('4지선다: only the question; 정답 공개 adds just the answer; ◀ hides it; a new question starts hidden', async () => {
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);
    await emit(master, 'event:create', { title: 'x' });

    const up = once<EventSummary>(master, 'event:summary');
    await emit(master, 'projector:quiz', { n: 1 });
    const q = (await up).projectorQuiz!;
    expect(q).toMatchObject({ label: '예시', total: 19, answer: null });
    expect(JSON.stringify(q)).not.toContain('골리앗');

    const shown = once<EventSummary>(master, 'event:summary');
    await emit(master, 'projector:quiz', { n: 1, reveal: true });
    expect((await shown).projectorQuiz!.answer).toEqual({ k: 4, text: '골리앗' });
    expect(JSON.stringify((await shown).projectorQuiz)).not.toContain('볼드모트'); // never the other options

    const hidden = once<EventSummary>(master, 'event:summary');
    await emit(master, 'projector:quiz', { n: 1, reveal: false });
    expect((await hidden).projectorQuiz!.answer).toBeNull();

    const last = once<EventSummary>(master, 'event:summary');
    await emit(master, 'projector:quiz', { n: 19, reveal: true });
    expect((await last).projectorQuiz).toMatchObject({ label: '문제 18', answer: { k: 1, text: '삼손' } });
  });

  it('휘트니: the track card plays whole or from 5 s, once the file is there', async () => {
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);
    await emit(master, 'event:create', { title: 'x' });
    expect((await emit(master, 'projector:card', { kind: 'track', from: 5 })).ok).toBe(false); // no file yet
    await fetch(`${base}/master/media?dir=rounds&name=whitney.mp3`, { method: 'POST', headers: { cookie: `${COOKIE_NAME}=${token}` }, body: 'x' });
    const on = once<EventSummary>(master, 'event:summary');
    expect((await emit(master, 'projector:card', { kind: 'track', from: 5 })).ok).toBe(true);
    expect((await on).projectorCard).toMatchObject({ kind: 'track', from: 5, url: '/media/rounds/whitney.mp3' });
  });

  it('round cards: 제시어 from the host copy; 눈코입 / 찬양 from the uploaded folders; off', async () => {
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);
    await emit(master, 'event:create', { title: 'x' });
    const cookie = `${COOKIE_NAME}=${token}`;

    const word = once<EventSummary>(master, 'event:summary');
    expect((await emit(master, 'projector:card', { kind: 'word', team: 0, i: 1 })).ok).toBe(true);
    expect((await word).projectorCard).toMatchObject({ kind: 'word', text: '만세', kicker: expect.stringContaining('하') });

    // Nothing uploaded yet: a clear error, nothing on screen.
    expect((await emit(master, 'projector:card', { kind: 'face', n: 1 })).ok).toBe(false);
    for (const [dir, name] of [['faces', '02 유재석.jpg'], ['faces', '02 유재석-zoom.jpg'], ['faces', '01 아이유.png'], ['songs', '찬양 02 내 모습 이대로.mp3'], ['songs', '찬양 02 내 모습 이대로 후렴.mp3']]) {
      const up = await fetch(`${base}/master/media?dir=${dir}&name=${encodeURIComponent(name!)}`, { method: 'POST', headers: { cookie }, body: 'x' });
      expect(up.status).toBe(200);
    }
    const list = await (await fetch(`${base}/master/media?dir=faces`, { headers: { cookie } })).json();
    expect(list.files).toHaveLength(3);

    const face = once<EventSummary>(master, 'event:summary');
    // The team's order: 1 = 타노스 (연습, no photo yet → refused), 2 = 유재석 (the first counted photo).
    expect((await emit(master, 'projector:card', { kind: 'face', n: 1 })).ok).toBe(false);
    await emit(master, 'projector:card', { kind: 'face', n: 2, revealed: false });
    expect((await face).projectorCard).toMatchObject({ kind: 'face', n: 1, total: 15, name: '유재석', revealed: false, example: false, zoomUrl: expect.stringContaining('zoom') });

    const song = once<EventSummary>(master, 'event:summary');
    await emit(master, 'projector:card', { kind: 'song', n: 2, phase: 'answer' });
    expect((await song).projectorCard).toMatchObject({ kind: 'song', title: '내 모습 이대로 · 제이어스', phase: 'answer', chorusUrl: expect.stringContaining(encodeURIComponent('후렴')) });

    const off = once<EventSummary>(master, 'event:summary');
    await emit(master, 'projector:card', { off: true });
    expect((await off).projectorCard).toBeNull();
    for (const bad of [{ kind: 'word', team: 9, i: 0 }, { kind: 'song', n: 1 }, { kind: 'song', n: 19 }, { kind: 'x' }]) {
      expect((await emit(master, 'projector:card', bad)).ok).toBe(false);
    }
  });

  it('starts and stops a countdown, with the server clock to line screens up', async () => {
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);
    await emit(master, 'event:create', { title: 'x' });

    const started = once<EventSummary>(master, 'event:summary');
    const before = Date.now();
    expect((await emit(master, 'projector:timer', { seconds: 20, label: ' 종이비행기 접기 ' })).ok).toBe(true);
    const s = await started;
    expect(s.projectorTimer).toMatchObject({ label: '종이비행기 접기', totalMs: 20_000 });
    expect(s.projectorTimer!.endsAt).toBeGreaterThanOrEqual(before + 20_000);
    expect(s.serverNow).toBeGreaterThanOrEqual(before);

    const stopped = once<EventSummary>(master, 'event:summary');
    await emit(master, 'projector:timer', { stop: true });
    expect((await stopped).projectorTimer).toBeNull();

    for (const bad of [{ seconds: 0 }, { seconds: 3601 }, { seconds: 1.5 }, { seconds: 'x' }, {}]) {
      expect((await emit(master, 'projector:timer', bad)).ok).toBe(false);
    }
  });

  it('stores the 랜덤 5명 확인 cells and clears them when the spotlight moves', async () => {
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);
    await emit(master, 'event:create', { title: 'x' });
    await emit(master, 'projector:spotlight', { n: 7 });

    const checked = once<EventSummary>(master, 'event:summary');
    await emit(master, 'projector:check', { cells: [4, 0, 12, 7, 20] });
    expect((await checked).bingoCheck).toEqual([4, 0, 12, 7, 20]);

    const moved = once<EventSummary>(master, 'event:summary');
    await emit(master, 'projector:spotlight', { n: 9 });
    expect((await moved).bingoCheck).toBeNull();

    for (const bad of [{ cells: [1, 1] }, { cells: [25] }, { cells: [-1] }, { cells: [] }, { cells: 'x' }]) {
      expect((await emit(master, 'projector:check', bad)).ok).toBe(false);
    }
  });
});

describe('진행 순서 (slides, screens, BGM)', () => {
  it('starts from the script, keeps the cue list on the console only, and puts a slide on air', async () => {
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);
    const projector = await connect(base, '/p');
    await projector.firstSummary;
    const created = once<EventSummary>(master, 'event:summary');
    const projCreated = once<EventSummary>(projector, 'event:summary');
    await emit(master, 'event:create', { title: 'x' });
    const s0 = await created;
    // One path: 빙고 → 영상 → 스톤 (one step for all rounds) → 시상 → 감사합니다.
    expect(s0.cues!.length).toBe(11);
    expect(s0.cues!.filter((c) => /라운드/.test(c.title))).toHaveLength(1);
    expect(s0.cues!.some((c) => c.title.includes('MC 등장 영상'))).toBe(true);
    // The projector never learns the run of show (it names every round in order).
    expect((await projCreated).cues).toBeUndefined();

    const slideCue = s0.cues!.find((c) => c.kind === 'slide')!;
    const onAir = once<EventSummary>(projector, 'event:summary');
    expect((await emit(master, 'show:go', { id: slideCue.id })).ok).toBe(true);
    const p1 = await onAir;
    expect(p1.slide).toMatchObject({ cueId: slideCue.id, title: slideCue.title, media: slideCue.media });
    expect(p1.liveCue).toBe(slideCue.id);
    // Up and ready, but nothing plays until the master presses 시작.
    expect(p1.slide).toMatchObject({ playing: false });
    expect(p1.bgm).toMatchObject({ name: slideCue.bgm, playing: false });
    const started = once<EventSummary>(projector, 'event:summary');
    expect((await emit(master, 'show:start', {})).ok).toBe(true);
    const p2 = await started;
    expect(p2.slide).toMatchObject({ playing: true });
    expect(p2.slide!.startedAt).toBeGreaterThan(0);
    expect(p2.bgm).toMatchObject({ playing: true });

    const down = once<EventSummary>(projector, 'event:summary');
    await emit(master, 'show:clear', {});
    expect((await down).slide).toBeNull();
  });

  it('a screen cue switches the projector to that game and takes the slide down', async () => {
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);
    const created = once<EventSummary>(master, 'event:summary');
    await emit(master, 'event:create', { title: 'x' });
    const cues = (await created).cues!;
    await emit(master, 'show:go', { id: cues.find((c) => c.kind === 'slide')!.id });

    const screen = cues.find((c) => c.kind === 'screen' && c.screen === 'stones' && c.transition === 'zoom')!;
    const moved = once<EventSummary>(master, 'event:summary');
    await emit(master, 'show:go', { id: screen.id });
    const s = await moved;
    expect(s.slide).toBeNull();
    expect(s.projector).toBe('stones');
    expect(s.screenTransition).toBe('zoom');
    expect((await emit(master, 'show:go', { id: 'nope' })).ok).toBe(false);
  });

  it('saves an edited cue list, drops unsafe URLs, and drives the BGM', async () => {
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);
    await emit(master, 'event:create', { title: 'x' });

    const saved = once<EventSummary>(master, 'event:summary');
    const ok = await emit(master, 'show:save', {
      cues: [
        { id: 'a', kind: 'slide', title: ' 오프닝 ', media: 'javascript:alert(1)', bgm: '테마', bgmUrl: '/media/theme.mp3', transition: 'zoom' },
        { id: 'b', kind: 'screen', screen: 'bingo', title: '빙고', media: '/media/../secret' },
      ],
    });
    expect(ok.ok).toBe(true);
    const cues = (await saved).cues!;
    expect(cues.map((c) => c.title)).toEqual(['오프닝', '빙고']);
    expect(cues[0]!.media).toBe('');
    expect(cues[0]!.bgmUrl).toBe('/media/theme.mp3');
    expect(cues[1]!.media).toBe('');

    await emit(master, 'show:go', { id: 'a' });
    await emit(master, 'show:start', {});
    const paused = once<EventSummary>(master, 'event:summary');
    await emit(master, 'show:bgm', { action: 'pause', volume: 0.3 });
    expect((await paused).bgm).toMatchObject({ url: '/media/theme.mp3', playing: false, volume: 0.3 });

    // A cue with no BGM leaves the music alone.
    const kept = once<EventSummary>(master, 'event:summary');
    await emit(master, 'show:go', { id: 'b' });
    expect((await kept).bgm).toMatchObject({ url: '/media/theme.mp3' });

    const stopped = once<EventSummary>(master, 'event:summary');
    await emit(master, 'show:bgm', { action: 'stop' });
    expect((await stopped).bgm).toBeNull();

    expect((await emit(master, 'show:save', { cues: 'x' })).ok).toBe(false);
  });

  it('🔇 소리 끄기 reaches the projector; music starts soft and only from a file', async () => {
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);
    const projector = await connect(base, '/p');
    await projector.firstSummary;
    const created = once<EventSummary>(master, 'event:summary');
    await emit(master, 'event:create', { title: 'x' });
    const cues = (await created).cues!;

    const off = once<EventSummary>(projector, 'event:summary');
    expect((await emit(master, 'show:mute', { muted: true })).ok).toBe(true);
    expect((await off).muted).toBe(true);
    expect((await emit(master, 'show:mute', { muted: 'yes' })).ok).toBe(false);

    // The 대본's first step has its track; a hand-played song's step stops the music.
    const first = cues[0]!;
    expect(first.bgmUrl).toMatch(/^\/media\/bgm\/.+\.mp3$/);
    const up = once<EventSummary>(master, 'event:summary');
    await emit(master, 'show:go', { id: first.id });
    // A normal step's music starts by itself (only a video step waits for ▶ 시작).
    expect((await up).bgm).toMatchObject({ url: first.bgmUrl, volume: 0.5, playing: true });
    // Inside the 스톤 step each round sets its music; a hand-played song stops it.
    const round = once<EventSummary>(master, 'event:summary');
    await emit(master, 'show:music', { name: '경쾌한 질주', url: '/media/bgm/run-amok.mp3' });
    expect((await round).bgm).toMatchObject({ url: '/media/bgm/run-amok.mp3', playing: true });
    const stop = once<EventSummary>(master, 'event:summary');
    await emit(master, 'show:music', { name: '태양 「눈, 코, 입」 · 직접 틀기', url: '' });
    expect((await stop).bgm).toMatchObject({ url: '', playing: false });
    // A step's timer never starts by itself (only ⏱); a screen step's body is its banner.
    const sign = once<EventSummary>(master, 'event:summary');
    const signCue = cues.find((c) => c.title === '빙고 마감 안내')!;
    await emit(master, 'show:go', { id: signCue.id });
    const onSign = await sign;
    expect(onSign.projectorTimer).toBeNull();
    expect(onSign.banner).toBe('6시까지 와주세요! · 빙고는 6시에 마감돼요');
    // A ⏱ started on the step ends when you leave it, and so does the banner.
    await emit(master, 'projector:timer', { seconds: 300, label: '빙고 마감까지' });
    const moved = once<EventSummary>(master, 'event:summary');
    await emit(master, 'show:go', { id: cues.find((c) => c.title === '빙고 1등 공개')!.id });
    const after = await moved;
    expect(after.projectorTimer).toBeNull();
    expect(after.banner).toBeNull();
  });

  it('최종 시상: a prize beat per place (2위 / 1위), closed with null; nothing else accepted', async () => {
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);
    await emit(master, 'event:create', { title: 'x' });
    const open = once<EventSummary>(master, 'event:summary');
    expect((await emit(master, 'projector:podiumPrize', { step: 3 })).ok).toBe(true);
    expect((await open).podiumPrize).toBe(3);
    const shut = once<EventSummary>(master, 'event:summary');
    await emit(master, 'projector:podiumPrize', { step: null });
    expect((await shut).podiumPrize).toBeNull();
    for (const bad of [{ step: 1 }, { step: 4 }, { step: 'x' }]) {
      expect((await emit(master, 'projector:podiumPrize', bad)).ok).toBe(false);
    }
  });

  it('↺ 전체 초기화: games, 진행 순서 and the screen back to the start — same event, same cues', async () => {
    const { base } = await boot();
    const { token } = await signIn(base);
    const master = await connect(base, '/master', token!);
    const created = once<EventSummary>(master, 'event:summary');
    await emit(master, 'event:create', { title: 'x' });
    const before = await created;
    await emit(master, 'master:setup', { gameId: 'bingo', entrants: 9 });
    await emit(master, 'show:go', { id: before.cues![1]!.id });
    await emit(master, 'projector:timer', { seconds: 30 });
    await emit(master, 'show:mute', { muted: true });
    await emit(master, 'projector:set', { setting: 'stones' });

    const reset = once<EventSummary>(master, 'event:summary');
    expect((await emit(master, 'event:restart', {})).ok).toBe(true);
    const after = await reset;
    expect(after.code).toBe(before.code);
    expect(after.cues).toEqual(before.cues);
    expect([after.liveCue, after.slide, after.bgm, after.projectorTimer, after.muted, after.projector]).toEqual([null, null, null, null, false, 'auto']);
    for (const g of ['bingo', 'yutnori', 'stones'] as const) expect(after.games[g].state).toBe('SETUP');
  });

  it('uploads media only for a signed-in master, and serves it at /media', async () => {
    const { base } = await boot();
    const body = new TextEncoder().encode('fake-png');
    const anon = await fetch(`${base}/master/media?name=a.png`, { method: 'POST', body });
    expect(anon.status).toBe(401);

    const { token } = await signIn(base);
    const cookie = { cookie: `${COOKIE_NAME}=${token}` };
    const bad = await fetch(`${base}/master/media?name=run.sh`, { method: 'POST', body, headers: cookie });
    expect(bad.status).toBe(400);

    const up = await fetch(`${base}/master/media?name=${encodeURIComponent('../팀 자리.png')}`, { method: 'POST', body, headers: cookie });
    const res = (await up.json()) as { ok: boolean; url: string };
    expect(res.ok).toBe(true);
    expect(res.url).toBe(`/media/${encodeURIComponent('팀 자리.png')}`);
    expect(await (await fetch(`${base}${res.url}`)).text()).toBe('fake-png');

    const list = (await (await fetch(`${base}/master/media`, { headers: cookie })).json()) as { files: { name: string }[] };
    expect(list.files.map((f) => f.name)).toContain('팀 자리.png');
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
