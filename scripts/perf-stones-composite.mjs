/**
 * Which 스톤 animations run on the GPU compositor, and which fall back to the
 * main thread? Reads Chrome's layer tree: an element whose transform/opacity
 * animation is composited gets its own layer tagged "active…Animation". Any
 * running animation whose element has no such layer is painted on the main
 * thread every frame — those are the ones that stutter on a busy laptop.
 *
 *   npx tsx scripts/perf-stones-composite.mjs   # with a 스톤 game on /p
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const cdp = await page.target().createCDPSession();
await page.goto(`${BASE}/p`, { waitUntil: 'networkidle2' });
await wait(1500);

// Mark each animated element with an id we can find again in the DOM domain.
const animated = await page.evaluate(() => {
  const out = [];
  let i = 0;
  for (const a of document.getAnimations()) {
    const el = a.effect?.target;
    if (!el) continue;
    const pseudo = a.effect.pseudoElement ?? '';
    const tag = `pa${i++}`;
    if (!pseudo) el.setAttribute('data-pa', `${el.getAttribute('data-pa') ?? ''} ${tag}`.trim());
    out.push({
      tag,
      pseudo,
      element: ((el.getAttribute('class') || el.tagName.toLowerCase()).split(' ')[0]) + pseudo,
      animation: a.animationName ?? '(script)',
    });
  }
  return out;
});

let layers = [];
cdp.on('LayerTree.layerTreeDidChange', (e) => {
  if (e.layers) layers = e.layers;
});
const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
await cdp.send('LayerTree.enable');
await wait(1000);

const nodes = [];
(function walk(n) {
  nodes.push(n);
  for (const c of n.children ?? []) walk(c);
})(root);
const tagOf = new Map();
for (const n of nodes) {
  const a = n.attributes ?? [];
  const i = a.indexOf('data-pa');
  if (i >= 0) for (const t of a[i + 1].split(' ')) tagOf.set(t, n.backendNodeId);
}

const reasons = new Map();
for (const l of layers) {
  if (!l.backendNodeId) continue;
  const r = await cdp.send('LayerTree.compositingReasons', { layerId: l.layerId }).catch(() => ({}));
  reasons.set(l.backendNodeId, [...(reasons.get(l.backendNodeId) ?? []), ...(r.compositingReasonIds ?? [])]);
}

const groups = new Map();
for (const a of animated) {
  const key = `${a.element}|${a.animation}`;
  const g = groups.get(key) ?? { element: a.element, animation: a.animation, running: 0, gpu: 0, why: new Set() };
  g.running++;
  const r = a.pseudo ? null : reasons.get(tagOf.get(a.tag)) ?? [];
  if (r === null) g.gpu = '?';
  else {
    if (r.some((x) => /Active.*Animation/i.test(x)) && g.gpu !== '?') g.gpu++;
    for (const x of r) g.why.add(x);
  }
  groups.set(key, g);
}
console.log(`layers: ${layers.length}`);
console.table([...groups.values()].map((g) => ({ ...g, why: [...g.why].join(' ') })));
await browser.close();
