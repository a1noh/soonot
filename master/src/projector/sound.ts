/**
 * The projector's sound effects (made by scripts/make-sfx.mjs, bundled here),
 * and the one switch that silences everything: 🔇 소리 끄기 on the console.
 *
 * Effects never queue up: a burst of the same effect within 150 ms plays once.
 */
import reveal from './sfx/reveal.mp3';
import win from './sfx/win.mp3';
import ding from './sfx/ding.mp3';
import tick from './sfx/tick.mp3';
import buzzer from './sfx/buzzer.mp3';
import boom from './sfx/boom.mp3';
import drumroll from './sfx/drumroll.mp3';
import fanfare from './sfx/fanfare.mp3';

export const SFX = { reveal, win, ding, tick, buzzer, boom, drumroll, fanfare } as const;
export type SfxName = keyof typeof SFX;

/** Relative loudness, so a tick never drowns the fanfare. */
const LEVEL: Record<SfxName, number> = {
  reveal: 0.8,
  win: 0.85,
  ding: 0.7,
  tick: 0.55,
  buzzer: 0.8,
  boom: 0.9,
  drumroll: 0.85,
  fanfare: 0.9,
};

let muted = false;
const listeners = new Set<(m: boolean) => void>();

export function setMuted(m: boolean): void {
  if (m === muted) return;
  muted = m;
  for (const f of listeners) f(m);
}
export function isMuted(): boolean {
  return muted;
}
export function onMutedChange(f: (m: boolean) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

const lastPlayed = new Map<SfxName, number>();

/** Play one effect, unless the console muted the projector. Never throws. */
export function playSfx(name: SfxName): void {
  if (muted || typeof Audio === 'undefined') return;
  const now = Date.now();
  if (now - (lastPlayed.get(name) ?? 0) < 150) return;
  lastPlayed.set(name, now);
  try {
    const a = new Audio(SFX[name]);
    a.volume = LEVEL[name];
    void a.play().catch(() => {
      /* sound not yet allowed on this page: the 소리 켜기 prompt covers it */
    });
  } catch {
    /* no audio support (tests) */
  }
}
