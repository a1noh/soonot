/**
 * Every tap, checked: walks the whole show with 다음 ▶ (and the room's taps in
 * the 스톤 rounds), then all the way back with ◀ 이전, then forward again.
 *
 *  - every ▶ must change what the projector shows (no "dead" taps);
 *  - every ◀ must put the projector back to what it showed before the matching ▶
 *    (inside the rounds one ◀ takes back a whole round: its pick and its result,
 *    after the remote's confirm question);
 *  - after the full rewind the show must run to the end again.
 *
 * Writes scripts/shots/taps/<n>-<label>.png (projector) and taps.md (label → screen).
 *
 *   node scripts/rehearse-taps.mjs [baseUrl]     (default http://localhost:3100; use a throwaway server)
 */
import puppeteer from 'puppeteer-core';
import { io } from 'socket.io-client';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:3100';
const OUT = 'scripts/shots/taps/';
mkdirSync(OUT, { recursive: true });
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((x) => existsSync(x));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const rows = [];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const m = await browser.newPage();
m.setDefaultTimeout(20000);
m.on('pageerror', (e) => errors.push('console: ' + e.message));
m.on('dialog', (d) => d.accept());
await m.setViewport({ width: 1000, height: 1150 });
const pb = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const p = await pb.newPage();
p.on('pageerror', (e) => errors.push('projector: ' + e.message));
await p.setViewport({ width: 1280, height: 720 });

/** What the room sees, in words: enough to tell any two screens of the show apart. */
const sig = () =>
  p.evaluate(() => {
    const t = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.trim().replace(/\s+/g, ' ')).join(' | ');
    const stage = document.querySelector('.screenfx .stage');
    const cls = stage ? [...stage.classList].filter((c) => c.startsWith('stage--') || c.startsWith('is-')).join(' ') : '';
    const slide = document.querySelector('.slide:not(.is-leaving)');
    // A slide covers the whole screen: what is behind it is not seen by the room.
    if (slide) return `slide:${slide.querySelector('.slide__title, h1')?.textContent ?? (slide.querySelector('video') ? 'video' : 'media')}${t('.ptimer__label') ? ` · timer:${t('.ptimer__label')}` : ''}`;
    return [
      cls,
      slide ? `slide:${slide.querySelector('.slide__title')?.textContent ?? (slide.querySelector('video') ? 'video' : 'media')}` : '',
      t('.pbanner__main') && `banner:${t('.pbanner__main')}`,
      t('.bingo-stage__hint') && `hint:${t('.bingo-stage__hint')}`,
      t('.pquiz__kicker') && `quiz:${t('.pquiz__kicker')}`,
      t('.phero__rank') && `hero:${t('.phero__rank')} ${t('.phero__name')}`,
      t('.phero__prize') && `prize:${t('.phero__prize')}`,
      t('.podium__label') && `list:${t('.podium__label')}`,
      t('.podium__hold') && 'drumroll',
      document.querySelector('.prizebox') ? 'giftbox' : '',
      document.querySelector('.wcard') ? `card:${document.querySelectorAll('.wcard [class*="check"]').length}` : '',
      t('.ptimer__label') && `timer:${t('.ptimer__label')}`,
      t('.join__scan') && 'QR',
      stage?.querySelector('h1')?.textContent?.trim() ?? '',
      stage?.querySelector('h2')?.textContent?.trim() ?? '',
    ]
      .filter(Boolean)
      .join(' · ');
  });

/** Wait for the projector to settle (transitions, the drumroll before 3등/3위). */
async function settle() {
  let last = '';
  let same = 0;
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    const s = await sig();
    if (s === last && !s.includes('drumroll')) same += 1;
    else same = 0;
    last = s;
    if (same >= 3) break;
  }
  return last;
}

