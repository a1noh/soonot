/**
 * `reveal.spec` (spec §10) — exclusivity (req §5.3); projector seize and
 * release (spec §5.1).
 */

import { describe, expect, it } from 'vitest';
import { MASTER, harness, toRunning } from './harness.js';

async function toEnded(h: ReturnType<typeof harness>, gameId: 'bingo' | 'yutnori') {
  await toRunning(h, gameId);
  await h.dispatch(gameId, { t: 'END' }, MASTER);
}

describe('the reveal is exclusive', () => {
  it('rejects a second podium while the first is running', async () => {
    const h = harness();
    await toEnded(h, 'bingo');
    await toEnded(h, 'yutnori');

    await h.dispatch('bingo', { t: 'REVEAL' }, MASTER);

    await expect(h.dispatch('yutnori', { t: 'REVEAL' }, MASTER)).rejects.toMatchObject({
      code: 'REVEAL_BUSY',
      message: '이미 다른 게임 순위를 발표 중이에요',
    });
    // The blocked game waits in ENDED; the master taps 순위 발표 when ready.
    expect(h.stateOf('yutnori')).toBe('ENDED');
  });

  it('lets the sibling reveal once the first has left REVEAL', async () => {
    const h = harness();
    await toEnded(h, 'bingo');
    await toEnded(h, 'yutnori');

    await h.dispatch('bingo', { t: 'REVEAL' }, MASTER);
    // A game leaves REVEAL only by the event being reworked; here the sibling
    // is simply blocked until bingo's handle is no longer revealing.
    h.registry.commit('bingo', { ...h.raw('bingo'), state: 'ENDED', revealStep: 0 });

    await expect(h.dispatch('yutnori', { t: 'REVEAL' }, MASTER)).resolves.toBeTruthy();
    expect(h.stateOf('yutnori')).toBe('REVEAL');
  });

  it('ignores a disabled sibling that happens to be in REVEAL', async () => {
    const h = harness();
    await toEnded(h, 'bingo');
    await toEnded(h, 'yutnori');
    await h.dispatch('bingo', { t: 'REVEAL' }, MASTER);

    h.event.games.bingo.enabled = false;
    await expect(h.dispatch('yutnori', { t: 'REVEAL' }, MASTER)).resolves.toBeTruthy();
  });
});

describe('a reveal seizes the projector', () => {
  it('locks the channel and suspends the master choice', async () => {
    const h = harness();
    h.event.projector = 'yutnori';
    await toEnded(h, 'bingo');

    await h.dispatch('bingo', { t: 'REVEAL' }, MASTER);

    expect(h.event.projectorLock).toBe('bingo');
    // The master's own setting is remembered, not overwritten.
    expect(h.event.projector).toBe('yutnori');
  });

  it('releases the lock when that game leaves REVEAL', async () => {
    const h = harness();
    await toEnded(h, 'bingo');
    await toEnded(h, 'yutnori');
    await h.dispatch('bingo', { t: 'REVEAL' }, MASTER);
    expect(h.event.projectorLock).toBe('bingo');

    // Put bingo back in ENDED and dispatch anything: the lock clears because
    // the locking game is no longer revealing.
    h.registry.commit('bingo', { ...h.raw('bingo'), state: 'ENDED', revealStep: 0 });
    await h.dispatch('bingo', { t: 'REVEAL' }, MASTER);
    h.registry.commit('bingo', { ...h.raw('bingo'), state: 'ENDED', revealStep: 0 });
    await h.dispatch('yutnori', { t: 'REVEAL' }, MASTER);

    expect(h.event.projectorLock).toBe('yutnori');
  });

  it('holds the lock across the steps of one reveal', async () => {
    const h = harness();
    await toEnded(h, 'bingo');
    await h.dispatch('bingo', { t: 'REVEAL' }, MASTER);
    await h.dispatch('bingo', { t: 'REVEAL' }, MASTER);
    await h.dispatch('bingo', { t: 'REVEAL' }, MASTER);

    expect(h.event.projectorLock).toBe('bingo');
    expect(h.raw('bingo').revealStep).toBe(3);
  });
});

describe('both games run at once (req §5.1)', () => {
  it('places no host rule against two RUNNING games', async () => {
    const h = harness();
    await toRunning(h, 'bingo');
    await toRunning(h, 'yutnori');

    expect(h.stateOf('bingo')).toBe('RUNNING');
    expect(h.stateOf('yutnori')).toBe('RUNNING');
  });

  it('lets one game reveal while the other keeps running', async () => {
    const h = harness();
    await toRunning(h, 'bingo');
    await toEnded(h, 'yutnori');

    await h.dispatch('yutnori', { t: 'REVEAL' }, MASTER);

    expect(h.stateOf('yutnori')).toBe('REVEAL');
    expect(h.stateOf('bingo')).toBe('RUNNING');
    await h.dispatch('bingo', { t: 'POKE' }, MASTER); // still playable
    expect(h.raw('bingo').pokes).toBe(1);
  });
});
