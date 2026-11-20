/**
 * Snapshot persistence: the whole room as one JSON row, written on every action.
 * A game is a handful of teams and stones, so this is tiny, and a restart in
 * the middle of an event comes back exactly where it was.
 */
import type { HostDb, SnapshotStrategy } from '@soonot/master';
import { EMIT_NAMES } from './engine/actions';
import { DEFAULT_PRIZES, DEFAULT_TITLE } from './shared/constants';
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
    if (!row) return null;
    const room = JSON.parse(row.room) as Partial<Room>;
    // A row written by a much older shape of this game starts fresh rather than
    // crashing the projector on a missing field.
    if (!(Array.isArray(room.claims) && Array.isArray(room.games) && Array.isArray(room.tiebreaks))) return null;
    return upgrade(room as Room);
  },
};

/**
 * Fill in what the manual chooser, title and prizes added, so a game saved
 * before them carries on: a chooser was always a team then.
 */
function upgrade(room: Room): Room {
  const name = (id: string | null) => room.teams.find((t) => t.id === id)?.name ?? '';
  type Old = { chooserId?: string | null; teamId?: string | null; guest?: string | null };
  room.title ??= DEFAULT_TITLE;
  room.prizes ??= { ...DEFAULT_PRIZES };
  room.turnGuest ??= null;
  room.claims = room.claims.map((c) => ({ ...c, chooserName: c.chooserName ?? name(c.chooserId) }));
  if (room.pending) room.pending = { ...room.pending, chooserName: room.pending.chooserName ?? name(room.pending.chooserId) };
  room.history = room.history.map((h) => {
    const o = h as unknown as Old;
    return 'teamId' in o ? h : ({ kind: h.kind, round: h.round, teamId: o.chooserId ?? null, guest: null } as Room['history'][number]);
  });
  return room;
}
