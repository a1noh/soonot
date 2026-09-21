/**
 * Drives a real 윷놀이 game against a running host, so the board at /y has
 * something on it. Development aid only.
 *
 *   node scripts/demo-yutnori.mjs [baseUrl]
 */
import { io } from 'socket.io-client';

const base = process.argv[2] ?? 'http://localhost:3000';
const PASSCODE = process.env.PASSCODE ?? 'soonot';

const res = await fetch(`${base}/master/auth`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ passcode: PASSCODE }),
});
if (!res.ok) throw new Error(`auth failed: ${res.status}`);
const cookie = res.headers.get('set-cookie').split(';')[0];

const s = io(`${base}/master`, { transports: ['websocket'], extraHeaders: { cookie } });
await new Promise((r) => s.on('connect', r));
const send = (ev, p) => new Promise((r) => s.emit(ev, p, r));
const log = (m, a) => console.log(a?.ok === false ? `✗ ${m}: ${a.error?.code}` : `✓ ${m}`);

log('event', await send('event:create', { title: '2026 가을 교회 한마당' }));
log('setup', await send('master:setup', {
  gameId: 'yutnori',
  teams: [{ name: '청년 1조' }, { name: '청년 2조' }, { name: '장년부' }],
  malPerTeam: 2,
  timeLimitMin: 20,
  miniGames: false, // scripted throws; play from /master to see mini-games
}));
log('start', await send('master:start', { gameId: 'yutnori' }));

// Throw a scripted sequence so the board shows a game in progress.
const script = ['걸', '개', '윷', '도', '모', '개', '걸', '도', '윷', '개', '걸', '모'];
let pending = null;
s.on('throw:recorded', (d) => { pending = d; });

for (const roll of script) {
  pending = null;
  const ack = await send('master:throw', { gameId: 'yutnori', roll });
  if (!ack.ok) { console.log(`✗ throw ${roll}: ${ack.error?.code}`); continue; }
  await new Promise((r) => setTimeout(r, 60));
  if (pending?.candidates?.length) {
    // prefer a capture, then a finish, else the furthest along
    const c = [...pending.candidates].sort(
      (a, b) => b.captures.length - a.captures.length || b.to - a.to,
    )[0];
    const mv = await send('master:move', { gameId: 'yutnori', malId: c.malId });
    console.log(`  ${roll} → ${c.from}→${c.to}${c.captures.length ? ' 잡기!' : ''}${mv.ok ? '' : ' ✗'}`);
  } else {
    console.log(`  ${roll} (auto)`);
  }
  await new Promise((r) => setTimeout(r, 120));
}

console.log('\n게임이 진행 중입니다. 판을 열어보세요:');
console.log(`  board   ${base}/y`);
console.log(`  console ${base}/master   (passcode: ${PASSCODE})`);
s.close();
