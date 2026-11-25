/**
 * The files the team uploads for a round, as the MC's list: 찬양 clips (media/songs/)
 * and 눈코입 photos (media/faces/). Pure (no fs), so the host and the console agree.
 *
 * Naming: the order is the file name's leading number (if any), the answer is the rest.
 *   songs/01 내 모습 이대로 (제이어스).mp3        → 1. "내 모습 이대로 (제이어스)"
 *   faces: a question picture and an answer picture per person, either way:
 *     01 유재석-zoom.png + 01 유재석.png         (question = -zoom)
 *     유재석.PNG + 유재석 정답.PNG / 유재석_정답.png (the team's own: answer = 정답)
 *   A face with only one picture zooms into its middle for the question.
 */
import { FACES, SONGS } from './roundOrder.js';

export const ROUND_DIRS = ['songs', 'faces'] as const;
export type RoundDir = (typeof ROUND_DIRS)[number];

const AUDIO = /\.(mp3|m4a|wav|ogg|aac)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
const ZOOM = /\s*-zoom$/i;
const ANSWER = /[\s_]*정답$/;

export interface RoundItem {
  /** What the MC reads and the answer screen shows. */
  name: string;
  /** The answer picture (faces) or the clip (songs). */
  url: string;
  /** faces only: the question picture (the cropped 눈·코·입), when there is one. */
  zoomUrl: string | null;
}

/** "청목 정답.PNG.jpg" → "청목 정답": every trailing media extension goes. */
const base = (f: string) => f.replace(/(\.(png|jpe?g|gif|webp|mp3|m4a|wav|ogg|aac))+$/i, '');
const media = (dir: RoundDir, f: string) => `/media/${dir}/${encodeURIComponent(f)}`;
const nameOf = (b: string) => b.replace(/^\d+\s*[._)\-]?\s*/, '').trim() || b;
const byName = (a: string, b: string) => a.localeCompare(b, 'ko', { numeric: true });

export function roundItems(dir: RoundDir, files: readonly string[]): RoundItem[] {
  const ok = dir === 'songs' ? AUDIO : IMAGE;
  const usable = files.filter((f) => ok.test(f) && !f.startsWith('.')).sort(byName);
  if (dir === 'songs') return usable.map((f) => ({ name: nameOf(base(f)), url: media(dir, f), zoomUrl: null }));

  // faces: group a person's pictures by their name without the -zoom / 정답 mark.
  const groups = new Map<string, { plain?: string; zoom?: string; answer?: string }>();
  for (const f of usable) {
    const b = base(f).trim();
    const kind = ZOOM.test(b) ? 'zoom' : ANSWER.test(b) ? 'answer' : 'plain';
    const key = b.replace(ZOOM, '').replace(ANSWER, '').trim();
    const g = groups.get(key) ?? {};
    if (!g[kind]) g[kind] = f;
    groups.set(key, g);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => byName(a, b))
    .map(([key, g]) => {
      // The team's naming: plain = question, 정답 = answer. Ours: -zoom = question, plain = answer.
      const answer = g.answer ?? g.plain ?? g.zoom!;
      const question = g.answer ? (g.plain ?? g.zoom ?? null) : (g.zoom ?? null);
      return { name: nameOf(key), url: media(dir, answer), zoomUrl: question && question !== answer ? media(dir, question) : null };
    });
}

/** What the MC's remote lists: the team's order (event/roundOrder.ts) applied to the files there. */
export interface ShowItem extends RoundItem {
  /** songs: the 10 s 후렴 clip the 정답 plays (else the intro plays on). */
  chorusUrl: string | null;
  /** faces: the 연습 (practice) photo. */
  example: boolean;
  /** No file for this one yet: the remote shows it greyed out, the projector never gets it. */
  missing: boolean;
}

const key = (s: string) => s.normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '');

export function showItems(dir: RoundDir, files: readonly string[]): ShowItem[] {
  if (dir === 'songs') {
    const byBase = new Map(files.filter((f) => AUDIO.test(f)).map((f) => [key(base(f)), f]));
    return SONGS.map((s, i) => {
      const nn = String(i + 1).padStart(2, '0');
      const intro = byBase.get(key(`찬양 ${nn} ${s.title}`));
      const chorus = byBase.get(key(`찬양 ${nn} ${s.title} 후렴`));
      return {
        name: `${s.title} · ${s.artist}`,
        url: intro ? media(dir, intro) : '',
        zoomUrl: null,
        chorusUrl: chorus ? media(dir, chorus) : null,
        example: false,
        missing: !intro,
      };
    });
  }
  const found = new Map(roundItems('faces', files).map((it) => [key(it.name), it]));
  return FACES.map((f) => {
    const it = found.get(key(f.name));
    return { name: f.name, url: it?.url ?? '', zoomUrl: it?.zoomUrl ?? null, chorusUrl: null, example: !!f.example, missing: !it };
  });
}
