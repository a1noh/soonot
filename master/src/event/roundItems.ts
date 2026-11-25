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
