/**
 * Star sparks for the 스톤 win moment, drawn by canvas-confetti
 * (github.com/catdad/canvas-confetti) on a canvas behind the result label. With
 * `useWorker` the particles are simulated and drawn off the main thread, so a
 * burst never stalls the stone flying into its row.
 */
import confetti from 'canvas-confetti';

let bound: { canvas: HTMLCanvasElement; fire: confetti.CreateTypes } | null = null;

/** One launcher per canvas — a canvas can hand its drawing to a worker only once
 *  (StrictMode runs effects twice). Null where there is no canvas (tests). */
function launcher(canvas: HTMLCanvasElement | null): confetti.CreateTypes | null {
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  if (bound?.canvas === canvas) return bound.fire;
  try {
    bound = { canvas, fire: confetti.create(canvas, { resize: true, useWorker: true, disableForReducedMotion: true }) };
    return bound.fire;
  } catch {
    return null;
  }
}

/** canvas-confetti takes its origin as fractions of the canvas it draws on. */
function originOf(canvas: HTMLCanvasElement, rect: DOMRect | undefined) {
  const c = canvas.getBoundingClientRect();
  if (!rect || !c.width || !c.height) return { x: 0.5, y: 0.45 };
  return { x: (rect.left + rect.width / 2 - c.left) / c.width, y: (rect.top + rect.height / 2 - c.top) / c.height };
}

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/** The stone splits: a ring of stars in its colour from where it hangs. */
export function burstAt(canvas: HTMLCanvasElement | null, from: DOMRect | undefined, color: string) {
  const fire = launcher(canvas);
  if (!fire || !canvas) return;
  const colors = [color, lighten(color, 0.45), '#ffffff', '#ffd76a'];
  const origin = originOf(canvas, from);
  void fire({ particleCount: 90, spread: 360, startVelocity: 30, gravity: 0.35, decay: 0.92, ticks: 170, scalar: 1.25, shapes: ['star'], colors, origin });
  void fire({ particleCount: 40, spread: 360, startVelocity: 14, gravity: 0.2, decay: 0.9, ticks: 130, scalar: 0.7, shapes: ['circle'], colors, origin });
}