const nextLabel = () => m.$eval('.remote__next', (b) => b.textContent.trim().replace(/\s+/g, ' ')).catch(() => '');
const stepNo = () => m.$eval('.remote__count', (e) => e.textContent.trim().split('/')[0].trim()).catch(() => '?');
async function click(scope, text) {
  const ok = await m.evaluate(
    (s, t) => {
      const b = [...document.querySelectorAll(`${s} button`)].find((x) => !x.disabled && x.offsetParent !== null && x.textContent.includes(t));
      if (b) b.click();
      return !!b;
    },
    scope,
    text,
  );
  if (!ok) throw new Error(`no button "${text}" in ${scope}`);
}

let n = 0;
/** One forward tap; `unit` groups taps that one ◀ takes back together. */
async function tap(label, run, unit) {
  const before = await settle();
  const fromStep = await stepNo();
  await run();
  const after = await settle();
  n += 1;
  await p.screenshot({ path: `${OUT}${String(n).padStart(2, '0')}-${label.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)}.png` });
  rows.push({ n, label, fromStep, toStep: await stepNo(), before, after, unit: unit ?? n });
  if (before === after) errors.push(`▶ #${n} "${label}" (step ${fromStep}) changed nothing on the projector: ${after}`);
  console.log(`▶ ${String(n).padStart(2)} [${fromStep}→${await stepNo()}] ${label}\n      ${after}`);
}
const next = async (expect) => {
  for (let i = 0; i < 30 && /기다리는 중/.test(await nextLabel()); i++) await sleep(300);
  const label = await nextLabel();
  if (expect && !label.includes(expect)) errors.push(`▶ expected "${expect}", the button said "${label}"`);
  await tap(label.replace(/다음 ▶ · 이 장면의 다음 단계/, '').trim(), async () => {
    await m.bringToFront();
    await m.keyboard.press('ArrowRight');
    await sleep(700);
  });
};

// ---- sign in, a fresh event, the projector ------------------------------------
await m.goto(`${BASE}/master`);
await m.waitForSelector('input[type=password], .gametabs, .card');
await sleep(800);
for (let i = 0; i < 3 && (await m.$('input[type=password]')); i++) {
  await m.type('input[type=password]', process.env.PASSCODE ?? 'soonot');
  await m.keyboard.press('Enter');
  await sleep(1500);
}
await m.waitForSelector('.gametabs, .card input:not([type=password])');
if (!(await m.$('.gametabs'))) {
  await m.type('.card input', '탭 테스트');
  await m.keyboard.press('Enter');
  await m.waitForSelector('.gametabs');
}
await m.waitForSelector('.remote');
await p.goto(`${BASE}/p`);
await p.waitForSelector('.fsbtn');
await p.click('.fsbtn');
await sleep(600);

const bots = [];
async function joinBots() {
  const POOL = ['민지', '지은', '철수', '영희', '현우', '수빈', '지훈', '예린', '도윤', '하늘', '서준', '유나'];
  for (const name of POOL) {
    const sock = io(`${BASE}/b`, { transports: ['websocket'] });
    await new Promise((r) => sock.on('connect', r));
    const b = { sock, number: null };
    sock.on('card:assigned', (d) => (b.number = d.number));
    await new Promise((r) => sock.emit('room:join', { nickname: name }, r));
    bots.push(b);
  }
}
function fillCards() {
  for (const [i, b] of bots.entries()) {
    const count = i === 0 ? 15 : i < 4 ? 10 : 5;
    const others = bots.filter((x) => x !== b);
    for (let c = 0; c < count; c++) b.sock.emit('cell:fill', { cellIndex: c, query: String(others[c % others.length].number) });
  }
}

