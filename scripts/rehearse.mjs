/**
 * The whole 어벤추수 땡스게임 대본, end to end, run the way the master will run it:
 * pressing → (the remote's 다음 ▶ / a presenter clicker) — the only other taps
 * are the room's choices (which stone, who won, the 결정전 order). 12 bot phones
 * play bingo. Checks the video waits for 다음, every sound plays, 🔇 silences
 * everything and ↺ 전체 초기화 leaves the event ready for another run.
 * Saves a console + projector screenshot at every moment to scripts/shots/rehearsal/.
 *
 *   node scripts/rehearse.mjs [baseUrl]        (default http://localhost:3100)
 *
 * ⚠ It plays the CURRENT event on that server to the end. Use a throwaway server:
 *   (from master/) PORT=3100 DB_PATH=/tmp/rehearsal.db MEDIA_DIR=./media npx tsx src/index.server.ts
 */
import puppeteer from 'puppeteer-core';
import { io } from 'socket.io-client';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:3100';
const [PW, PH] = (process.env.PROJ ?? '1280x720').split('x').map(Number);
const OUT = `scripts/shots/rehearsal/${PW}x${PH}/`;
mkdirSync(OUT, { recursive: true });
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[rehearse]', ...a);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const m = await browser.newPage();
m.setDefaultTimeout(20000);
m.on('pageerror', (e) => errors.push('console: ' + e.message));
m.on('dialog', (d) => d.accept());
await m.setViewport({ width: 1000, height: 1150 });
// The projector gets its own window, as on the night (switching tabs would drop its fullscreen).
const projBrowser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const p = await projBrowser.newPage();
p.setDefaultTimeout(20000);
p.on('pageerror', (e) => errors.push('projector: ' + e.message));
await p.setViewport({ width: PW, height: PH });
// Record every sound the projector actually starts (effects, music, video).
await p.evaluateOnNewDocument(() => {
  window.__plays = [];
  const orig = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function play(...args) {
    const src = this.currentSrc || this.src || '';
    const name = src.startsWith('data:') ? 'tick' : decodeURIComponent(src.split('/').pop() || '').replace(/-[\w]{8}\.mp3$/, '.mp3');
    if (!this.muted) window.__plays.push(name);
    return orig.apply(this, args);
  };
});
const plays = () => p.evaluate(() => window.__plays.slice());

let shotN = 0;
async function shot(name) {
  shotN += 1;
  const n = String(shotN).padStart(2, '0');
  await m.bringToFront();
  await m.screenshot({ path: `${OUT}${n}-${name}-console.png` });
  await p.bringToFront();
  await sleep(900); // let the projector's transition finish (background tabs pause animations)
  await p.screenshot({ path: `${OUT}${n}-${name}-projector.png` });
  const fit = await p.evaluate(() => {
    const d = document.documentElement;
    const over = [...document.querySelectorAll('h1, h2, .podium__row, .tally__team, .ranks, .tb__team, .slide__title, .ptimer, .joinchip, .bingo, .board')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > innerWidth + 2 || r.bottom > innerHeight + 2 || r.left < -2);
      })
      .map((el) => el.className.toString().split(' ')[0]);
    return { scrollX: d.scrollWidth > innerWidth + 2, scrollY: d.scrollHeight > innerHeight + 2, over, fs: !!document.fullscreenElement };
  });
  if (fit.scrollX || fit.scrollY || fit.over.length) errors.push(`${name} @${PW}x${PH}: ${JSON.stringify(fit)}`);
  if (!fit.fs) errors.push(`${name}: projector left fullscreen`);
  await m.bringToFront();
}
async function click(scope, text, { exact = false } = {}) {
  const ok = await m.evaluate(
    (s, t, ex) => {
      const b = [...document.querySelectorAll(`${s} button`)].find(
        (x) => !x.disabled && x.offsetParent !== null && (ex ? x.textContent.trim() === t : x.textContent.includes(t)),
      );
      if (b) b.click();
      return !!b;
    },
    scope, text, exact,
  );
  if (!ok) throw new Error(`no button "${text}" in ${scope}`);
  await sleep(700);
}
const step = () => m.$eval('.remote__count', (e) => e.textContent.trim().split('/')[0].trim());
const title = () => m.$eval('.remote__title', (e) => e.textContent.trim());
const nextLabel = () => m.$eval('.remote__next', (b) => b.textContent.trim().replace(/\s+/g, ' ')).catch(() => '(none)');

