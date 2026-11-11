/**
 * Snapshot persistence: the whole room as one JSON row, written on every action.
 * A game is a handful of teams and stones, so this is tiny, and a restart in
 * the middle of an event comes back exactly where it was.
 */
import type { HostDb, SnapshotStrategy } from '@soonot/master';
import { EMIT_NAMES } from './engine/actions';
import type { Room } from './shared/types';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS stones_rooms (
  event_id   TEXT PRIMARY KEY,
  room       TEXT NOT NULL
);
`;

export const snapshot: SnapshotStrategy<Room> = {
  kind: 'snapshot',
  schema: SCHEMA,
  triggers: { onTransition: true, onEmits: EMIT_NAMES, debounceMs: 500 },
  write(db: HostDb, eventId: string, state: Room): void {
    db.prepare(
      `INSERT INTO stones_rooms (event_id, room) VALUES (?, ?)
       ON CONFLICT(event_id) DO UPDATE SET room = excluded.room`,
    ).run(eventId, JSON.stringify(state));
  },
  read(db: HostDb, eventId: string): Room | null {
    const row = db.prepare(`SELECT room FROM stones_rooms WHERE event_id = ?`).get(eventId) as
      | { room: string }
      | undefined;
    return row ? (JSON.parse(row.room) as Room) : null;
  },
};
