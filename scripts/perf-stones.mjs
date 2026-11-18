/**
 * Frame-rate check for the 스톤 projector. Drives a game over the master socket,
 * records a Chrome trace of each scene (idle orbit, mission reveal, win burst)
 * at normal speed and with the CPU slowed 4× (a weak projector laptop), and
 * prints frame times, long tasks, tap→screen delay, and busy time per thread
 * (page, compositor, viz, GPU). NO_SPARKS=1 hides the win-spark canvas.
 *
 *   npm run build && npm start          # in another terminal
 *   npx tsx scripts/perf-stones.mjs     # optional: [baseUrl] [--headful]
 */
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { io } from 'socket.io-client';
import { DEFAULT_GAMES, DEFAULT_STONES } from '../stones/src/shared/constants.ts';

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) ?? 'http://localhost:3000';
const HEADFUL = args.includes('--headful');
const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));
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
const send = (ev, p = {}) => new Promise((r) => m.emit(ev, p, r));
const s = (ev, p = {}) => send(ev, { gameId: 'stones', ...p });

async function freshGame() {
  await send('event:reset');
  await send('event:create', { title: '성능 확인' });
  await send('projector:set', { setting: 'stones' });
  await s('master:setup', {
    teams: ['아이언맨', '헐크', '캡틴 아메리카', '토르', '블랙 위도우', '호크아이'].map((name) => ({ name, playing: true })),
    stones: DEFAULT_STONES.map((name) => ({ name })),
    games: DEFAULT_GAMES,
  });
  await s('master:start');
  await s('master:pick', { stone: 's3' });
  await s('master:resolve', { winners: ['t1', 't4'] });
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: HEADFUL ? false : 'new',
  args: ['--no-sandbox', '--window-size=1280,800', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
  defaultViewport: { width: 1280, height: 720 },
});

/** In-page frame clock: rAF intervals while a scene plays. */
const RAF_PROBE = () => {
  window.__frames = [];
  window.__long = [];
  if (!window.__longObs && typeof PerformanceObserver === 'function') {
    window.__longObs = new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration)));
    window.__longObs.observe({ type: 'longtask' });
  }
  if (window.__probing) return; // one clock per page; each scene just empties it
  window.__probing = true;
  let last = performance.now();
  const tick = (t) => {
    window.__frames.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/**
 * One scene. `appear` is a selector whose arrival after `start` is timed:
 * how long from the master's tap to it being on the projector.
 */
async function measure(page, label, ms, start, appear) {
  await page.evaluate(RAF_PROBE);
  if (appear) {
    await page.evaluate((sel) => {
      window.__seenAt = null;
      const mo = new MutationObserver(() => {
        if (document.querySelector(sel)) {
          window.__seenAt = performance.timeOrigin + performance.now();
          mo.disconnect();
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }, appear);
  }
  await page.tracing.start({ categories: ['toplevel', 'viz', 'gpu', 'cc', 'devtools.timeline'] });
  const tapAt = Date.now();
  if (start) await start();
  await wait(ms);
  const buf = await page.tracing.stop();
  const frames = await page.evaluate(() => window.__frames.splice(0));
  const long = await page.evaluate(() => window.__long.splice(0));
  const seenAt = appear ? await page.evaluate(() => window.__seenAt) : null;
  const ev = JSON.parse(Buffer.from(buf).toString('utf8')).traceEvents ?? [];

  const thread = new Map();
  for (const e of ev) if (e.name === 'thread_name') thread.set(`${e.pid}:${e.tid}`, e.args.name);
  const secs = ms / 1000;
  const busy = (name) =>
    +(
      ev
        .filter((e) => e.ph === 'X' && e.dur && /RunTask/.test(e.name) && thread.get(`${e.pid}:${e.tid}`) === name)
        .reduce((a, e) => a + e.dur / 1000, 0) / secs
    ).toFixed(0);
  const iv = frames.slice(2).sort((a, b) => a - b);
  const pct = (p) => (iv.length ? iv[Math.min(iv.length - 1, Math.floor(iv.length * p))] : 0);
  return {
    scene: label,
    'page fps': +(frames.length / secs).toFixed(0),
    'p95 frame ms': +pct(0.95).toFixed(1),
    'worst ms': +(iv.at(-1) ?? 0).toFixed(0),
    'tap→screen ms': seenAt ? Math.round(seenAt - tapAt) : '',
    'long tasks': long.length,
    'longest task ms': long.length ? Math.round(Math.max(...long)) : 0,
    'page ms/s': busy('CrRendererMain'),
    'compositor ms/s': busy('Compositor'),
    'viz ms/s': busy('VizCompositorThread'),
    'gpu ms/s': busy('CrGpuMain'),
  };
}

const rows = [];
for (const slow of [1, 4]) {
  await freshGame();
  const page = await browser.newPage();
  const cdp = await page.target().createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
  await page.goto(`${BASE}/p`, { waitUntil: 'networkidle2' });
  // NO_SPARKS=1: take the spark canvas off the page to see what it costs.
  if (process.env.NO_SPARKS) await page.addStyleTag({ content: 'canvas.sparks{display:none!important}' });
  await wait(1500);
  const tag = slow === 1 ? '' : ` (CPU ${slow}×)`;
  rows.push(await measure(page, `idle orbit${tag}`, 4000));
  rows.push(await measure(page, `mission reveal${tag}`, 3000, () => s('master:pick', { stone: 's1' }), '.mission'));
  rows.push(await measure(page, `mission hold${tag}`, 3000));
  rows.push(await measure(page, `win burst${tag}`, 3000, () => s('master:resolve', { winners: ['t2', 't5'] }), '.burst'));
  await page.close();
}
console.table(rows);
await browser.close();
m.close();