/** One press of → — exactly what a presenter clicker sends. Waits out ⏳ states. */
async function press(expect) {
  for (let i = 0; i < 30 && /기다리는 중/.test(await nextLabel()); i++) await sleep(250);
  const label = await nextLabel();
  if (expect && !label.includes(expect)) errors.push(`→ expected "${expect}", the button said "${label}"`);
  await m.bringToFront();
  await m.keyboard.press('ArrowRight');
  await sleep(1000);
  log(`→ ${label.split(/(?<=[^▶])\s{0}(?=🎮|📝|🎬|🖼)/)[0]}   ⇒ step ${await step()} · ${await title()}`);
}
async function waitStep(n) {
  for (let i = 0; i < 40; i++) {
    if ((await step()) === String(n)) return;
    await sleep(250);
  }
  throw new Error(`remote did not move to step ${n} (at ${await step()})`);
}

// ---- sign in, a fresh event --------------------------------------------------
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
  await m.type('.card input', '어벤추수 리허설');
  await m.keyboard.press('Enter');
  await m.waitForSelector('.gametabs');
}
await m.waitForSelector('.remote');
await p.goto(`${BASE}/p`);
await p.waitForSelector('.fsbtn');
await p.click('.fsbtn'); // ⛶ 전체화면 — also the tap that lets the projector play sound
await sleep(600);
await m.bringToFront();

// ---- 1 빙고 QR 안내 ---------------------------------------------------------------
await press('시작하기'); // the same tap sets the bingo up: the QR works at once
const POOL = ['민지', '지은', '철수', '영희', '현우', '수빈', '지훈', '예린', '도윤', '하늘', '서준', '유나'];
const bots = [];
for (const name of POOL) {
  const sock = io(`${BASE}/b`, { transports: ['websocket'] });
  await new Promise((r) => sock.on('connect', r));
  const b = { sock, number: null, name };
  sock.on('card:assigned', (d) => (b.number = d.number));
  await new Promise((r) => sock.emit('room:join', { nickname: name }, r));
  bots.push(b);
}
await sleep(800);
await shot('bingo-qr-lobby');
await press('빙고 게임 시작 (12명)');
for (let i = 0; i < 20 && bots.some((b) => b.number === null); i++) await sleep(250);
for (const [i, b] of bots.entries()) {
  const count = i === 0 ? 15 : i < 4 ? 10 : 5;
  const others = bots.filter((x) => x !== b);
  for (let c = 0; c < count; c++) b.sock.emit('cell:fill', { cellIndex: c, query: String(others[c % others.length].number) });
}
await sleep(1500);
await shot('bingo-running');

// ---- 2 MC 등장 영상 ---------------------------------------------------------------
await press('MC 등장 영상'); // one tap: the step opens and the video plays
await sleep(2500);
const playing = await p.$eval('.slide video', (v) => ({ t: v.currentTime, paused: v.paused })).catch(() => null);
if (!playing || playing.paused) errors.push('the video did not start with the tap that opened its step');
await shot('intro-playing');
log('video', JSON.stringify(playing));

// ---- 3 빙고 마감 안내: a sign across the bingo screen, no timer of its own -------------
await press('빙고 마감 안내');
await sleep(800);
if (await m.$('.remote__timer.is-running')) errors.push('the 마감 안내 started a timer by itself');
if (await p.$('.ptimer')) errors.push('the projector shows a timer on the 마감 안내');
const sign = await p.$eval('.pbanner', (e) => e.textContent).catch(() => '');
if (!sign.includes('6시까지')) errors.push(`the 마감 안내 banner is missing ("${sign}")`);
await shot('bingo-closing-sign');
// (The last seconds tick and 시간 종료 buzzes: a short timer from the event bar first.)
await m.evaluate(() => { document.querySelector('.timer summary')?.click(); });
await m.type('input[aria-label="직접 입력 (초)"]', '6');
await click('.timer', '시작');
await sleep(7500);
await m.evaluate(() => { document.querySelector('.timer')?.removeAttribute('open'); });
// The optional ⏱ 5분 chip still works if the MC wants it.
await click('.remote__do', '5분 타이머');
await sleep(600);
if (!(await p.$('.ptimer'))) errors.push('⏱ 5분 did not put a timer on the projector');

// ---- 4 빙고 1등 공개: the tap that opens it ends bingo (and the ⏱) and starts the reveal --
await press('빙고 1등 공개');
const timerLeft = await m.evaluate(() => document.querySelector('.remote__timer.is-running') !== null);
if (timerLeft) errors.push('빙고 종료 left the 5분 timer running');
await sleep(3200); // 두구두구 → 3등 (by itself)
await press('2등 공개');
await shot('bingo-2nd-hero');
await press('1등 공개');
const bingoHero = await p.$eval('.phero__name', (e) => e.textContent).catch(() => '');
if (!bingoHero) errors.push('the bingo 1등 is not shown big');
await shot('bingo-1st-hero');
await press('함께');
await shot('bingo-podium');
await press('1등 카드');
await press('랜덤 5명');
await shot('bingo-winner-card-check5');
await press('1등 상품');
await shot('bingo-prize');

