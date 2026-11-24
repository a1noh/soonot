/**
 * The other ways an evening can go — each scenario starts from ↺ 전체 초기화 and
 * drives only the 진행 순서 remote (→ / ←, the room's choices, the jump list).
 *
 *   node scripts/rehearse-paths.mjs [baseUrl]   (default http://localhost:3100 — a throwaway server)
 */
import puppeteer from 'puppeteer-core';
import { io } from 'socket.io-client';
import { existsSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:3100';
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const pageErrors = [];
const m = await browser.newPage();
m.setDefaultTimeout(15000);
m.on('pageerror', (e) => pageErrors.push(e.message));
m.on('dialog', (d) => d.accept());
await m.setViewport({ width: 1000, height: 1150 });
const p = await browser.newPage();
p.on('pageerror', (e) => pageErrors.push('projector: ' + e.message));
await p.goto(`${BASE}/p`);
await m.bringToFront();

// ---- helpers -----------------------------------------------------------------
const step = () => m.$eval('.remote__count', (e) => Number(e.textContent.trim().split('/')[0])).catch(() => -1);
const nextText = () => m.$eval('.remote__next', (b) => b.textContent.replace(/\s+/g, ' ').trim()).catch(() => '(no 다음)');
const nextDisabled = () => m.$eval('.remote__next', (b) => b.disabled).catch(() => null);
const roundNow = () => m.$eval('.remote__roundnow b', (b) => b.textContent.trim()).catch(() => '');
const backQ = () => m.$eval('.remote__backq', (e) => e.textContent.trim()).catch(() => '');
async function press() {
  for (let i = 0; i < 30 && /기다리는 중/.test(await nextText()); i++) await sleep(250);
  await m.keyboard.press('ArrowRight');
  await sleep(900);
}
async function back() {
  await m.keyboard.press('ArrowLeft');
  await sleep(700);
}
async function click(scope, text) {
  const ok = await m.evaluate((s, t) => {
    const b = [...document.querySelectorAll(`${s} button`)].find((x) => !x.disabled && x.offsetParent !== null && x.textContent.includes(t));
    if (b) b.click();
    return !!b;
  }, scope, text);
  if (!ok) throw new Error(`no button "${text}" in ${scope}`);
  await sleep(700);
}
async function jump(n) {
  await m.evaluate((i) => {
    const d = document.querySelector('.remote__all');
    d.open = true;
    document.querySelectorAll('.remote__row')[i].click();
  }, n - 1);
  await sleep(900);
}
async function reset() {
  await m.evaluate(() => [...document.querySelectorAll('.remote__restart')].find((b) => b.offsetParent)?.click());
  await sleep(1500);
}
async function views() {
  return m.evaluate(() => [...document.querySelectorAll('.gametab__state')].map((e) => e.textContent.trim()));
}
let bots = [];
async function joinBots(n) {
  for (let i = 0; i < n; i++) {
    const sock = io(`${BASE}/b`, { transports: ['websocket'] });
    await new Promise((r) => sock.on('connect', r));
    await new Promise((r) => sock.emit('room:join', { nickname: `봇${bots.length + 1}` }, r));
    bots.push(sock);
  }
  await sleep(600);
}
function dropBots() {
  for (const s of bots) s.close();
  bots = [];
}
/** From a fresh start: bingo running with `n` bots. Ends on step 1. */
async function bingoRunning(n = 6) {
  await press(); // → step 1 (the same tap sets the bingo up)
  await joinBots(n);
  await press(); // 빙고 게임 시작
}
/** Stones set up and started on step 7, the main board (bingo skipped: the guest chooser is absent). */
async function stonesStarted() {
  await jump(7); // opening the board sets 스톤 up and starts it
}
async function playRound(winners) {
  const stone = await m.$eval('.srm__stones button:not(:disabled)', (b) => b.textContent.trim()).catch(() => null);
  if (stone) await click('.srm__stones', stone);
  else await click('.srm', '마지막 스톤 열기');
  for (const w of winners) await click('.srm__winners', w);
  await click('.srm__row', '스톤 주기');
  await sleep(500);
}

const results = [];
async function scenario(name, fn) {
  const errs = [];
  const expect = (cond, msg) => {
    if (!cond) errs.push(msg);
  };
  try {
    await reset();
    await fn(expect);
  } catch (e) {
    errs.push('threw: ' + e.message);
  }
  dropBots();
  results.push({ name, ok: errs.length === 0, errs });
  console.log(`${errs.length ? '✗' : '✓'} ${name}${errs.length ? '\n    - ' + errs.join('\n    - ') : ''}`);
}

// ---- sign in -------------------------------------------------------------------
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
  await m.type('.card input', '경로 테스트');
  await m.keyboard.press('Enter');
  await m.waitForSelector('.gametabs');
}
await m.waitForSelector('.remote');

