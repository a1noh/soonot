/**
 * Download the 진행 순서 background music into master/media/bgm/ (git-ignored;
 * on Fly, run it on the machine or upload the files from the console).
 *
 *   node scripts/fetch-music.mjs
 *
 * All tracks: Kevin MacLeod (incompetech.com), Creative Commons BY 4.0 — free to
 * play at the event; the credit is in SOUND-CREDITS.md and on the closing slide.
 * Songs the 대본 names that are commercial recordings (태양 「눈, 코, 입」,
 * Whitney Houston 「I Will Always Love You」, 찬양 clips) are NOT here: the MC plays
 * those by hand, and their steps stop the background music.
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const TRACKS = [
  { file: 'local-forecast-elevator.mp3', title: 'Local Forecast - Elevator', use: '빙고 QR 안내 (식사 중, 잔잔하게)' },
  { file: 'heroic-age.mp3', title: 'Heroic Age', use: 'MC 등장 영상이 끝난 뒤 (웅장하게)' },
  { file: 'volatile-reaction.mp3', title: 'Volatile Reaction', use: '빙고 종료 카운트다운 (긴장감)' },
  { file: 'carefree.mp3', title: 'Carefree', use: '빙고 1등 공개 (밝게)' },
  { file: 'five-armies.mp3', title: 'Five Armies', use: '어벤추수 땡스게임 메인 보드 (웅장하게)' },
  { file: 'monkeys-spinning-monkeys.mp3', title: 'Monkeys Spinning Monkeys', use: '1라운드 · 코끼리코 도는 동안 (빙글빙글)' },
  { file: 'clash-defiant.mp3', title: 'Clash Defiant', use: '최종 집계 · 타이브레이커 (추격)' },
  { file: 'life-of-riley.mp3', title: 'Life of Riley', use: '최종 시상 (축하)' },
  { file: 'inspired.mp3', title: 'Inspired', use: '감사합니다 (마무리)' },
];

const OUT = 'master/media/bgm/';
mkdirSync(OUT, { recursive: true });
for (const t of TRACKS) {
  const out = OUT + t.file;
  if (existsSync(out) && statSync(out).size > 100_000) {
    console.log(`✓ ${t.file} (already here)`);
    continue;
  }
  const url = `https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(t.title)}.mp3`;
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    console.log(`✗ ${t.title}: HTTP ${res.status}`);
    continue;
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(out));
  console.log(`↓ ${t.file} ${(statSync(out).size / 1048576).toFixed(1)} MB`);
}
