/**
 * Real-browser visual check for 스톤: sets up an event and a 스톤 game over the
 * master socket, then screenshots the console and the projector at each moment
 * (setup, idle ring, picked mission, win, podium). Fails on any page error.
 *
 *   npm run build && npm start      # in another terminal
 *   npx tsx scripts/shoot-stones.mjs   # → scripts/shots/stones-*.png (tsx: it reads the game defaults)
 */
import { existsSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { io } from 'socket.io-client';
import { DEFAULT_GAMES, DEFAULT_STONES } from '../stones/src/shared/constants.ts';

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
  teams: ['아이언맨', '헐크', '캡틴 아메리카', '토르', '블랙 위도우', '호크아이'].map((name) => ({ name, playing: true })),
  stones: DEFAULT_STONES.map((name) => ({ name })),
  games: DEFAULT_GAMES,
});
await s('master:start');
// Two stones played so the rankings have shape.
await s('master:pick', { stone: 's3' });
await s('master:resolve', { winners: ['t1', 't4'] });
await s('master:pick', { stone: 's1' });
await s('master:resolve', { winners: ['t1'] });

const p = await open('/p');
await shot(p, '2-projector-idle', 1500);
await shot(console_, '3-console-running', 300);

await s('master:pick', { stone: 's5' });
await shot(p, '4-projector-mission', 1300);
await shot(console_, '5-console-mission', 200);

await s('master:resolve', { winners: ['t2', 't3'] });
await shot(p, '6-projector-win-flare', 450);
await shot(p, '7-projector-win-landed', 2600);

await s('master:pick', { stone: 's2' });
await s('master:resolve', { winners: [] });
await shot(p, '8-projector-none', 500);

// Finish so 아이언맨 and 헐크 tie at 1st, then settle it with 엔드게임.
await s('master:pick', { stone: 's4' });
await s('master:resolve', { winners: ['t2'] });
await s('master:pick', { stone: 's6' });
await s('master:resolve', { winners: [] });
await s('master:end');
await shot(console_, '9a-console-tie', 400);
await s('master:tiebreak:start', { teamIds: ['t1', 't2'] });
await shot(p, '9b-projector-tiebreak', 1400);
await shot(console_, '9c-console-tiebreak', 200);
await s('master:tiebreak:resolve', { order: ['t2', 't1'] });
await s('master:reveal', { step: 0 });
for (const step of [1, 2, 3, 4]) await s('master:reveal', { step });
await shot(p, '9d-projector-podium', 1200);

await browser.close();
m.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`ok — screenshots in ${OUT}/stones-*.png`);
