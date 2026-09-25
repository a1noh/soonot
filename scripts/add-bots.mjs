/**
 * Add PLAYING bots to a 빙고 game without you touching the console for them.
 *   node scripts/add-bots.mjs [baseUrl] [count]
 *   node scripts/add-bots.mjs https://soonot-hanmadang.fly.dev 50
 *
 * It first WAITS until the game is a fresh LOBBY with traits set and 0 players
 * (i.e. right after you do 다시 하기 → 기본 25개 불러오기 → 준비 완료), then joins
 * `count` bots and — the moment you press 게임 시작 — has each bot fill a handful of
 * cells (naming other bots) so the /p leaderboard and several 빙고 light up at
 * scale. Stays connected; Ctrl+C to drop them.
 */
import { io } from 'socket.io-client';

const base = process.argv[2] ?? 'https://soonot-hanmadang.fly.dev';
const N = Number(process.argv[3] ?? process.env.BOTS ?? 50);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const flush = (s) => new Promise((r) => process.stdout.write(s + '\n', r));

const POOL = ['민지','지은','철수','영희','현우','수빈','지훈','예린','도윤','하늘','서준','유나',
  '준호','다은','성민','채원','태윤','소율','건우','지아','민재','서연','현서','예준','시우',
  '하준','지호','수아','은우','지우','도현','서윤','주원','유진','재원','다인','시윤','하은'];
const nameOf = (i) => POOL[i % POOL.length] + (i >= POOL.length ? String(Math.floor(i / POOL.length) + 1) : '');

// 1) Wait for a fresh, trait-ready LOBBY with no players (your 다시 하기 + 준비 완료).
await flush(`▶ 콘솔에서 "다시 하기 → 기본 25개 불러오기 → 준비 완료"를 기다리는 중…`);
await new Promise((resolve) => {
  const obs = io(`${base}/p`, { transports: ['websocket', 'polling'] });
  let last = '';
  obs.on('room:state', (m) => {
    if (m.gameId !== 'bingo') return;
    const v = m.view;
    const tag = `${v.state} players=${v.playerCount} traits=${v.traitCount}`;
    if (tag !== last) { last = tag; void flush(`   상태: ${tag}`); }
    if (v.state === 'LOBBY' && v.playerCount === 0 && v.traitCount >= 20) {
      obs.close();
      resolve();
    }
  });
});
await flush(`✓ 준비된 LOBBY 감지 — 봇 ${N}명 투입`);

// 2) Join the bots.
const bots = [];
for (let i = 0; i < N; i++) {
  const sock = io(`${base}/b`, { transports: ['websocket'], reconnection: true });
  await new Promise((r) => sock.on('connect', r));
  const b = { sock, id: null, number: null, filled: false };
  sock.on('card:assigned', (d) => { b.number = d.number; }); // fires when you press 게임 시작
  const ack = await new Promise((r) => sock.emit('room:join', { nickname: nameOf(i) }, r));
  if (ack?.ok === false) { await flush(`  ✗ bot ${i}: ${ack.error?.code}`); sock.close(); continue; }
  b.id = ack.playerId;
  bots.push(b);
  await wait(25);
}
await flush(`✓ ${bots.length}명 접속. 이제 콘솔에서 "게임 시작"을 누르세요.`);

// 3) Fill each bot ONCE, the moment it has a card (i.e. after 게임 시작).
async function fillOne(me) {
  me.filled = true;
  const others = bots.filter((x) => x !== me && x.number !== null);
  if (others.length < 5) { me.filled = false; return; }
  const count = 5 + Math.floor(Math.random() * 10); // 5..14 cells → 1–2 줄
  for (let cell = 0; cell < count; cell++) {
    me.sock.emit('cell:fill', { cellIndex: cell, query: String(others[cell % others.length].number) });
    await wait(6);
  }
}
let announced = false;
setInterval(() => {
  const ready = bots.filter((b) => b.number !== null);
  if (ready.length >= 6 && !announced) { announced = true; void flush(`✓ 게임 시작 감지 — 봇들이 칸을 채웁니다 (여러 빙고).`); }
  for (const b of ready) if (!b.filled) void fillOne(b);
}, 1500);

await flush(`\n▶ 봇들이 접속 상태로 남아 있어요. 끝나면 Ctrl+C. (콘솔 "다시 하기"로 전체 정리)`);