// ---- scenarios ---------------------------------------------------------------
await scenario('빙고: 1명뿐이면 다음은 기다림, 2명이 되면 “게임 시작”', async (expect) => {
  await press(); // → step 1, bingo set up in the same tap
  await joinBots(1);
  expect(/기다리는 중/.test(await nextText()), `1명: 다음 = "${await nextText()}"`);
  expect((await nextDisabled()) === true, '1명: 다음이 눌려요');
  await joinBots(1);
  expect(/빙고 게임 시작 \(2명\)/.test(await nextText()), `2명: 다음 = "${await nextText()}"`);
});

await scenario('마감 안내: 타이머 없이 안내만, ⏱ 를 누르면 시작, 다음 ▶ 영상이 타이머를 끝내고, 그다음 ▶ 이 빙고 종료 + 순위 발표', async (expect) => {
  await bingoRunning();
  await jump(2);
  expect(!(await m.$('.remote__timer.is-running')), '타이머가 저절로 시작됐어요');
  expect(!!(await p.$('.pbanner')), '발표 화면에 안내가 없어요');
  await click('.remote__do', '5분 타이머');
  await sleep(500);
  expect(!!(await p.$('.ptimer')), '⏱ 를 눌러도 타이머가 없어요');
  expect(/MC 등장 영상/.test(await nextText()), `다음 = "${await nextText()}"`);
  await press(); // → 영상 (the ⏱ ends with the step)
  await sleep(500);
  expect(!(await p.$('.ptimer')), '영상 위에 타이머가 남아 있어요');
  expect(/빙고 1등 공개.*빙고 종료/.test(await nextText()), `다음 = "${await nextText()}"`);
  await press(); // → 빙고 1등 공개: bingo ends and the reveal starts in this one tap
  await sleep(600);
  expect((await step()) === 4, `step ${await step()}`);
  expect(!(await m.$('.remote__timer.is-running')), '빙고 종료 뒤에도 타이머가 돌아요');
  expect(!!(await p.$('.stage--podium')), '순위 발표가 시작되지 않았어요');
});

await scenario('라운드: 룰 설명 중엔 타이머 없음, ⏱ 를 눌러야 시작, ⟲ 로 다시', async (expect) => {
  await stonesStarted();
  await jump(8);
  const stone = await m.$eval('.srm__stones button:not(:disabled)', (b) => b.textContent.trim());
  await click('.srm__stones', stone); // 1라운드 열림: 룰 설명부터
  await sleep(600);
  expect(!(await m.$('.remote__timer.is-running')), '1라운드 타이머가 룰 설명 중에 저절로 시작됐어요');
  expect(!(await p.$('.ptimer')), '발표 화면에 타이머가 벌써 떠 있어요');
  await click('.remote__do', '20초 타이머'); // 게임 시작
  expect(!!(await m.$('.remote__timer.is-running')), '⏱ 20초가 안 돌아요');
  await click('.remote__do', '타이머 멈추기');
  const again = await m.$eval('.remote__timer', (b) => b.textContent).catch(() => '');
  expect(/20초 타이머/.test(again), `멈춘 뒤 버튼 "${again}"`);
  await click('.remote__do', '20초 타이머'); // 다음 경기: 다시 20초
  expect(!!(await m.$('.remote__timer.is-running')), '다시 누른 20초가 안 돌아요');
});

