import { describe, it, expect } from 'vitest';
import { snapshot } from '../persist';
import { assertInvariants } from '../engine/invariants';
import { rankPlayers } from '../engine/ranking';
import { LINES } from '../shared/lines';
import { CELLS } from '../shared/constants';
import { createFakeDb } from './fakedb';
import { running, step, fillLine } from '../engine/__tests__/helpers';

/** A game with history: fills, a bingo, and a disconnect. */
function played() {
  let r = running(12);
  r = fillLine(r, 'p1', LINES[0]!.cells);          // p1 has a bingo
  r = step(r, { t: 'FILL', playerId: 'p2', cellIndex: 5, query: '3' });
  r = step(r, { t: 'DISCONNECT', playerId: 'p4' });
  return r;
}

describe('snapshot strategy (master spec §8.2)', () => {
  it('declares triggers that never debounce a bingo', () => {
    expect(snapshot.triggers.onTransition).toBe(true);
    expect(snapshot.triggers.onEmits).toContain('bingo:announced');
    expect(snapshot.triggers.debounceMs).toBe(1000);
  });

  it('round-trips a played game', () => {
    const db = createFakeDb();
    const before = played();
    snapshot.write(db, 'ev1', before);
    const after = snapshot.read(db, 'ev1')!;

    expect(after).not.toBeNull();
    assertInvariants(after);
    expect(after.state).toBe(before.state);
    expect(after.seq).toBe(before.seq);
    expect(after.nextNumber).toBe(before.nextNumber);
    expect(after.players.size).toBe(before.players.size);
    expect(after.bingoEvents).toEqual(before.bingoEvents);
  });

  it('regenerates the permutation from the seed rather than storing it', () => {
    const db = createFakeDb();
    const before = played();
    snapshot.write(db, 'ev1', before);

    // nothing in the persisted rows mentions a card layout
    const rows = [...db.tables.get('bingo_players')!.values()];
    expect(JSON.stringify(rows)).not.toContain('permutation');

    const after = snapshot.read(db, 'ev1')!;
    for (const [id, p] of after.players) {
      expect(p.permutation).toEqual(before.players.get(id)!.permutation);
      expect(p.permutation).toHaveLength(CELLS);
    }
  });

  it('one row per player, not 81', () => {
    const db = createFakeDb();
    snapshot.write(db, 'ev1', played());
    expect(db.tables.get('bingo_players')!.size).toBe(12);
  });

  it('rebuilds the derived indexes, not just the rows', () => {
    const db = createFakeDb();
    const before = played();
    snapshot.write(db, 'ev1', before);
    const after = snapshot.read(db, 'ev1')!;

    expect(after.byNumber.size).toBe(after.players.size);
    expect(after.players.get('p1')!.usedPlayerIds.size).toBe(9);
    expect(after.nameIndex.get(after.players.get('p1')!.nicknameKey)).toContain('p1');
  });

  it('preserves the podium exactly', () => {
    const db = createFakeDb();
    const before = played();
    snapshot.write(db, 'ev1', before);
    const after = snapshot.read(db, 'ev1')!;
    expect(rankPlayers(after).map((p) => p.id)).toEqual(rankPlayers(before).map((p) => p.id));
    expect(after.players.get('p1')!.firstBingoSeq).toBe(before.players.get('p1')!.firstBingoSeq);
  });

  it('everyone comes back disconnected — clients reconnect (spec §8.4)', () => {
    const db = createFakeDb();
    snapshot.write(db, 'ev1', played());
    const after = snapshot.read(db, 'ev1')!;
    expect([...after.players.values()].every((p) => !p.connected)).toBe(true);
  });

  it('a second write overwrites rather than duplicating', () => {
    const db = createFakeDb();
    let r = played();
    snapshot.write(db, 'ev1', r);
    r = step(r, { t: 'FILL', playerId: 'p2', cellIndex: 9, query: '5' });
    snapshot.write(db, 'ev1', r);
    expect(db.tables.get('bingo_players')!.size).toBe(12);
    expect(snapshot.read(db, 'ev1')!.players.get('p2')!.fills[9]).toBe('p5');
  });

  it('returns null for an unknown event', () => {
    expect(snapshot.read(createFakeDb(), 'nope')).toBeNull();
  });
});
