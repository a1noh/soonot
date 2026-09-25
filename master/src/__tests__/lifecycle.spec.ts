/**
 * `lifecycle.spec` (spec §10) — base ∪ module `ALLOWED`; illegal transitions
 * rejected per game.
 *
 * Milestone 1's acceptance test: **a fake game transitions through the
 * lifecycle**. No sockets, no UI.
 */

import { describe, expect, it } from 'vitest';
import { BASE_ALLOWED, ROOM_STATES, nextRevealStep } from '../shared/lifecycle';
import { podiumAt } from '../shared/rank';
import { HostError } from '../host/errors';
import { MASTER, harness, toRunning } from './harness';

describe('the shared lifecycle machine', () => {
  it('walks a fake game SETUP → LOBBY → RUNNING → ENDED → REVEAL', async () => {
    const h = harness();
    expect(h.stateOf('bingo')).toBe('SETUP');

    await h.dispatch('bingo', { t: 'SETUP', entrants: 12 }, MASTER);
    expect(h.stateOf('bingo')).toBe('LOBBY');

    await h.dispatch('bingo', { t: 'START' }, MASTER);
    expect(h.stateOf('bingo')).toBe('RUNNING');

    await h.dispatch('bingo', { t: 'END' }, MASTER);
    expect(h.stateOf('bingo')).toBe('ENDED');

    await h.dispatch('bingo', { t: 'REVEAL' }, MASTER);
    expect(h.stateOf('bingo')).toBe('REVEAL');
  });

  it('advances the reveal 3rd → 2nd → 1st → full standings, then holds', async () => {
    const h = harness();
    await toRunning(h, 'bingo');
    await h.dispatch('bingo', { t: 'END' }, MASTER);

    const steps: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      await h.dispatch('bingo', { t: 'REVEAL' }, MASTER);
      steps.push(h.raw('bingo').revealStep);
    }

    // Counts up to the full board and then stays there — tapping `다음` once
    // more in front of a room must never surface an error.
    expect(steps).toEqual([1, 2, 3, 4, 4, 4]);
  });

  it('rejects an action the state does not allow', async () => {
    const h = harness();
    // START belongs to LOBBY; the game is still in SETUP.
    await expect(h.dispatch('bingo', { t: 'START' }, MASTER)).rejects.toThrow(HostError);
    await expect(h.dispatch('bingo', { t: 'START' }, MASTER)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
    expect(h.stateOf('bingo')).toBe('SETUP');
  });

  it("unions the module's own table with the host's base table", async () => {
    const h = harness();
    // POKE is in the module's RUNNING list and in no base table.
    expect(BASE_ALLOWED.RUNNING).not.toContain('POKE');

    await expect(h.dispatch('bingo', { t: 'POKE' }, MASTER)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });

    await toRunning(h, 'bingo');
    await h.dispatch('bingo', { t: 'POKE' }, MASTER);
    expect(h.raw('bingo').pokes).toBe(1);
  });

  it("surfaces a game's own transition guard as an EngineError, not a host error", async () => {
    const h = harness();
    await h.dispatch('bingo', { t: 'SETUP', entrants: 1 }, MASTER);
    // The host allows START in LOBBY; the *game* refuses on its own condition.
    await expect(h.dispatch('bingo', { t: 'START' }, MASTER)).rejects.toMatchObject({
      code: 'TOO_FEW',
    });
    expect(h.stateOf('bingo')).toBe('LOBBY');
  });

  it('refuses a disabled game entirely', async () => {
    const h = harness({ disabled: ['yutnori'] });
    await expect(
      h.dispatch('yutnori', { t: 'SETUP', entrants: 4 }, MASTER),
    ).rejects.toMatchObject({ code: 'GAME_DISABLED' });
  });

  it('defines a base whitelist for every state', () => {
    for (const state of ROOM_STATES) expect(BASE_ALLOWED[state]).toBeDefined();
  });
});

describe('the shared reveal machine', () => {
  it('saturates rather than overflowing', () => {
    expect(nextRevealStep(0)).toBe(1);
    expect(nextRevealStep(3)).toBe(4);
    expect(nextRevealStep(4)).toBe(4);
  });

  it('counts up — step 1 is 3rd place, step 3 is 1st', () => {
    const ranked = [
      { id: 'a', label: '1등', detail: '' },
      { id: 'b', label: '2등', detail: '' },
      { id: 'c', label: '3등', detail: '' },
    ];
    expect(podiumAt(ranked, 1)[0]).toMatchObject({ id: 'c', medal: 3 });
    expect(podiumAt(ranked, 2)[0]).toMatchObject({ id: 'b', medal: 2 });
    expect(podiumAt(ranked, 3)[0]).toMatchObject({ id: 'a', medal: 1 });
    expect(podiumAt(ranked, 4)).toHaveLength(3);
  });

  it('the final step shows only the top 3 (never the whole field) so /p never scrolls', () => {
    const ranked = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, label: `${i}`, detail: '' }));
    const shown = podiumAt(ranked, 4);
    expect(shown).toHaveLength(3);
    expect(shown.map((e) => e.id)).toEqual(['p0', 'p1', 'p2']);
    expect(shown.map((e) => e.medal)).toEqual([1, 2, 3]);
  });

  it('skips ranks that do not exist instead of erroring', () => {
    // bingo §9 and yutnori §11 both require the reveal to run with < 3 ranked.
    const ranked = [{ id: 'a', label: '1등', detail: '' }];
    expect(podiumAt(ranked, 1)).toEqual([]);
    expect(podiumAt(ranked, 3)[0]).toMatchObject({ id: 'a', medal: 1 });
    expect(podiumAt([], 2)).toEqual([]);
  });
});
