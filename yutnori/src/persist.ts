/**
 * The EventLogStrategy (master spec §8.3).
 *
 * 말 positions are never stored — they are derived by replaying the log, which
 * is the same code path as undo (spec §4.4, §8.3). Recovery is therefore
 * exercised by every undo test rather than only by a disaster.
 */
import type { EventLogStrategy, HostDb } from '@soonot/master';
import type { Action } from './engine/actions';
import type { Room, RoomSetup, TurnEvent } from './shared/types';
import { replay } from './engine/replay';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS yut_rooms (
  event_id        TEXT PRIMARY KEY,
  setup           TEXT    NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS yut_turn_events (
  event_id  TEXT    NOT NULL,
  seq       INTEGER NOT NULL,
  payload   TEXT    NOT NULL,
  at        INTEGER NOT NULL,
  PRIMARY KEY (event_id, seq)
);
`;

/**
 * The host hands the strategy an action; the log stores `TurnEvent`s, which is
 * what `replay` consumes. `writeSetup` is called by the module on every commit
 * so the immutable half of the room is always current.
 */
export function writeSetup(db: HostDb, eventId: string, setup: RoomSetup, createdAt: number): void {
  db.prepare(
    `INSERT INTO yut_rooms (event_id, setup, created_at) VALUES (?,?,?)
     ON CONFLICT(event_id) DO UPDATE SET setup = excluded.setup`,
  ).run(eventId, JSON.stringify(setup), createdAt);
}

export function writeEvents(db: HostDb, eventId: string, history: readonly TurnEvent[]): void {
  const stmt = db.prepare(
    `INSERT INTO yut_turn_events (event_id, seq, payload, at) VALUES (?,?,?,?)
     ON CONFLICT(event_id, seq) DO NOTHING`,
  );
  for (const e of history) stmt.run(eventId, e.seq, JSON.stringify(e), e.at);
}

export const eventlog: EventLogStrategy<Room, Action> = {
  kind: 'eventlog',

  append(_db: HostDb, _eventId: string, _action: Action, _at: number): void {
    // The module writes the whole history on commit (see `persistNow` in
    // module.ts) because an Action is not a TurnEvent: a single THROW with one
    // candidate produces a MOVE too (req §8.1), so the log cannot be built from
    // actions alone without re-deriving them.
  },

  truncate(db: HostDb, eventId: string, seq: number): void {
    db.prepare(`DELETE FROM yut_turn_events WHERE event_id = ? AND seq >= ?`).run(eventId, seq);
  },

  replay(db: HostDb, eventId: string): Room | null {
    const row = db.prepare(`SELECT * FROM yut_rooms WHERE event_id = ?`).get(eventId) as
      | { setup: string }
      | undefined;
    if (!row) return null;
    const setup = JSON.parse(row.setup) as RoomSetup;
    const rows = db
      .prepare(`SELECT * FROM yut_turn_events WHERE event_id = ? ORDER BY seq`)
      .all(eventId) as unknown as { payload: string }[];
    return replay(setup, rows.map((r) => JSON.parse(r.payload) as TurnEvent));
  },
};