await scenario('다른 장면으로 가면 그 장면의 타이머는 끝나요', async (expect) => {
  await bingoRunning();
  await jump(2);
  await click('.remote__do', '5분 타이머');
  await jump(5);
  const timer = await p.$('.ptimer');
  expect(!timer, '발표 화면에 타이머가 남아 있어요');
});

await scenario('메인 보드에서 스톤을 고르면 라운드 장면으로 바로 넘어가요', async (expect) => {
  await stonesStarted();
  expect((await step()) === 7, `step ${await step()}`);
  const stone = await m.$eval('.srm__stones button:not(:disabled)', (b) => b.textContent.trim());
  await click('.srm__stones', stone);
  await sleep(600);
  expect((await step()) === 8, `스톤 선택 뒤 step ${await step()}`);
  expect((await roundNow()) === '1라운드', `라운드 "${await roundNow()}"`);
});

await scenario('스톤 라운드 중엔 다음 버튼이 없고, → 키도 아무것도 안 해요', async (expect) => {
  await stonesStarted();
  await jump(8);
  expect(!(await m.$('.remote__next')), '다음 버튼이 보여요');
  await m.keyboard.press('ArrowRight');
  await sleep(600);
  expect((await step()) === 8, `→ 뒤 step ${await step()}`);
});

await scenario('라운드 중 ◀ 이전: 스톤 선택 취소 → 지난 라운드 결과 되돌리기', async (expect) => {
  await stonesStarted();
  await jump(8);
  await playRound(['토르']);
  const stone = await m.$eval('.srm__stones button:not(:disabled)', (b) => b.textContent.trim());
  await click('.srm__stones', stone); // 2라운드 진행 중
  await back();
  expect(/2라운드 스톤 선택을 취소/.test(await backQ()), `물음 "${await backQ()}"`);
  await click('.remote__back', '스톤 선택 취소');
  expect(!(await m.$('.srm__card--on')), '선택이 안 취소됐어요');
  await back();
  expect(/1라운드 결과를 되돌릴까요/.test(await backQ()), `물음 "${await backQ()}"`);
  await click('.remote__back', '1라운드로 되돌리기');
  await sleep(600);
  // Round 1 began on the 메인 보드 (the pick moved the remote on): taking it back returns there.
  expect((await step()) === 7, `step ${await step()}`);
  expect((await views())[3] === '진행 중', `스톤 상태 ${(await views())[3]}`);
});

await scenario('라운드 진행 중 자리 안내로 ◀: “스톤도 처음으로” 또는 장면만 이동', async (expect) => {
  await stonesStarted();
  await jump(8);
  await playRound(['헐크']);
  await jump(6);
  expect(/스톤 게임도 처음/.test(await backQ()), `물음 "${await backQ()}"`);
  await click('.remote__back', '장면만 이동');
  expect((await step()) === 6, `장면만 이동 뒤 step ${await step()}`);
});

await scenario('동점 없이 끝나면 결정전 없이 바로 시상으로', async (expect) => {
  await stonesStarted();
  await jump(8);
  for (const w of [['토르'], ['토르'], ['헐크'], ['아이언맨'], ['호크아이'], ['캡틴 아메리카']]) await playRound(w);
  await sleep(600);
  expect((await step()) === 9, `6라운드 뒤 step ${await step()}`);
  await press(); // 게임 종료
  expect(/다음 장면.*최종 시상/.test(await nextText()), `종료 뒤 다음 = "${await nextText()}"`);
  await press(); // → 최종 시상, the drumroll starts in the same tap
  await sleep(3500);
  expect((await step()) === 10, `step ${await step()}`);
  expect(/2위 공개/.test(await nextText()), `시상: 다음 = "${await nextText()}"`);
});