// ---- 5 게임 방식 · 6 자리 안내도 · 7 메인 보드 ------------------------------------------
await press('게임 방식');
await shot('rules-slide');
await press('자리 안내도');
await shot('seating-slide');
await press('메인 보드'); // one tap: the board is set up and started, 빙고 1등 choosing
if (await p.$('.join')) errors.push('the 스톤 board shows a join QR');
const firstChooser = await m.$eval('.srm__steplabel b', (b) => b.textContent.trim()).catch(() => '');
log('first chooser:', firstChooser);
if (!firstChooser.startsWith('빙고 1등')) errors.push(`round 1 chooser should be the 빙고 1등, was "${firstChooser}"`);
await shot('stones-main-board');

// ---- 8 스톤 게임 (one step): the room's choices are taps; the game is the path ----
await press('스톤 게임');
const roundNow = () => m.$eval('.remote__roundnow b', (b) => b.textContent.trim()).catch(() => '');
if (await m.$('.remote__next')) errors.push('the 스톤 step still shows a 다음 button');
const WINNERS = [['토르'], ['블랙 위도우'], ['토르'], ['블랙 위도우'], ['헐크'], ['토르', '블랙 위도우']];
let mutedMark = 0;
for (let r = 1; r <= 6; r++) {
  if ((await roundNow()) !== `${r}라운드` && r <= 6) errors.push(`expected ${r}라운드, the remote shows "${await roundNow()}"`);
  if (r === 3) await click('.srm__chips', '아이언맨'); // 대본: 2라운드 꼴찌 팀이 고름
  if (r === 2) {
    await m.click('.mute');
    await sleep(600);
    mutedMark = (await plays()).length;
  }
  if (r < 6) {
    const stone = await m.$eval('.srm__stones button:not(:disabled)', (b) => b.textContent.trim());
    await click('.srm__stones', stone);
  } else {
    await click('.srm', '마지막 스톤 열기');
  }
  await shot(`round${r}-game-open`);
  // No round's timer starts by itself (the rules come first), and none carries over.
  if (await p.$('.ptimer')) errors.push(`round ${r} opened with a timer: "${await p.$eval('.ptimer', (e) => e.textContent.trim())}"`);
  // Rounds 1, 2 and 4 have one: the MC starts it from the remote as play starts.
  if ([1, 2, 4].includes(r)) {
    await click('.remote__do', '타이머');
    await sleep(600);
    if (!(await p.$('.ptimer'))) errors.push(`round ${r}: ⏱ did not put the timer on the projector`);
    if (r === 1) await shot('round1-timer-started');
  }
  // 4지선다: a question goes up with only 1–4 on the projector; the 보기 stay on the remote.
  if (r === 3) {
    await click('.remote__qnav', '문제 1 화면에 띄우기');
    await sleep(700);
    const q = await p.$eval('.pquiz', (e) => e.textContent).catch(() => '');
    if (!q.includes('문제 1')) errors.push(`round 3: the question is not on the projector ("${q.slice(0, 40)}")`);
    if (q.includes('골리앗')) errors.push('round 3: the projector shows the 보기');
    await shot('round3-quiz-question');
    await click('.remote__qnav', '다음 문제');
    await sleep(500);
    if (!(await p.$eval('.pquiz', (e) => e.textContent).catch(() => '')).includes('문제 2')) errors.push('round 3: 다음 문제 did not move the projector');
  }
  // 일심동체: the 제시어 are on the remote only.
  if (r === 6) {
    const words = await m.$$eval('.remote__words li', (l) => l.length).catch(() => 0);
    if (words !== 6) errors.push(`round 6: the remote shows ${words} teams of 제시어`);
    if ((await p.content()).includes('하트')) errors.push('round 6: a 제시어 is on the projector');
    await shot('round6-words');
  }
  if (r === 2) {
    const during = (await plays()).slice(mutedMark);
    log('sounds while muted:', JSON.stringify(during));
    if (during.length) errors.push(`sound played while muted: ${during.join(', ')}`);
    await m.click('.mute');
    await sleep(600);
  }
  for (const w of WINNERS[r - 1]) await click('.srm__winners', w);
  await click('.srm__row', '스톤 주기');
  await sleep(800);
  if (r === 3 && (await p.$('.pquiz'))) errors.push('the quiz question stayed up after round 3 ended');
  log(`round ${r} given → ${r < 6 ? `now ${await roundNow()}` : `step ${await step()} · ${await title()}`}`);
  if (r === 2) {
    // ◀ 이전 inside the 스톤 step: undo round 2's result, then play it again.
    await m.keyboard.press('ArrowLeft');
    await sleep(600);
    const q = await m.$eval('.remote__backq', (e) => e.textContent.trim()).catch(() => '');
    log('◀ 이전 asks:', q);
    if (!q.includes('2라운드 결과')) errors.push(`◀ 이전 in round 3 should offer to undo round 2, said "${q}"`);
    await click('.remote__back', '2라운드로 되돌리기');
    await sleep(600);
    if ((await roundNow()) !== '2라운드') errors.push(`after the undo the remote shows "${await roundNow()}"`);
    const stone = await m.$eval('.srm__stones button:not(:disabled)', (b) => b.textContent.trim());
    await click('.srm__stones', stone);
    for (const w of WINNERS[1]) await click('.srm__winners', w);
    await click('.srm__row', '스톤 주기');
    await sleep(800);
    log('round 2 replayed → now', await roundNow());
  }
}
await waitStep(9); // the 6th stone moved the script on to 최종 집계

