import { HOME, STATION_COUNT, WAITING } from './constants';

/**
 * spec §7.1 — station coordinates on a unit square, [0,0] top-left.
 * Corners at 0, 5, 10, 15. Movement is counter-clockwise from 참 at the bottom right.
 * Pure geometry, shared with the client's SVG so nothing is hand-placed.
 */
export function stationXY(i: number): [number, number] {
  if (!Number.isInteger(i) || i < 0 || i >= STATION_COUNT) {
    throw new RangeError(`station index out of range: ${i}`);
  }
  const side = Math.floor(i / 5);
  const t = (i % 5) / 5;
  switch (side) {
    case 0:  return [1 - t, 1];   // bottom edge, right → left   (0..4, 참 at i=0)
    case 1:  return [0, 1 - t];   // left edge,   bottom → top   (5..9)
    case 2:  return [t, 0];       // top edge,    left → right   (10..14)
    default: return [1, t];       // right edge,  top → bottom   (15..19)
  }
}

/** 대기 — off the board. Cannot be caught (req §8.2). */
export function isWaiting(progress: number): boolean {
  return progress === WAITING;
}

/** On a real station, and therefore catchable (req §8.2). */
export function isOnBoard(progress: number): boolean {
  return progress > WAITING && progress < HOME;
}

/** 집 — finished. Cannot be caught (req §8.2). */
export function isHome(progress: number): boolean {
  return progress >= HOME;
}

/**
 * req §6 — overshoot goes home. No exact count required, which is what guarantees
 * that a legal move always exists and removes the pass state entirely (req §9).
 */
export function advance(from: number, steps: number): number {
  return Math.min(from + steps, HOME);
}
