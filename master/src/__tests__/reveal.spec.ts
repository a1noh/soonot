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

describe('a reveal always seizes the projector (no exclusivity block)', () => {
  it('lets the sibling reveal even while the first is still in REVEAL, moving the screen', async () => {
    // We dropped REVEAL_BUSY: nothing ever leaves REVEAL except 다시 하기, so a game
    // stuck in REVEAL used to permanently block the other game's 순위 발표. Now the
    // second reveal simply takes over the screen.
    const h = harness();
    await toEnded(h, 'bingo');
    await toEnded(h, 'yutnori');

    await h.dispatch('bingo', { t: 'REVEAL' }, MASTER);
    expect(h.event.projectorLock).toBe('bingo');

    await expect(h.dispatch('yutnori', { t: 'REVEAL' }, MASTER)).resolves.toBeTruthy();
    expect(h.stateOf('yutnori')).toBe('REVEAL');
    expect(h.event.projectorLock).toBe('yutnori'); // the later reveal seizes the screen
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
