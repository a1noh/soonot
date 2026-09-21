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
await send('event:reset', {}); // idempotent: clear any leftover event so this run starts clean
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

// ---- bingo: kawaii code-gate, card, celebration + projector join chip -----
await send('master:setTraits', { gameId: 'bingo', texts: Array.from({ length: 25 }, (_, i) => `특징 ${i + 1}`) });
await shoot(browser, '/b', 'b-0-codegate'); // the 참여 코드 gate (kawaii)

// bot players so bingo can start and the roster/online box is populated
const botNames = ['지은', '철수', '영희', '현우', '수빈'];
const bots = [];
for (const nm of botNames) {
  const s = io(`${BASE}/b`, { transports: ['websocket'] });
  await new Promise((x) => s.on('connect', x));
  const ack = await new Promise((x) => s.emit('room:join', { nickname: nm }, x));
  bots.push({ sock: s, id: ack.playerId, number: null });
}
// numbers arrive on card:assigned when the game starts (not on the join ack)
const dealt = Promise.all(bots.map((b) => new Promise((x) => b.sock.once('card:assigned', (d) => x(d)))));
await send('master:start', { gameId: 'bingo' });
(await dealt).forEach((d, i) => (bots[i].number = d.number));
await send('projector:set', { setting: 'bingo' });

// a real browser player joins via the QR link (/{code}) and sees the kawaii card
const card = await browser.newPage();
await card.setViewport({ width: 390, height: 844 }); // a phone
card.on('console', (mm) => mm.type() === 'error' && errors.push(`[b-card] console: ${mm.text()}`));
card.on('pageerror', (e) => errors.push(`[b-card] pageerror: ${e.message}`));
await card.goto(`${BASE}/${code}`, { waitUntil: 'networkidle2' });
await new Promise((x) => setTimeout(x, 400));
await card.screenshot({ path: `${OUT}/b-1-join.png` }); // kawaii join form
await card.type('input', '민지');
await card.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('입장'));
  b && b.click();
});
await new Promise((x) => setTimeout(x, 900));
await card.screenshot({ path: `${OUT}/b-2-card.png` }); // the kawaii empty card

// fill a cell by naming a bot (by number) — shows the cute stamp
async function fillCell(i, num) {
  await card.evaluate((k) => document.querySelectorAll('.cell')[k]?.click(), i);
  await new Promise((x) => setTimeout(x, 220));
  await card.type('.sheet .field__input', String(num));
  await card.keyboard.press('Enter');
  await new Promise((x) => setTimeout(x, 320));
}
// three fills → cute stamps, not yet a bingo
await fillCell(0, bots[0].number);
await fillCell(1, bots[1].number);
await fillCell(2, bots[2].number);
await card.screenshot({ path: `${OUT}/b-3-card-filled.png` });

// complete row 0 (cells 3,4 with two more distinct bots) → BINGO celebration
await fillCell(3, bots[3].number);
await fillCell(4, bots[4].number);
await new Promise((x) => setTimeout(x, 500));
await card.screenshot({ path: `${OUT}/b-4-celebrate.png` });

// projector on the bingo view — join chip + who's-online box
await shoot(browser, '/p', 'p-3-bingo');

// reactions floating up the projector's right side, with names
const p = await browser.newPage();
await p.setViewport({ width: 1280, height: 720 });
await p.goto(`${BASE}/p`, { waitUntil: 'networkidle2' });
await new Promise((x) => setTimeout(x, 400));
const senders = [['🎉', '민지'], ['❤️', '지은'], ['🔥', '철수'], ['👏', '영희']];
for (let i = 0; i < senders.length; i++) {
  bots[i % bots.length].sock.emit('react', { emoji: senders[i][0], name: senders[i][1] });
  await new Promise((x) => setTimeout(x, 780));
}
await new Promise((x) => setTimeout(x, 400));
await p.screenshot({ path: `${OUT}/p-4-reactions.png` });

console.log('\nscreenshots written to', OUT);
console.log(errors.length ? `\n✗ PAGE ERRORS:\n${errors.join('\n')}` : '\n✓ no page/console errors');
await browser.close();
m.close();
bots.forEach((b) => b.sock.close());
process.exit(errors.length ? 1 : 0);
