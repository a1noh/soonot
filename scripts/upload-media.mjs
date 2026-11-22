/**
 * Upload the show's media (intro video + BGM) to a deployed soonot, e.g. the Fly site.
 * They are not in git (master/media is ignored); the server keeps them on its volume (/data/media).
 *
 *   PASSCODE=<master passcode> node scripts/upload-media.mjs https://soonot-hanmadang.fly.dev
 *
 * Safe to run twice (same names overwrite). Uploads only what the 대본 uses.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';

const BASE = (process.argv[2] ?? 'https://soonot-hanmadang.fly.dev').replace(/\/$/, '');
const PASSCODE = process.env.PASSCODE ?? 'soonot';

const files = [
  { path: 'master/media/어벤추수-mc-intro-sfx.mp4', dir: '' },
  ...readdirSync('master/media/bgm').filter((f) => f.endsWith('.mp3')).map((f) => ({ path: `master/media/bgm/${f}`, dir: 'bgm' })),
];

const auth = await fetch(`${BASE}/master/auth`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ passcode: PASSCODE }),
});
if (!auth.ok) throw new Error(`sign-in failed (${auth.status}) — set PASSCODE`);
const cookie = (auth.headers.get('set-cookie') ?? '').split(';')[0];

for (const f of files) {
  const name = f.path.split('/').pop();
  const q = new URLSearchParams({ name, ...(f.dir ? { dir: f.dir } : {}) });
  const res = await fetch(`${BASE}/master/media?${q}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/octet-stream' },
    body: readFileSync(f.path),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`${res.ok ? '✓' : '✗'} ${body.url ?? name} (${(statSync(f.path).size / 1048576).toFixed(1)} MB)${res.ok ? '' : ` — ${body.message ?? res.status}`}`);
}
