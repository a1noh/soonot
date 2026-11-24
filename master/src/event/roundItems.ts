/**
 * The files the team uploads for a round, as the MC's list: 찬양 clips (media/songs/)
 * and 눈코입 photos (media/faces/). Pure (no fs), so the host and the console agree.
 *
 * Naming: the order is the file name's leading number, the answer is the rest.
 *   songs/01 제이어스 - 내 모습 이대로.mp3       → 1. "제이어스 - 내 모습 이대로"
 *   faces/03 유재석.jpg (+ optional 03 유재석-zoom.jpg, the cropped 눈·코·입)
 * Without a -zoom file the projector zooms into the middle of the photo.
 */
export const ROUND_DIRS = ['songs', 'faces'] as const;
export type RoundDir = (typeof ROUND_DIRS)[number];

const AUDIO = /\.(mp3|m4a|wav|ogg|aac)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
const ZOOM = /-zoom$/i;

export interface RoundItem {
  /** What the MC reads and the answer screen shows. */
  name: string;
  url: string;
  /** faces only: the cropped 눈·코·입 picture, when the team made one. */
  zoomUrl: string | null;
}

const base = (f: string) => f.replace(/\.[^.]+$/, '');
const media = (dir: RoundDir, f: string) => `/media/${dir}/${encodeURIComponent(f)}`;

export function roundItems(dir: RoundDir, files: readonly string[]): RoundItem[] {
  const ok = dir === 'songs' ? AUDIO : IMAGE;
  const usable = files.filter((f) => ok.test(f) && !f.startsWith('.'));
  const zooms = new Map(usable.filter((f) => ZOOM.test(base(f))).map((f) => [base(f).replace(ZOOM, '').trim().toLowerCase(), f]));
  return usable
    .filter((f) => dir === 'songs' || !ZOOM.test(base(f)))
    .sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }))
    .map((f) => {
      const zoom = dir === 'faces' ? zooms.get(base(f).trim().toLowerCase()) : undefined;
      return {
        name: base(f).replace(/^\d+\s*[._)\-]?\s*/, '').trim() || base(f),
        url: media(dir, f),
        zoomUrl: zoom ? media(dir, zoom) : null,
      };
    });
}
