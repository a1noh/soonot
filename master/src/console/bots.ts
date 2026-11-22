/**
 * 🤖 테스트 봇 — rehearse bingo without a room full of phones. Bots are phones
 * run inside this console tab: they join /b with a name, and once bingo starts
 * each fills 5–17 cells naming other bots, a few seconds apart, so the ladder
 * and the 빙고 moments play out like the real thing. They live as long as this
 * tab (or until 봇 내보내기); a rehearsal tool, never needed on the night.
 */
import { io, type Socket } from 'socket.io-client';

const POOL = ['민지', '지은', '철수', '영희', '현우', '수빈', '지훈', '예린', '도윤', '하늘', '서준', '유나',
  '준호', '다은', '성민', '채원', '태윤', '소율', '건우', '지아'];

interface Bot {
  sock: Socket;
  number: number | null;
  filled: boolean;
}

let bots: Bot[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

export function botCount(): number {
  return bots.length;
}
export function onBotsChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Fill every bot that has a card and has not filled yet — once ≥6 have cards. */
function fillReady(): void {
  const ready = bots.filter((b) => b.number !== null);
  if (ready.length < 6) return;
  ready.forEach((b, i) => {
    if (b.filled) return;
    b.filled = true;
    const others = ready.filter((x) => x !== b);
    const count = 5 + Math.floor(Math.random() * 13); // 5–17 cells → 1–3줄
    window.setTimeout(() => {
      for (let c = 0; c < count; c++) {
        b.sock.emit('cell:fill', { cellIndex: c, query: String(others[(c + i) % others.length]!.number) });
      }
    }, 800 + Math.random() * 6000);
  });
}

export async function addBots(n = 12): Promise<void> {
  for (let i = 0; i < n; i++) {
    const k = bots.length;
    const name = POOL[k % POOL.length]! + (k >= POOL.length ? String(Math.floor(k / POOL.length) + 1) : '');
    const sock = io('/b', { transports: ['websocket'] });
    await new Promise<void>((resolve) => sock.once('connect', () => resolve()));
    const bot: Bot = { sock, number: null, filled: false };
    sock.on('card:assigned', (d: { number?: number }) => {
      if (typeof d?.number === 'number') bot.number = d.number;
      fillReady();
    });
    sock.on('room:reset', () => {
      bot.number = null;
      bot.filled = false;
    });
    await new Promise((resolve) => sock.emit('room:join', { nickname: name }, resolve));
    bots.push(bot);
    notify();
  }
}

export function clearBots(): void {
  for (const b of bots) b.sock.close();
  bots = [];
  notify();
}