// ---- 9 최종 집계 · 타이브레이커 (1위 동점: 토르 · 블랙 위도우) ------------------------
await press('스톤 게임 종료');
await shot('final-tie-for-first');
await press('1위 결정전');
await click('.remote__do', '컵 놓기');
await sleep(600);
const tbTimer = await p.$eval('.ptimer', (e) => e.textContent.trim()).catch(() => '');
if (!tbTimer.includes('컵 놓기')) errors.push(`the 결정전 20초 timer is not on the projector ("${tbTimer}")`);
await click('.stn__order', '블랙 위도우').catch(async () => click('.remote__game', '블랙 위도우'));
await click('.stn__order', '토르').catch(async () => click('.remote__game', '토르'));
await click('.remote__game', '결과 확정');
await shot('tiebreak-decided');

// ---- 10 최종 시상 · 11 감사합니다 -------------------------------------------------
await press('최종 시상'); // one tap: the step opens with the 순위 발표 drumroll
await sleep(3200);
await press('2위 공개');
await shot('final-2nd-hero');
await press('2위 상금');
const prize2 = await p.$eval('.phero__prize', (e) => e.textContent).catch(() => '');
if (!prize2.includes('50불')) errors.push(`2위 prize beat shows "${prize2}"`);
await press('1위 공개');
if (await p.$('.phero__prize')) errors.push('1위 opened with a prize already showing');
await shot('final-1st-hero');
await press('1위 상금');
const prize1 = await p.$eval('.phero__prize', (e) => e.textContent).catch(() => '');
if (!prize1.includes('100불')) errors.push(`1위 prize beat shows "${prize1}"`);
await shot('final-1st-prize');
await press('모두 함께');
await shot('final-podium');
await press('감사합니다');
await shot('thanks');

// ---- ↺ 전체 초기화: everything back to the start, ready for the next run ------------
await m.evaluate(() => [...document.querySelectorAll('.remote__restart')].find((b) => b.offsetParent)?.click());
await sleep(1500);
const afterReset = await m.evaluate(() => ({
  step: document.querySelector('.remote__count')?.textContent.trim(),
  tabs: [...document.querySelectorAll('.gametab .gametab__state')].map((e) => e.textContent.trim()),
}));
log('after 전체 초기화:', JSON.stringify(afterReset));
if (!afterReset.step?.startsWith('0')) errors.push(`전체 초기화 left the remote at ${afterReset.step}`);
if (await p.$('.slide:not(.is-leaving)')) errors.push('전체 초기화 left a slide on the projector');

const heard = await plays();
const count = {};
for (const n of heard) count[n] = (count[n] ?? 0) + 1;
log('sounds the projector played:', JSON.stringify(count));
for (const need of ['ding.mp3', 'reveal.mp3', 'win.mp3', 'boom.mp3', 'drumroll.mp3', 'fanfare.mp3', 'tick', 'buzzer.mp3', 'heroic-age.mp3', 'five-armies.mp3']) {
  if (!count[need]) errors.push(`never heard ${need}`);
}
for (const b of bots) b.sock.close();
await browser.close();
await projBrowser.close();
console.log(JSON.stringify({ ok: errors.length === 0, shots: shotN, errors }, null, 1));
