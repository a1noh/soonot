import { describe, it, expect } from 'vitest';
import { snapshot } from '../persist';
import { assertInvariants } from '../engine/invariants';
import { LINES } from '../shared/lines';
import { CELLS } from '../shared/constants';
import { createFakeDb } from './fakedb';
import { running, step, fillLine } from '../engine/__tests__/helpers';

/** A game with history: fills, a bingo, and a disconnect. */
function played() {
  let r = running(12);
  r = fillLine(r, 'p1', LINES[0]!.cells); // p1 has a bingo
  r = step(r, { t: 'FILL', playerId: 'p2', cellIndex: 5, query: '3' });
  r = step(r, { t: 'DISCONNECT', playerId: 'p4' });
  return r;
}

/**
 * Clean-restart policy (user request): persistence keeps ONLY the trait list.
 * The roster and play are session-only — never written, never recovered — so a
 * deploy/restart never resurrects people from a previous session.
 */
describe('snapshot strategy — clean-restart (config-only) persistence', () => {
  it('declares a debounced on-transition trigger', () => {
    expect(snapshot.triggers.onTransition).toBe(true);
    expect(snapshot.triggers.debounceMs).toBe(1000);
  });

  it('recovers the trait list but NOT the roster or play (clean slate)', () => {
    const db = createFakeDb();
    const before = played();
    expect(before.players.size).toBe(12);
    snapshot.write(db, 'ev1', before);

    const after = snapshot.read(db, 'ev1')!;
    assertInvariants(after);
    expect(after.traits.length).toBe(CELLS); // setup survives
    expect(after.players.size).toBe(0); // nobody carried over
    expect(after.bingoEvents).toEqual([]); // no play carried over
    expect(after.startedAt).toBeNull();
    expect(after.state).toBe('LOBBY'); // ready for a fresh round with the same traits
  });

  it('never writes any player data to the database', () => {
    const db = createFakeDb();
    snapshot.write(db, 'ev1', played());
    // the roster/bingo tables are never created or written — no player data at rest
    expect(db.tables.get('bingo_players')).toBeUndefined();
    expect(db.tables.get('bingo_events')).toBeUndefined();
  });

  it('a second write overwrites rather than duplicating the one config row', () => {
    const db = createFakeDb();
    snapshot.write(db, 'ev1', played());
    snapshot.write(db, 'ev1', played());
    expect(db.tables.get('bingo_rooms')!.size).toBe(1);
  });

  it('returns null for an unknown event', () => {
    expect(snapshot.read(createFakeDb(), 'nope')).toBeNull();
  });
});
