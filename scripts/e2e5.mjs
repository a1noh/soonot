/**
 * Full 5-user bingo game, end to end, against a running host.
 *   node e2e5.mjs [baseUrl] [numPlayers]
 * Drives: event → 25 traits → N players join → start → fill every possible cell
 * → end → reveal 0..4 → spotlight each winner. Prints everything + any errors.
 */
import { io } from 'socket.io-client';

const base = process.argv[2] ?? 'http://localhost:3000';
const N = Number(process.argv[3] ?? 5);
const PASSCODE = process.env.PASSCODE ?? 'soonot';
const CELLS = 25;

const errors = [];
const note = (t) => console.log(t);
const fail = (t) => { errors.push(t); console.log('  ✗ ' + t); };

const res = await fetch(`${base}/master/auth`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ passcode: PASSCODE }),
});
if (!res.ok) throw new Error(`auth failed: ${res.status}`);
const cookie = res.headers.get('set-cookie').split(';')[0];

const m = io(`${base}/master`, { transports: ['websocket'], extraHeaders: { cookie } });
await new Promise((r) => m.on('connect', r));
m.on('error', (e) => fail('master socket error: ' + JSON.stringify(e)));
const msend = (ev, p) => new Promise((r) => m.emit(ev, { ...p, gameId: 'bingo' }, r));

// Track the master's bingo view + event summary as the game runs.
let bingoView = null, summary = null;
m.on('room:state', (msg) => { if (msg.gameId === 'bingo') bingoView = msg.view; });
m.on('event:summary', (s) => { summary = s; });

const ck = (label, ack) => { if (ack?.ok === false) fail(`${label}: ${ack.error?.code} ${ack.error?.message ?? ''}`); else note('  ✓ ' + label); return ack; };

note('# 0. reset any prior event');
await new Promise((r) => m.emit('event:reset', {}, r));
await new Promise((r) => setTimeout(r, 150));

note('# 1. event + traits');
ck('event:create', await msend('event:create', { title: 'E2E 5인 테스트' }));
ck('setTraits(25)', await msend('master:setTraits', { texts: Array.from({ length: CELLS }, (_, i) => `특징 ${i + 1}`) }));

note(`# 2. ${N} players join`);
const names = ['민수', '지은', '철수', '영희', '현우', '수빈', '지훈', '예린'];
const bots = [];
for (let i = 0; i < N; i++) {
  const p = io(`${base}/b`, { transports: ['websocket'] });
  await new Promise((r) => p.on('connect', r));
  p.on('error', (e) => fail(`bot${i} socket error: ${JSON.stringify(e)}`));
  const ack = await new Promise((r) => p.emit('room:join', { nickname: names[i] }, r));
  if (ack?.ok === false) fail(`bot${i} join: ${ack.error?.code}`);
  bots.push({ sock: p, id: ack.playerId, number: null, perm: null, results: [] });
  bots[i].sock.on('cell:result', (d) => bots[i].results.push(d));
}
note(`  ✓ ${bots.length} joined`);

note('# 3. start (deal cards)');
const dealt = Promise.all(bots.map((b) => new Promise((r) => b.sock.once('card:assigned', r))));
ck('master:start', await msend('master:start'));
const cards = await dealt;
cards.forEach((c, i) => { bots[i].number = c.number; bots[i].perm = c.permutation; });
note('  numbers: ' + bots.map((b) => b.number).join(', '));

note('# 4. everyone fills every cell they can (naming all other players)');
for (let i = 0; i < bots.length; i++) {
  const me = bots[i];
  const others = bots.filter((_, k) => k !== i);
  // Try to fill cells 0..24 each with a distinct other person (will run out at N-1).
  for (let cell = 0; cell < CELLS; cell++) {
    const other = others[cell % others.length];
    await new Promise((r) => me.sock.emit('cell:fill', { cellIndex: cell, query: String(other.number) }, r));
  }
}
await new Promise((r) => setTimeout(r, 300));
for (const b of bots) {
  const ok = b.results.filter((r) => r.ok).length;
  const self = b.results.filter((r) => r.reason === 'SELF').length;
  const reused = b.results.filter((r) => r.reason === 'REUSED').length;
  note(`  #${b.number}: filled ${ok}, SELF ${self}, REUSED ${reused}`);
}
note(`  master view: playerCount=${bingoView?.playerCount} bingoCount=${bingoView?.bingoCount}`);

note('# 5. end');
ck('master:end', await msend('master:end'));
await new Promise((r) => setTimeout(r, 200));
note(`  state=${bingoView?.state} standings=${bingoView?.standings?.length} winners=${bingoView?.winners?.length}`);
if (bingoView?.winners) {
  for (const w of bingoView.winners) {
    note(`   ${w.rank}등 #${w.n} ${w.name} — ${w.lines}줄 ${w.points}점, matched=${w.matched.length}, grid=${w.grid?.length}`);
    if (!Array.isArray(w.grid) || w.grid.length !== CELLS) fail(`winner #${w.n} grid length ${w.grid?.length} != ${CELLS}`);
  }
}

note('# 6. reveal 0..4');
for (let step = 0; step <= 4; step++) {
  const ack = await msend('master:reveal', { step });
  ck(`reveal ${step}`, ack);
  await new Promise((r) => setTimeout(r, 80));
}
note(`  state=${bingoView?.state} revealStep=${bingoView?.revealStep}`);

note('# 7. spotlight each winner then clear');
for (const w of (bingoView?.winners ?? [])) {
  ck(`spotlight #${w.n}`, await msend('projector:spotlight', { n: w.n }));
  await new Promise((r) => setTimeout(r, 60));
  if (summary?.bingoSpotlight !== w.n) fail(`summary.bingoSpotlight=${summary?.bingoSpotlight} != ${w.n}`);
}
ck('spotlight clear', await msend('projector:spotlight', { n: null }));
if (summary?.bingoSpotlight !== null) fail(`clear failed: bingoSpotlight=${summary?.bingoSpotlight}`);

note('\n=== RESULT ===');
if (errors.length === 0) note('ALL GOOD ✅');
else { note(`${errors.length} problem(s):`); errors.forEach((e) => note(' - ' + e)); }

m.close();
bots.forEach((b) => b.sock.close());
process.exit(errors.length === 0 ? 0 : 1);
