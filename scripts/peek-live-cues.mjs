/**
 * Read-only: sign in to a deployed soonot as master and print the show's step list (title · layout).
 *   node scripts/peek-live-cues.mjs [https://soonot-hanmadang.fly.dev]
 */
import { io } from 'socket.io-client';

const BASE = (process.argv[2] ?? 'https://soonot-hanmadang.fly.dev').replace(/\/$/, '');
const auth = await fetch(`${BASE}/master/auth`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ passcode: process.env.PASSCODE ?? 'soonot' }),
});
if (!auth.ok) throw new Error(`sign-in failed ${auth.status}`);
const cookie = (auth.headers.get('set-cookie') ?? '').split(';')[0];
const sock = io(`${BASE}/master`, { transports: ['websocket'], extraHeaders: { cookie } });
const done = setTimeout(() => { console.log('no summary in 10 s'); process.exit(1); }, 10000);
sock.on('connect_error', (e) => { console.log('connect error', e.message); process.exit(1); });
sock.on('event:summary', (s) => {
  if (!s) { console.log('no event'); process.exit(0); }
  clearTimeout(done);
  for (const [i, c] of (s.cues ?? []).entries()) console.log(i + 1, c.kind, c.title, c.layout ? `[${c.layout}]` : '');
  process.exit(0);
});
