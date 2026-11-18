/**
 * Which 스톤 animation costs main-thread time? Turns each one off in turn on the
 * idle projector (CPU slowed 4×) and prints main-thread and style time per
 * second. Run after perf-stones.mjs has left a game RUNNING with a mission open
 * or not — it only reads /p.
 *
 *   npx tsx scripts/perf-stones-isolate.mjs
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OFF = {
  baseline: '',
  'orbit ring spin': '.orbit{animation:none!important}',
  'labels counter-spin': '.orbit__upright{animation:none!important}',
  'gem turn': '.orbit__gem,.mission__gem svg{animation:none!important}',
  'gem bob': '.orbit__bob{animation:none!important}',
  'glow pulse': '.orbit__bob::before,.mission__gem::before{animation:none!important}',
  'holo table': '.holo{animation:none!important}',
  'stars twinkle': '.stars{animation:none!important}',
  'scan sweep': '.deck-sweep::before{animation:none!important}',
  'all off': '*,*::before,*::after{animation:none!important}',
};

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
  defaultViewport: { width: 1280, height: 720 },
});
const rows = [];
for (const [label, css] of Object.entries(OFF)) {
  const page = await browser.newPage();
  const cdp = await page.target().createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(`${BASE}/p`, { waitUntil: 'networkidle2' });
  if (css) await page.addStyleTag({ content: css });
  await wait(1200);
  await cdp.send('Performance.enable');
  const a = await cdp.send('Performance.getMetrics');
  await wait(3000);
  const b = await cdp.send('Performance.getMetrics');
  const d = (k) => (b.metrics.find((x) => x.name === k).value - a.metrics.find((x) => x.name === k).value) * 1000 / 3;
  rows.push({
    'turned off': label,
    'task ms/s': +d('TaskDuration').toFixed(0),
    'style ms/s': +d('RecalcStyleDuration').toFixed(1),
    'layout ms/s': +d('LayoutDuration').toFixed(1),
    'style recalcs/s': +((b.metrics.find((x) => x.name === 'RecalcStyleCount').value - a.metrics.find((x) => x.name === 'RecalcStyleCount').value) / 3).toFixed(0),
  });
  await page.close();
}
console.table(rows);
await browser.close();
