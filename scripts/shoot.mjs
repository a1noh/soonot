/**
 * Real-browser visual check: drives the system Chrome (no download) against the
 * running built server, sets up an event + a 윷놀이 game, and screenshots every
 * surface — so we can actually SEE that /p renders (jsdom can't show CSS/SVG).
 * Fails loudly on any page/console error.
 *
 *   node scripts/shoot.mjs            # build+start the server first (npm start)
 */
import { existsSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { io } from 'socket.io-client';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = 'scripts/shots';
mkdirSync(OUT, { recursive: true });

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
if (!CHROME) throw new Error('no system Chrome/Edge found');

const errors = [];
let masterCookie = null; // set after auth below
async function shoot(browser, path, file, { wait = 800, auth = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${file}] console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[${file}] pageerror: ${e.message}`));
  if (auth && masterCookie) {
    const [name, ...v] = masterCookie.split('=');
    await page.setCookie({ name, value: v.join('='), domain: 'localhost', path: '/' });
  }
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, wait));
  await page.screenshot({ path: `${OUT}/${file}.png` });
  return page;
}

// ---- set up an event + a running 윷놀이 game via the master socket -----------
const res = await fetch(`${BASE}/master/auth`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ passcode: 'soonot' }),
});
const cookie = res.headers.get('set-cookie').split(';')[0];
masterCookie = cookie;
const m = io(`${BASE}/master`, { transports: ['websocket'], extraHeaders: { cookie } });
let liveCode = null; // the authoritative 참여 코드 of the current event
m.on('event:summary', (s) => { if (s?.code) liveCode = s.code; });
await new Promise((r) => m.on('connect', r));
const send = (ev, p) => new Promise((r) => m.emit(ev, p, r));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

// 1. projector standby (no event yet? we already have one via recovery maybe) — shoot master first
const created = await send('event:create', { title: '가을 한마당' });
await new Promise((r) => setTimeout(r, 150)); // let event:summary arrive
// The QR encodes the live event code; create can no-op if one already exists, so
// trust the summary over the create ack.
const code = liveCode ?? created?.event?.code ?? 'ABCD';
await shoot(browser, '/master', 'master-2-setup', { auth: true, wait: 1200 }); // team form + 미니게임 DB field
await shoot(browser, '/p', 'p-1-setup'); // board should be visible now (board-centric)

// start yutnori
await send('master:setup', {
  gameId: 'yutnori',
  teams: [{ name: '청년부' }, { name: '장년부' }],
  malPerTeam: 2,
  timeLimitMin: 20,
  miniGames: true,
});
await send('master:start', { gameId: 'yutnori' });
// a couple of throws to put 말 on the board
let pending = null;
m.on('throw:recorded', (d) => (pending = d));
await send('master:throw', { gameId: 'yutnori', roll: '개' }); // 대기→2, not a ★ station
await new Promise((r) => setTimeout(r, 150));
if (pending?.candidates?.length) await send('master:move', { gameId: 'yutnori', malId: pending.candidates[0].malId });
await shoot(browser, '/p', 'p-2-running');
// also capture the master console mid-game (throw pad / move UI)
await shoot(browser, '/master', 'master-3-running', { auth: true, wait: 1000 });

// bingo player card + emoji
await send('master:setTraits', { gameId: 'bingo', texts: Array.from({ length: 25 }, (_, i) => `특징 ${i + 1}`) });
// bare /b hits the 참여 코드 gate; scanning the QR lands on /{code} → straight to join
await shoot(browser, '/b', 'b-0-codegate');
const card = await shoot(browser, `/${code}`, 'b-1-join');
// join + fling an emoji, then screenshot /p to catch the floating reaction
await card.evaluate(() => {
  const t = document.querySelector('input'); if (t) { t.value = '민수'; t.dispatchEvent(new Event('input', { bubbles: true })); }
});
const p = await shoot(browser, '/p', 'p-3-prereaction', { wait: 300 });
// fire several reactions from a raw socket so the projector shows them
const r = io(`${BASE}/b`, { transports: ['websocket'] });
await new Promise((x) => r.on('connect', x));
const senders = [['🎉', '민수'], ['❤️', '지은'], ['🔥', '철수'], ['👏', '영희']];
for (const [e, name] of senders) { r.emit('react', { emoji: e, name }); await new Promise((x) => setTimeout(x, 780)); }
await new Promise((x) => setTimeout(x, 400));
await p.screenshot({ path: `${OUT}/p-4-reactions.png` });

console.log('\nscreenshots written to', OUT);
console.log(errors.length ? `\n✗ PAGE ERRORS:\n${errors.join('\n')}` : '\n✓ no page/console errors');
await browser.close();
m.close(); r.close();
process.exit(errors.length ? 1 : 0);