const WINNERS = [['토르'], ['블랙 위도우'], ['토르'], ['블랙 위도우'], ['헐크'], ['토르', '블랙 위도우']];
/** From step 4 (bingo running) to the end of the show. */
async function forwardFromVideo() {
  await next('빙고 마감 안내');
  await next('MC 등장 영상');
  await next('빙고 1등 공개');
  await next('2등 공개');
  await next('1등 공개');
  await next('1등 카드');
  await next('랜덤 5명');
  await next('1등 상품');
  await next('게임 방식');
  await next('자리 안내도');
  await next('메인 보드');
  for (let r = 1; r <= 6; r++) {
    const unit = `round${r}`;
    await tap(`${r}라운드 스톤 고르기`, async () => {
      if (r < 6) {
        const stone = await m.$eval('.srm__stones button:not(:disabled)', (b) => b.textContent.trim());
        await click('.srm__stones', stone);
      } else await click('.srm', '마지막 스톤 열기');
      await sleep(700);
    }, unit);
    await tap(`${r}라운드 스톤 주기 · ${WINNERS[r - 1].join(' · ')}`, async () => {
      for (const w of WINNERS[r - 1]) await click('.srm__winners', w);
      await click('.srm__row', '스톤 주기');
      await sleep(900);
    }, unit);
  }
  await next('스톤 게임 종료');
  await next('1위 결정전');
  await tap('결정전 결과 확정 · 블랙 위도우 → 토르', async () => {
    await click('.remote__game', '블랙 위도우').catch(() => click('.stn__order', '블랙 위도우'));
    await click('.remote__game', '토르').catch(() => click('.stn__order', '토르'));
    await click('.remote__game', '결과 확정');
    await sleep(700);
  }, 'tiebreak');
  await next('최종 시상');
  await next('2위 공개');
  await next('2위 상금');
  await next('1위 공개');
  await next('1위 상금');
  await next('모두 함께');
  await next('감사합니다');
}

// ---- forward: the whole show ---------------------------------------------------
console.log('\n=== ▶ forward ===');
await next('시작하기');
await joinBots();
await sleep(800);
await next('빙고 게임 시작');
for (let i = 0; i < 20 && bots.some((b) => b.number === null); i++) await sleep(250);
fillCards();
await sleep(1500);
const firstPass = rows.length;
await forwardFromVideo();

// ---- backward: ◀ until the bingo is running again (step 1) ---------------------
console.log('\n=== ◀ backward ===');
const forward = rows.slice(firstPass); // everything after 빙고 게임 시작
const units = [];
for (const r of forward) {
  const last = units[units.length - 1];
  if (last && last.unit === r.unit && typeof r.unit === 'string') last.rows.push(r);
  else units.push({ unit: r.unit, rows: [r] });
}
for (let i = units.length - 1; i >= 0; i--) {
  const u = units[i];
  const want = u.rows[0].before;
  await settle();
  await m.bringToFront();
  await m.keyboard.press('ArrowLeft');
  await sleep(900);
  const q = await m.$eval('.remote__backq', (e) => e.textContent.trim()).catch(() => '');
  if (q) {
    // The remote's confirm question (a round, 게임 종료 …): take the offered undo.
    await m.evaluate(() => document.querySelector('.remote__back .btn--primary')?.click());
    await sleep(900);
  }
  const got = await settle();
  const label = u.rows.map((r) => r.label).join(' + ');
  console.log(`◀ [→${await stepNo()}] undo ${label}${q ? `  (asked: ${q.slice(0, 40)})` : ''}\n      ${got}`);
  if (got !== want) errors.push(`◀ after "${label}" shows\n        ${got}\n      but before that ▶ it showed\n        ${want}`);
}
if ((await stepNo()) !== '1') errors.push(`◀ all the way back ended on step ${await stepNo()}, not 1`);

// ---- forward again: the show still runs after a full rewind --------------------
console.log('\n=== ▶ forward again ===');
await forwardFromVideo();
if ((await stepNo()) !== '11') errors.push(`the second run ended on step ${await stepNo()}`);

// ---- report ------------------------------------------------------------------
const md = [
  '| # | step | tap | the projector shows |',
  '|---|---|---|---|',
  ...rows.map((r) => `| ${r.n} | ${r.fromStep}→${r.toStep} | ${r.label} | ${r.after.replace(/\|/g, '/')} |`),
].join('\n');
writeFileSync(`${OUT}taps.md`, md + '\n');
for (const b of bots) b.sock.close();
await browser.close();
await pb.close();
console.log(JSON.stringify({ taps: rows.length, ok: errors.length === 0, errors }, null, 1));
process.exit(errors.length ? 1 : 0);
