/**
 * Populates a 교회 사람 빙고 game against a running host so the card at `/`, the
 * console at `/master`, and the projector at `/p` have something on them.
 *
 *   node scripts/demo-bingo.mjs [baseUrl]
 *
 * Signs in as the master, creates an event, curates 81 traits, joins a handful
 * of bot players and starts — then fills a few cells. Open `/` in a tab to join
 * as a real player (a late join is allowed) and play along. Development aid only.
 */
import { io } from 'socket.io-client';

const base = process.argv[2] ?? 'http://localhost:3000';
const PASSCODE = process.env.PASSCODE ?? 'soonot';
const BOTS = Number(process.env.BOTS ?? 10);

const res = await fetch(`${base}/master/auth`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ passcode: PASSCODE }),
});
if (!res.ok) throw new Error(`auth failed: ${res.status}`);
const cookie = res.headers.get('set-cookie').split(';')[0];

const m = io(`${base}/master`, { transports: ['websocket'], extraHeaders: { cookie } });
await new Promise((r) => m.on('connect', r));
const msend = (ev, p) => new Promise((r) => m.emit(ev, { ...p, gameId: 'bingo' }, r));
const log = (label, ack) => console.log(ack?.ok === false ? `✗ ${label}: ${ack.error?.code}` : `✓ ${label}`);

log('event', await msend('event:create', { title: '2026 가을 교회 한마당' }));
const traits = Array.from({ length: 81 }, (_, i) => `특징 ${i + 1}번`);
log('setTraits', await msend('master:setTraits', { texts: traits }));

// A handful of bot players so the room is lively and the game can start.
const bots = [];
const names = ['민수', '지은', '철수', '영희', '현우', '수빈', '민수', '지훈', '예린', '도윤'];
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

// Each bot fills a couple of cells by naming other bots — enough to make the
// dashboard and roster interesting.
for (let i = 0; i < bots.length; i++) {
  const me = bots[i];
  for (let k = 0; k < 3; k++) {
    const other = bots[(i + k + 1) % bots.length];
    if (other.number === me.number) continue;
    await new Promise((r) => me.sock.emit('cell:fill', { cellIndex: k, query: String(other.number) }, r));
  }
}
console.log('✓ bots filled some cells');

console.log('\n게임이 진행 중입니다. 열어보세요:');
console.log(`  카드    ${base}/            (휴대폰으로 입장해 함께 플레이)`);
console.log(`  콘솔    ${base}/master      (passcode: ${PASSCODE})`);
console.log(`  프로젝터 ${base}/p`);
m.close();
bots.forEach((b) => b.sock.close());
process.exit(0);
