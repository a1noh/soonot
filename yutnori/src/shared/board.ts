import { HOME, WAITING } from './constants';

/**
 * The authentic 29-밭 윷판 as a graph (req §6). Positions are integer node ids so
 * `Mal.progress` stays a number:
 *
 *   0            대기 (off-board, uncatchable)
 *   1..19        outer ring (5 = 모, 10 = 뒷모, 15 = top-right corner)
 *   20           집 (home, uncatchable)
 *   21,22        모 → 방 diagonal arm      (A1, A2)
 *   23           방 (centre)
 *   24,25        방 → 참 exit arm          (E1, E2)
 *   26,27        뒷모 → 방 diagonal arm    (D1, D2)
 *   28,29        방 → 15 arm               (B1, B2)
 *
 * Shortcuts open only by landing EXACTLY on a branch 밭 (모/뒷모/방); there the
 * next move offers BOTH the diagonal and the straight path as candidates
 * (user choice). Sources: ko.wikipedia 윷놀이, grimpang.com/guide/yutnori.
 */
export const CENTER = 23;
const ON_BOARD = new Set([...range(1, 19), CENTER, 21, 22, 24, 25, 26, 27, 28, 29]);
export const ALL_NODES = [WAITING, ...ON_BOARD, HOME];

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

/** The single onward 밭 when a 말 is *flowing* along its current path. */
function defaultNext(node: number): number {
  switch (node) {
    case 21: return 22;
    case 22: return CENTER;
    // Flowing THROUGH 방 (not landing) continues the long way to the 15-side. The 참
    // home-exit (24) is reachable ONLY by LANDING on 방 — see firstOptions(CENTER).
    // So passing over 방 (e.g. 모+모) never earns the home shortcut.
    case CENTER: return 28;
    case 24: return 25;
    case 25: return HOME;
    case 26: return 27;
    case 27: return CENTER;
    case 28: return 29;
    case 29: return 15; // rejoin the outer ring
    default:
      if (node >= 1 && node <= 19) return node + 1; // 19 → 20 (집)
      return HOME;
  }
}

/** First-step options when a 말 *rests* on a 밭: branch 밭 offer two, others one. */
function firstOptions(node: number): number[] {
  if (node === WAITING) return [1];
  if (node === 5) return [6, 21]; // 모: 바깥길 or 지름길
  if (node === 10) return [11, 26]; // 뒷모: 바깥길 or 지름길
  if (node === CENTER) return [24, 28]; // 방: 참 출구 or 15쪽 계속
  return [defaultNext(node)];
}

/** Walk `steps` from `from`, taking `firstStep` as the opening move; overshoot → 집. */
function walk(from: number, firstStep: number, steps: number): number {
  let pos = firstStep;
  for (let i = 1; i < steps && pos !== HOME; i++) pos = defaultNext(pos);
  return pos;
}

/** Every reachable destination for a 말 at `from` moving `steps` (1, or 2 at a branch). */
export function destinations(from: number, steps: number): number[] {
  if (from === HOME || steps <= 0) return [];
  const outs = firstOptions(from).map((first) => walk(from, first, steps));
  return [...new Set(outs)];
}

/**
 * The 밭 one step BEFORE `to` along the route a 말 took from `from` moving `steps`
 * — used for the 미니게임 실패 penalty (the 말 steps back one 밭 instead of a full
 * revert). Returns `from` when the move was a single step (or the route can't be
 * reconstructed), so it never advances the 말.
 */
export function stepBefore(from: number, steps: number, to: number): number {
  if (steps <= 1) return from;
  for (const first of firstOptions(from)) {
    if (walk(from, first, steps) === to) return walk(from, first, steps - 1);
  }
  return from;
}

export function isWaiting(node: number): boolean {
  return node === WAITING;
}
export function isHome(node: number): boolean {
  return node === HOME;
}
/** On a real 밭, and therefore catchable (req §8.2) — 대기 and 집 are not. */
export function isOnBoard(node: number): boolean {
  return node !== WAITING && node !== HOME;
}

/**
 * How far along a 밭 is, for ranking (req §11): `0` at 대기, rising to the max at
 * 집, measured as `(대기의 남은 거리) − (이 밭의 남은 거리)`. Using min-steps-to-집
 * makes a 말 on the diagonal near 방 rank as far along as the equivalent outer 밭,
 * so shortcuts don't distort "who's ahead".
 */
const TO_HOME = computeToHome();
const MAX_TO_HOME = TO_HOME.get(WAITING) ?? 20;
export function advancementOf(node: number): number {
  return MAX_TO_HOME - (TO_HOME.get(node) ?? MAX_TO_HOME);
}

function computeToHome(): Map<number, number> {
  // BFS backwards over every edge (default + both branch options).
  const succ = (n: number): number[] =>
    n === WAITING ? [1] : n === HOME ? [] : [...new Set([defaultNext(n), ...firstOptions(n)])];
  const dist = new Map<number, number>([[HOME, 0]]);
  let frontier = [HOME];
  while (frontier.length) {
    const next: number[] = [];
    for (const node of ALL_NODES) {
      if (dist.has(node)) continue;
      const d = succ(node).filter((s) => dist.has(s)).map((s) => dist.get(s)! + 1);
      if (d.length) {
        dist.set(node, Math.min(...d));
        next.push(node);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return dist;
}

/** Human label for a 밭 (move picker + board). */
export function nodeLabel(node: number): string {
  if (node === WAITING) return '대기';
  if (node === HOME) return '집';
  if (node === 5) return '모';
  if (node === 10) return '뒷모';
  if (node === 15) return '모동';
  if (node === CENTER) return '방';
  if (node >= 21) return '지름길';
  return `${node}칸`;
}

/**
 * Unit-square coordinates [0,0]=top-left for any on-board 밭. Outer ring is the
 * square (참 at bottom-right, counter-clockwise); diagonal 밭 interpolate between
 * their corner and the centre. Pure geometry, shared with the client SVG.
 */
const GRID = 20; // outer stations
export function nodeXY(node: number): [number, number] {
  if (node >= 1 && node <= 19) return outerXY(node);
  if (node === HOME || node === WAITING) return outerXY(0); // 참 corner (trays sit off-board)
  const C: [number, number] = [0.5, 0.5];
  // arms: [cornerNode, [n1, n2]] interpolated corner→centre at 1/3, 2/3
  const arm = (corner: number, n1: number, n2: number): Record<number, [number, number]> => {
    const [cx, cy] = outerXY(corner);
    return {
      [n1]: [cx + (0.5 - cx) / 3, cy + (0.5 - cy) / 3],
      [n2]: [cx + ((0.5 - cx) * 2) / 3, cy + ((0.5 - cy) * 2) / 3],
    };
  };
  const coords: Record<number, [number, number]> = {
    [CENTER]: C,
    ...arm(5, 21, 22),
    ...arm(0, 25, 24), // exit arm sits on the 참(0)→centre diagonal (E2 near 참, E1 near centre)
    ...arm(10, 26, 27),
    ...arm(15, 29, 28), // 15→centre diagonal (B2 near 15, B1 near centre)
  };
  return coords[node] ?? C;
}

function outerXY(i: number): [number, number] {
  const side = Math.floor(i / 5);
  const t = (i % 5) / 5;
  switch (side) {
    case 0: return [1 - t, 1]; // bottom, right→left (0=참 bottom-right .. 4)
    case 1: return [0, 1 - t]; // left, bottom→top (5=모 .. 9)
    case 2: return [t, 0]; // top, left→right (10=뒷모 .. 14)
    default: return [1, t]; // right, top→bottom (15 .. 19)
  }
}

export { GRID };