await scenario('최종 집계에서 ◀: 먼저 게임 종료 취소, 한 번 더 ◀ 면 라운드로 (◀ = 다음의 거울)', async (expect) => {
  await stonesStarted();
  await jump(8);
  for (const w of [['토르'], ['토르'], ['헐크'], ['아이언맨'], ['호크아이'], ['캡틴 아메리카']]) await playRound(w);
  await sleep(600);
  await press(); // 게임 종료
  const label = await m.$eval('.remote__prev', (b) => b.textContent.replace(/\s+/g, ' ').trim());
  expect(/게임 종료 취소/.test(label), `◀ = "${label}"`);
  await back();
  expect((await step()) === 9, `◀ 한 번 뒤 step ${await step()}`);
  expect((await views())[3] === '진행 중', `스톤 상태 ${(await views())[3]}`);
  expect(/스톤 게임 종료/.test(await nextText()), `다음 = "${await nextText()}"`);
  await back(); // the tap before was the 6th stone: ◀ offers to take it back
  expect(/6라운드 결과를 되돌릴까요/.test(await backQ()), `물음 "${await backQ()}"`);
  await click('.remote__back', '6라운드로 되돌리기');
  await sleep(700);
  expect((await step()) === 8, `◀ 두 번 뒤 step ${await step()}`);
  expect((await roundNow()) === '6라운드', `라운드 "${await roundNow()}"`);
});

await scenario('↺ 전체 초기화 (게임 중간에): 0번으로, 모든 게임 준비, 화면 정리', async (expect) => {
  await bingoRunning();
  await press(); // → 영상 (plays in the same tap)
  await reset();
  expect((await step()) === 0, `step ${await step()}`);
  const v = await views();
  expect(v.slice(1).every((s) => s === '준비 중'), `게임 상태 ${v.join(', ')}`);
  expect(!(await p.$('.slide:not(.is-leaving)')), '슬라이드가 남아 있어요');
});

await scenario('빙고 1등 공개에서 ◀ 를 계속: 발표가 한 단계씩 거꾸로, 발표 화면도 따라와요', async (expect) => {
  await bingoRunning(6);
  for (const b of bots) for (let c = 0; c < 6; c++) b.emit('cell:fill', { cellIndex: c, query: String(((c + 2) % 6) + 1) });
  await jump(4); // opening 1등 공개 ends bingo and starts the reveal
  await sleep(3500);
  await press(); // 2등
  await press(); // 1등
  const labels = [];
  for (let i = 0; i < 6; i++) {
    labels.push(await m.$eval('.remote__prev', (b) => b.textContent.replace(/\s+/g, ' ').trim()));
    await back();
    if ((await step()) !== 4) break;
  }
  expect(labels[0]?.includes('1등 공개 취소'), `처음 ◀ = "${labels[0]}"`);
  expect(labels.some((l) => l.includes('2등 공개 취소')), `◀ 순서: ${labels.join(' → ')}`);
  // From 3등 (where opening the step left it) one ◀ takes back the reveal AND 빙고 종료.
  expect((await step()) === 3, `끝까지 ◀ 한 뒤 step ${await step()}`);
  const v = await views();
  expect(v[1] === '진행 중', `빙고 상태 ${v[1]} (step 3 = 빙고 진행 중)`);
  expect(!(await p.$('.podium')) && !(await p.$('.phero')), '발표 화면에 아직 순위가 떠 있어요');
});

await scenario('🔇 소리 꺼짐 ↔ 켜짐', async (expect) => {
  await m.click('.mute');
  await sleep(500);
  expect(/소리 꺼짐/.test(await m.$eval('.mute', (b) => b.textContent)), '꺼짐 표시가 안 돼요');
  await m.click('.mute');
  await sleep(500);
  expect(/소리 켜짐/.test(await m.$eval('.mute', (b) => b.textContent)), '켜짐 표시가 안 돼요');
});

await scenario('전체 순서에서 바로 이동 (앞으로·뒤로)', async (expect) => {
  await jump(6);
  expect((await step()) === 6, `step ${await step()}`);
  await jump(2);
  expect((await step()) === 2, `step ${await step()}`);
});

await reset();
dropBots();
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ scenarios: results.length, passed: results.length - failed.length, failed: failed.map((f) => f.name), pageErrors }, null, 1));
process.exit(failed.length || pageErrors.length ? 1 : 0);
