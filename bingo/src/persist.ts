/**
 * The SnapshotStrategy (master spec §8.2), with a deliberate **clean-restart**
 * policy: only the event's **trait list** is persisted. The roster and play
 * (players, fills, bingos) are session-only — they live in memory while the
 * server is up and are NEVER written or recovered. A deploy/restart therefore
 * comes back with the setup intact but a clean slate, so people from a previous
 * session are never resurrected (user request).
 */
import type { HostDb, SnapshotStrategy } from '@soonot/master';
import type { Room } from './shared/types';
import { CELLS } from './shared/constants';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS bingo_rooms (
  event_id     TEXT PRIMARY KEY,
  state        TEXT    NOT NULL,
  traits       TEXT    NOT NULL,
  next_number  INTEGER NOT NULL,
  seq          INTEGER NOT NULL,
  started_at   INTEGER,
  ended_at     INTEGER,
  reveal_step  INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);
`;

export const snapshot: SnapshotStrategy<Room> = {
  kind: 'snapshot',
  schema: SCHEMA,

  triggers: {
    onTransition: true,
    // Only config (traits) is persisted, so there's nothing to write per-emit.
    onEmits: [],
    debounceMs: 1000,
  },

  /** Persist only the trait list (+ event createdAt). No player/roster data. */
  write(db: HostDb, eventId: string, state: Room): void {
    db.prepare(
      `INSERT INTO bingo_rooms
         (event_id, state, traits, next_number, seq, started_at, ended_at, reveal_step, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(event_id) DO UPDATE SET
         state=excluded.state, traits=excluded.traits, next_number=excluded.next_number,
         seq=excluded.seq, started_at=excluded.started_at, ended_at=excluded.ended_at,
         reveal_step=excluded.reveal_step`,
    ).run(
      eventId,
      state.state,
      JSON.stringify(state.traits),
      state.nextNumber,
      state.seq,
      state.startedAt,
      state.endedAt,
      state.revealStep,
      state.createdAt,
    );
  },

  /**
   * Recover the trait list only, with an empty roster. If traits were set, the
   * game comes back in LOBBY (ready for players to join and the master to start);
   * otherwise SETUP. Never restores players or play — a fresh server is clean.
   */
  read(db: HostDb, eventId: string): Room | null {
    const row = db
      .prepare(`SELECT * FROM bingo_rooms WHERE event_id = ?`)
      .get(eventId) as Record<string, never> | undefined;
    if (!row) return null;

    const r = row as unknown as { traits: string; created_at: number };
    const traits = JSON.parse(r.traits) as Room['traits'];
    const hasTraits = traits.length === CELLS;

    return {
      eventId,
      state: hasTraits ? 'LOBBY' : 'SETUP',
      traits,
      players: new Map(),
      byNumber: new Map(),
      nameIndex: new Map(),
      nextNumber: 1,
      bingoEvents: [],
      seq: 0,
      startedAt: null,
      endedAt: null,
      revealStep: 0,
      createdAt: r.created_at,
    };
  },
};
