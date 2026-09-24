/**
 * Seed a LIVE-testable 빙고 game so you can rehearse the whole flow (play → 종료 →
 * 발표 → 위너 카드 스포트라이트) without needing a room full of people.
 *
 *   node scripts/demo-bingo.mjs [baseUrl]
 *   PASSCODE=<마스터암호> BOTS=8 node scripts/demo-bingo.mjs https://soonot-hanmadang.fly.dev
 *
 * It signs in as master, resets to a FRESH event, sets the 25 traits, joins BOTS
 * bot players, starts, and fills cells so several bots complete a real 빙고 line
 * (row 0). It then LEAVES THE GAME RUNNING and prints the URLs, so you can:
 *   - open /master and /p, join your own phone via the QR (late join is allowed),
 *   - fill your own card by naming the bots (numbers are printed),
 *   - then drive 게임 종료 → 순위 발표 → 카드 띄우기 yourself.
 *
 * ⚠ It RESETS the current event on that server. Use only for testing.
 */
import { io } from 'socket.io-client';

const base = process.argv[2] ?? 'http://localhost:3000';
const PASSCODE = process.env.PASSCODE ?? 'soonot';
const BOTS = Math.max(6, Number(process.env.BOTS ?? 8)); // ≥6 so a 빙고 line is possible
const CELLS = 25;

const res = await fetch(`${base}/master/auth`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ passcode: PASSCODE }),
});
if (!res.ok) throw new Error(`auth failed: ${res.status} — PASSCODE 확인 (env PASSCODE)`);
const cookie = res.headers.get('set-cookie').split(';')[0];

const m = io(`${base}/master`, { transports: ['websocket'], extraHeaders: { cookie } });
await new Promise((r) => m.on('connect', r));
const msend = (ev, p) => new Promise((r) => m.emit(ev, { ...p, gameId: 'bingo' }, r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (label, ack) => console.log(ack?.ok === false ? `✗ ${label}: ${ack.error?.code}` : `✓ ${label}`);

// Fresh event (reset any current one first — this is a test seeder).
await new Promise((r) => m.emit('event:reset', {}, r));
await wait(150);
log('event', await msend('event:create', { title: '온누리 Win2 순장 OT (테스트)' }));
log('setTraits(25)', await msend('master:setTraits', { texts: Array.from({ length: CELLS }, (_, i) => `특징 ${i + 1}번`) }));

const names = ['민지', '지은', '철수', '영희', '현우', '수빈', '지훈', '예린', '도윤', '하늘', '서준', '유나'];
const bots = [];
for (let i = 0; i < BOTS; i++) {
  const p = io(`${base}/b`, { transports: ['websocket'] });
  await new Promise((r) => p.on('connect', r));
  const ack = await new Promise((r) => p.emit('room:join', { nickname: names[i % names.length] }, r));
  bots.push({ sock: p, id: ack.playerId, number: null });
}
console.log(`✓ ${bots.length} bots joined`);

const dealt = Promise.all(bots.map((b) => new Promise((r) => b.sock.once('card:assigned', (d) => r(d)))));
log('start', await msend('master:start'));
const cards = await dealt;
cards.forEach((c, i) => (bots[i].number = c.number));

// Fill so several bots get a real 빙고: row 0 (cells 0..4) needs 5 distinct OTHER
// people. Top bots also fill cells 5..6 for a points spread on the podium.
for (let i = 0; i < bots.length; i++) {
  const me = bots[i];
  const others = bots.filter((_, k) => k !== i);
  const extra = i < Math.ceil(bots.length / 2) ? 2 : 0; // a spread: some 12점, some 10점
  for (let cell = 0; cell < 5 + extra; cell++) {
    const other = others[cell % others.length];
    await new Promise((r) => me.sock.emit('cell:fill', { cellIndex: cell, query: String(other.number) }, r));
  }
}
console.log('✓ bots filled — several completed 빙고 (row 0)');

console.log('\n게임이 RUNNING 상태로 준비됐어요. 열어서 테스트하세요:');
console.log(`  콘솔    ${base}/master   (passcode: ${PASSCODE}) → 게임 종료 → 순위 발표 → 📺 카드 띄우기`);
console.log(`  프로젝터 ${base}/p`);
console.log(`  내 카드  ${base}/         (QR 스캔으로 늦게 입장해 봇들 번호로 칸 채우기)`);
console.log('  봇 번호: ' + bots.map((b) => `${b.number}`).join(', '));
m.close();
// Keep the bot sockets OPEN so they stay 접속 중 on /p while you test. Close this
// window (Ctrl+C) when you're done — that drops the bots (their fills remain).
console.log('\n▶ 이 창을 열어두면 봇들이 접속 상태로 남아요. 테스트가 끝나면 Ctrl+C 로 종료하세요.');
setInterval(() => {}, 1 << 30);
