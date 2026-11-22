// Smoke-check the 진행 순서: sign in, open the tab, put cues on the projector, screenshot both.
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p));
if (!CHROME) throw new Error('no system Chrome/Edge found');
const BASE = process.env.BASE ?? 'http://localhost:3000';
mkdirSync('scripts/shots', { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const errors = [];
const log = (m) => console.log(`[shoot-show] ${m}`);
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
page.on('pageerror', (e) => errors.push(`console: ${e.message}`));
await page.goto(`${BASE}/master`);
await page.waitForSelector('input[type=password], .gametabs, .card');
if (await page.$('input[type=password]')) {
  await page.type('input[type=password]', 'soonot');
  await page.click('button[type=submit]');
}
await page.waitForSelector('.gametabs, .card input:not([type=password])');
if (!(await page.$('.gametabs'))) {
  await page.type('.field__input', '추수감사절 리허설');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.gametabs');
}

const proj = await browser.newPage();
await proj.setViewport({ width: 1280, height: 720 });
proj.on('pageerror', (e) => errors.push(`projector: ${e.message}`));
await proj.goto(`${BASE}/p`);

log('signed in');
await page.bringToFront();
page.setDefaultTimeout(15000);
proj.setDefaultTimeout(15000);
await page.click('#gametab-show');
log('tab clicked');
try { await page.waitForSelector('.cue'); } catch (e) { await page.screenshot({ path: 'scripts/shots/show-debug.png' }); throw e; }
log('cues shown');
await page.bringToFront(); await page.screenshot({ path: 'scripts/shots/show-console.png' });

// Cue 2 = MC 등장 영상 (a slide with no file yet → placeholder title card)
const go = await page.$$('.cue .cue__go');
await go[1].click();
await proj.waitForSelector('.slide:not(.is-leaving) .slide__title');
await new Promise((r) => setTimeout(r, 900));
await proj.bringToFront(); await new Promise((r) => setTimeout(r, 1200)); await proj.screenshot({ path: 'scripts/shots/show-slide.png' });
await page.bringToFront(); await page.screenshot({ path: 'scripts/shots/show-console-live.png' });

// Cue 5 = 메인 보드 (a game screen) → the slide goes away, the stones stage zooms in
await go[4].click();
await new Promise((r) => setTimeout(r, 1200));
const stillSlide = await proj.$('.slide:not(.is-leaving)');
await proj.bringToFront(); await proj.screenshot({ path: 'scripts/shots/show-screen.png' });

console.log(JSON.stringify({ errors, slideGoneOnScreenCue: !stillSlide }));
await browser.close();
