/**
 * Thorough /p effects check. Unlike shoot.mjs (fresh page per shot, which misses
 * the ~1.6s callouts), this keeps ONE projector page open and drives real events,
 * screenshotting the transient animations at the right moment:
 *   fx-lead      bingo points leaderboard (number-only)
 *   fx-throw     윷 throw callout (도/개/걸/윷/모)
 *   fx-malin     말 entrance on the board
 *   fx-minigame  mini-game roulette pop-in (land on a ★ station: 모→5, 도→6)
 *   fx-capture   잡기 callout (both teams to node 3)
 *
 *   node scripts/fxcheck.mjs   # server must be running (npm start)
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
const res = await fetch(`${BASE}/master/auth`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passcode: 'soonot' }),
});
const cookie = res.headers.get('set-cookie').split(';')[0];
const m = io(`${BASE}/master`, { transports: ['websocket'], extraHeaders: { cookie } });
await new Promise((r) => m.on('connect', r));
const send = (ev, p) => new Promise((r) => m.emit(ev, p, r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pending = null;
m.on('throw:recorded', (d) => (pending = d));
const setupYut = async () => {
  await send('master:setup', { gameId: 'yutnori', teams: [{ name: '청년부' }, { name: '장년부' }], malPerTeam: 2, timeLimitMin: 20, miniGames: true });
  await send('master:start', { gameId: 'yutnori' });
};
const throwOnly = async (roll) => { pending = null; await send('master:throw', { gameId: 'yutnori', roll }); await wait(220); };
const move = async () => {
  const c = pending?.candidates?.[0];
  if (c) await send('master:move', { gameId: 'yutnori', malId: c.malId, to: c.to });
  await wait(200);
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await browser.newPage();
await p.setViewport({ width: 1280, height: 720 });
p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
p.on('console', (mm) => mm.type() === 'error' && errors.push(`console: ${mm.text()}`));

// fresh event
await send('event:reset', {});
const created = await send('event:create', { title: 'FX 점검' });
const code = created?.event?.code ?? 'ABCD';

// ---- bingo leaderboard ----------------------------------------------------
await send('master:setTraits', { gameId: 'bingo', texts: Array.from({ length: 25 }, (_, i) => `특징 ${i + 1}`) });
const bots = [];
for (const nm of ['지은', '철수', '영희', '현우', '수빈']) {
  const s = io(`${BASE}/b`, { transports: ['websocket'] });
  await new Promise((x) => s.on('connect', x));
  const ack = await new Promise((x) => s.emit('room:join', { nickname: nm }, x));
  bots.push({ sock: s, id: ack.playerId, number: null });
}
const dealt = Promise.all(bots.map((b) => new Promise((x) => b.sock.once('card:assigned', (d) => x(d)))));
await send('master:start', { gameId: 'bingo' });
(await dealt).forEach((d, i) => (bots[i].number = d.number));
// a couple of fills so ranks differ
for (let k = 0; k < 3; k++) await new Promise((x) => bots[0].sock.emit('cell:fill', { cellIndex: k, query: String(bots[k + 1].number) }, x));
await send('projector:set', { setting: 'bingo' });
await p.goto(`${BASE}/p`, { waitUntil: 'networkidle2' });
await wait(500);
await p.screenshot({ path: `${OUT}/fx-lead.png` });

// ---- 윷놀이 throw callout + 말 entrance ------------------------------------
await setupYut();
await send('projector:set', { setting: 'yutnori' });
await wait(300);
pending = null;
await send('master:throw', { gameId: 'yutnori', roll: '걸' });
await wait(350);
await p.screenshot({ path: `${OUT}/fx-throw.png` }); // big 걸 · 3칸 callout
await move();
await wait(250);
await p.screenshot({ path: `${OUT}/fx-malin.png` }); // 말 on the board (entrance)

// ---- mini-game roulette pop-in (land on ★ node 6: 모→5, 도→6) --------------
await send('game:reset', { gameId: 'yutnori' });
await setupYut();
await throwOnly('모'); await move();   // 대기→5 (모 gives a bonus throw, still 청년부)
await throwOnly('도'); await move();   // 5→6 (★) → mini-game
await wait(500);
await p.screenshot({ path: `${OUT}/fx-minigame-callout.png` }); // 미니게임! callout over the board (first)
await wait(1600);
await p.screenshot({ path: `${OUT}/fx-minigame.png` }); // roulette pops in AFTER the callout finishes
// resolve as FAIL → screen switches back to the board, THEN the 이동 취소 callout plays
await send('master:minigame:resolve', { gameId: 'yutnori', success: false });
await wait(650);
await p.screenshot({ path: `${OUT}/fx-cancel.png` });

// ---- 잡기 callout (both teams to node 3) -----------------------------------
await send('game:reset', { gameId: 'yutnori' });
await setupYut();
await throwOnly('걸'); await move();   // 청년부 대기→3, turn → 장년부
await throwOnly('걸');                  // 장년부 대기→3 …
await move();                           // …lands on 3 where 청년부 is → capture
await wait(350);
await p.screenshot({ path: `${OUT}/fx-capture.png` });

console.log('\nfx screenshots written to', OUT);
console.log(errors.length ? `\n✗ PAGE ERRORS:\n${errors.join('\n')}` : '\n✓ no page/console errors');
await browser.close();
m.close();
bots.forEach((b) => b.sock.close());
process.exit(errors.length ? 1 : 0);
