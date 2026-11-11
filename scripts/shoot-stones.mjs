/**
 * Real-browser visual check for 스톤: sets up an event and a 스톤 game over the
 * master socket, then screenshots the console and the projector at each moment
 * (setup, idle ring, picked mission, win, podium). Fails on any page error.
 *
 *   npm run build && npm start      # in another terminal
 *   node scripts/shoot-stones.mjs   # → scripts/shots/stones-*.png
 */
import { existsSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { io } from 'socket.io-client';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = 'scripts/shots';
mkdirSync(OUT, { recursive: true });

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
if (!CHROME) throw new Error('no system Chrome/Edge found');

const errors = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const res = await fetch(`${BASE}/master/auth`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ passcode: process.env.MASTER_PASSCODE ?? 'soonot' }),
});
const cookie = res.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error(`sign-in failed (${res.status})`);
const m = io(`${BASE}/master`, { transports: ['websocket'], extraHeaders: { cookie } });
await new Promise((r) => m.on('connect', r));
const send = async (ev, p = {}) => {
  const ack = await new Promise((r) => m.emit(ev, p, r));
  if (ack && ack.ok === false) errors.push(`${ev}: ${JSON.stringify(ack.error)}`);
  return ack;
};
const s = (ev, p = {}) => send(ev, { gameId: 'stones', ...p });

await send('event:reset');
await send('event:create', { title: '가을 한마당' });
await send('projector:set', { setting: 'stones' });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
async function open(path, { auth = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('console', (msg) => msg.type() === 'error' && errors.push(`[${path}] console: ${msg.text()}`));
  page.on('pageerror', (e) => errors.push(`[${path}] pageerror: ${e.message}`));
  if (auth) {
    const [name, ...v] = cookie.split('=');
    await page.setCookie({ name, value: v.join('='), domain: new URL(BASE).hostname, path: '/' });
  }
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' });
  return page;
}
const shot = (page, name, ms = 900) => wait(ms).then(() => page.screenshot({ path: `${OUT}/stones-${name}.png` }));

const console_ = await open('/master', { auth: true });
await console_.setViewport({ width: 1440, height: 900 });
// Focus the 스톤 pane so it leads the layout.
await console_.evaluate(() => document.querySelector('.pane--stones')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await shot(console_, '1-console-setup');

await s('master:setup', {
  teams: ['선교', '예배', '양육', '사역', '섬김', '교육', '친교'].map((name) => ({ name, playing: name !== '친교' })),
  stones: [
    { name: '빨강 스톤', mission: '팀 전원이 30초 안에 인간 피라미드 만들기' },
    { name: '주황 스톤', mission: '성경 인물 5명을 몸으로 표현하기' },
    { name: '노랑 스톤', mission: '찬양 한 소절을 이어 부르기' },
    { name: '초록 스톤', mission: '눈 감고 종이컵 10개 쌓기' },
    { name: '파랑 스톤', mission: '퀴즈 3문제 연속 정답' },
    { name: '보라 스톤', mission: '팀장 없이 줄 서기 (생일순)' },
  ],
});
await s('master:start');
// A few turns so the rankings have shape.
const T0 = [['s1', true], ['s3', false], ['s2', true], ['s5', true], ['s4', false], ['s6', true], ['s2', true]];
for (const [stone, success] of T0) {
  await s('master:pick', { stone });
  await s('master:resolve', { success });
}

const p = await open('/p');
await shot(p, '2-projector-idle', 1500);
await shot(console_, '3-console-running', 300);

await s('master:pick', { stone: 's4' });
await shot(p, '4-projector-mission', 1300);
await shot(console_, '5-console-mission', 200);

await s('master:resolve', { success: true });
await shot(p, '6-projector-win-flare', 450);
await shot(p, '7-projector-win-landed', 2600);

await s('master:pick', { stone: 's1' });
await s('master:resolve', { success: false });
await shot(p, '8-projector-fail', 500);

await s('master:end');
await s('master:reveal', { step: 0 });
for (const step of [1, 2, 3, 4]) await s('master:reveal', { step });
await shot(p, '9-projector-podium', 1200);

await browser.close();
m.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`ok — screenshots in ${OUT}/stones-*.png`);
