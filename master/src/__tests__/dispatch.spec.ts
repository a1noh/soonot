/**
 * `dispatch.spec` (spec §10) — serialization under concurrent master devices;
 * commit-before-broadcast.
 */

import { describe, expect, it } from 'vitest';
import { MASTER, harness, toRunning } from './harness.js';

describe('the dispatch loop', () => {
  it('serializes concurrent actions from two master devices', async () => {
    // req §3.4: the laptop and the phone may both be signed in. Two masters
    // tapping at once must not interleave against the same state.
    const h = harness();
    await toRunning(h, 'bingo');

    await Promise.all(
      Array.from({ length: 50 }, () => h.dispatch('bingo', { t: 'POKE' }, MASTER)),
    );

    expect(h.raw('bingo').pokes).toBe(50);
  });

  it('keeps the two games on independent locks', async () => {
    // req §11: an action in one game never blocks the other.
    const h = harness();
    await toRunning(h, 'bingo');
    await toRunning(h, 'yutnori');

    await Promise.all([
      ...Array.from({ length: 20 }, () => h.dispatch('bingo', { t: 'POKE' }, MASTER)),
      ...Array.from({ length: 20 }, () => h.dispatch('yutnori', { t: 'POKE' }, MASTER)),
    ]);

    expect(h.raw('bingo').pokes).toBe(20);
    expect(h.raw('yutnori').pokes).toBe(20);
  });

  it('does not wedge a game when one action is rejected', async () => {
    const h = harness();
    await toRunning(h, 'bingo');

    await expect(h.dispatch('bingo', { t: 'NOPE' }, MASTER)).rejects.toBeTruthy();
    await h.dispatch('bingo', { t: 'POKE' }, MASTER);

    expect(h.raw('bingo').pokes).toBe(1);
  });

  it('commits state before it delivers the emits that describe it', async () => {
    const h = harness();
    await toRunning(h, 'bingo');
    await h.dispatch('bingo', { t: 'POKE' }, MASTER);

    const last = h.seenAtDelivery.at(-1);
    // The committed state at the moment of delivery already includes the poke.
    // A client can never observe an event a reconnect would not reproduce.
    expect(last?.committedPokes).toBe(1);
  });

  it('enqueues persistence before it delivers', async () => {
    const h = harness();
    await toRunning(h, 'bingo');
    const before = h.persistence.writes.length;
    await h.dispatch('bingo', { t: 'POKE' }, MASTER);

    expect(h.persistence.writes.length).toBe(before + 1);
    expect(h.persistence.writes.at(-1)).toMatchObject({ gameId: 'bingo', actionType: 'POKE' });
  });

  it('leaves state untouched when an action is rejected', async () => {
    const h = harness();
    await toRunning(h, 'bingo');
    const delivered = h.delivered.length;

    await expect(h.dispatch('bingo', { t: 'REVEAL' }, MASTER)).rejects.toBeTruthy();

    expect(h.raw('bingo').state).toBe('RUNNING');
    expect(h.delivered.length).toBe(delivered); // nothing broadcast
  });

  it('stamps every action with the host clock, and reads it nowhere else', async () => {
    const h = harness();
    await toRunning(h, 'bingo');
    const at = h.advance(5_000);
    const result = await h.dispatch('bingo', { t: 'END' }, MASTER);

    expect(result.at).toBe(at);
    expect(h.raw('bingo').endedAt).toBe(at);
  });

  it('sends room:state last, after the granular events', async () => {
    const h = harness();
    await toRunning(h, 'bingo');
    await h.dispatch('bingo', { t: 'POKE' }, MASTER);

    const emits = h.delivered.at(-1)!.emits;
    expect(emits.map((e) => e.ev)).toEqual(['stub:poked', 'room:state']);
  });
});
