/**
 * The podium contract (spec §3.4).
 *
 * Both games sort their own way — bingo on `firstBingoAt` then `firstBingoSeq`
 * (bingo §9), yutnori on finisher tier then progress (yutnori §11) — and both
 * hand back this shape. One reveal component, one `reveal:step` broadcast, one
 * set of animations, one 나의 순위 band.
 */
export interface RankEntry {
  id: string;
  /** '민수 #042' | '청년부 1조' */
  label: string;
  /** '4:12 · 2줄' | '말 2개 집 · 12:03' */
  detail: string;
  medal?: 1 | 2 | 3;
  /** Renders the "나의 순위" band (bingo §9). Set per viewer by `project`. */
  self?: boolean;
}

/**
 * The entries the shared podium shows at a given reveal step (req §4.2).
 *
 * Steps 1–3 count up: 3rd, then 2nd, then 1st. The final step shows the **top 3
 * only** (🥇🥈🥉) — never the whole field: the projector is view-only and must fit
 * on screen, and at 50–60 players dumping everyone made the podium scroll off the
 * top and bottom. The full ranking lives on the number-only live board and the
 * console. With fewer than three ranked entries the missing steps yield nothing
 * rather than erroring — bingo §9 and yutnori §11 both run the reveal anyway.
 */
export function podiumAt(ranked: readonly RankEntry[], step: number): RankEntry[] {
  if (step <= 0) return [];
  if (step >= 4) return ranked.slice(0, 3).map((e, i) => ({ ...e, medal: (i + 1) as 1 | 2 | 3 }));
  const index = 3 - step; // step 1 → index 2 (3rd), step 2 → 1 (2nd), step 3 → 0 (1st)
  const entry = ranked[index];
  return entry ? [{ ...entry, medal: (index + 1) as 1 | 2 | 3 }] : [];
}
