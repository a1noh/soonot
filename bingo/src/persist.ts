/**
 * The SnapshotStrategy (master spec §8.2).
 *
 * One row per player, not 81: 100 players × 81 cells would be 8,100 rows
 * rewritten per snapshot, versus 100 (req §14). `permutation` is deliberately
 * NOT stored — req §6 makes it a pure function of the seed, and storing it too
 * would create a second source of truth that can disagree after a crash.
 */
import type { HostDb, SnapshotStrategy } from '@soonot/master';
import type { Player, Room } from './shared/types';
import type { LineId } from './shared/lines';
import { makePermutation } from './engine/shuffle';

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
CREATE TABLE IF NOT EXISTS bingo_players (
  event_id        TEXT    NOT NULL,
  id              TEXT    NOT NULL,
  number          INTEGER NOT NULL,
  nickname        TEXT    NOT NULL,
  nickname_key    TEXT    NOT NULL,
  joined_at       INTEGER NOT NULL,
  late_join       INTEGER NOT NULL,
  fills           TEXT    NOT NULL,
  filled_at       TEXT    NOT NULL,
  first_bingo_at  INTEGER,
  first_bingo_seq INTEGER,
  completed_lines TEXT    NOT NULL,
  PRIMARY KEY (event_id, id)
);
CREATE INDEX IF NOT EXISTS bingo_players_by_key
  ON bingo_players (event_id, nickname_key);
CREATE TABLE IF NOT EXISTS bingo_events (
  event_id  TEXT    NOT NULL,
  seq       INTEGER NOT NULL,
  player_id TEXT    NOT NULL,
  line_id   TEXT    NOT NULL,
  at        INTEGER NOT NULL,
  line_count INTEGER NOT NULL,
  PRIMARY KEY (event_id, seq)
);
`;

interface PlayerRow {
  id: string;
  number: number;
  nickname: string;
  nickname_key: string;
  joined_at: number;
  late_join: number;
  fills: string;
  filled_at: string;
  first_bingo_at: number | null;
  first_bingo_seq: number | null;
  completed_lines: string;
}

/**
 * Rebuild the derived indexes rather than storing them, so recovery exercises
 * the same construction the engine uses (spec §8.3).
 */
function hydrate(eventId: string, room: Omit<Room, 'players' | 'byNumber' | 'nameIndex'>, rows: PlayerRow[]): Room {
  const players = new Map<string, Player>();
  const byNumber = new Map<number, string>();
  const nameIndex = new Map<string, string[]>();
  const carded = room.state === 'RUNNING' || room.state === 'ENDED' || room.state === 'REVEAL';

  for (const r of rows) {
    const fills = JSON.parse(r.fills) as (string | null)[];
    const player: Player = {
      id: r.id,
      number: r.number,
      nickname: r.nickname,
      nicknameKey: r.nickname_key,
      joinedAt: r.joined_at,
      lateJoin: r.late_join === 1,
      // Connections are gone after a restart; clients reconnect (spec §8.4).
      connected: false,
      permutation: carded ? makePermutation(eventId, r.id) : [],
      fills,
      filledAt: JSON.parse(r.filled_at) as (number | null)[],
      usedPlayerIds: new Set(fills.filter((f): f is string => f !== null)),
      firstBingoAt: r.first_bingo_at,
      firstBingoSeq: r.first_bingo_seq,
      completedLines: JSON.parse(r.completed_lines) as LineId[],
    };
    players.set(player.id, player);
    byNumber.set(player.number, player.id);
    nameIndex.set(player.nicknameKey, [...(nameIndex.get(player.nicknameKey) ?? []), player.id]);
  }

  return { ...room, players, byNumber, nameIndex };
}

export const snapshot: SnapshotStrategy<Room> = {
  kind: 'snapshot',
  schema: SCHEMA,

  triggers: {
    onTransition: true,
    // A bingo is the one thing that must survive a crash unchanged — it is
    // what the podium is computed from.
    onEmits: ['bingo:announced'],
    debounceMs: 1000,
  },

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

    const upsert = db.prepare(
      `INSERT INTO bingo_players
         (event_id, id, number, nickname, nickname_key, joined_at, late_join,
          fills, filled_at, first_bingo_at, first_bingo_seq, completed_lines)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(event_id, id) DO UPDATE SET
         nickname=excluded.nickname, nickname_key=excluded.nickname_key,
         fills=excluded.fills, filled_at=excluded.filled_at,
         first_bingo_at=excluded.first_bingo_at,
         first_bingo_seq=excluded.first_bingo_seq,
         completed_lines=excluded.completed_lines`,
    );
    for (const p of state.players.values()) {
      upsert.run(
        eventId, p.id, p.number, p.nickname, p.nicknameKey, p.joinedAt, p.lateJoin ? 1 : 0,
        JSON.stringify(p.fills), JSON.stringify(p.filledAt),
        p.firstBingoAt, p.firstBingoSeq, JSON.stringify(p.completedLines),
      );
    }

    const ev = db.prepare(
      `INSERT INTO bingo_events (event_id, seq, player_id, line_id, at, line_count)
       VALUES (?,?,?,?,?,?) ON CONFLICT(event_id, seq) DO NOTHING`,
    );
    for (const e of state.bingoEvents) {
      ev.run(eventId, e.seq, e.playerId, e.lineId, e.at, e.lineCount);
    }
  },

  read(db: HostDb, eventId: string): Room | null {
    const row = db
      .prepare(`SELECT * FROM bingo_rooms WHERE event_id = ?`)
      .get(eventId) as Record<string, never> | undefined;
    if (!row) return null;

    const r = row as unknown as {
      state: Room['state']; traits: string; next_number: number; seq: number;
      started_at: number | null; ended_at: number | null; reveal_step: number; created_at: number;
    };
    const events = db
      .prepare(`SELECT * FROM bingo_events WHERE event_id = ? ORDER BY seq`)
      .all(eventId) as unknown as { seq: number; player_id: string; line_id: string; at: number; line_count: number }[];
    const players = db
      .prepare(`SELECT * FROM bingo_players WHERE event_id = ? ORDER BY number`)
      .all(eventId) as unknown as PlayerRow[];

    return hydrate(
      eventId,
      {
        eventId,
        state: r.state,
        traits: JSON.parse(r.traits) as Room['traits'],
        nextNumber: r.next_number,
        seq: r.seq,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        revealStep: r.reveal_step,
        createdAt: r.created_at,
        bingoEvents: events.map((e) => ({
          playerId: e.player_id, lineId: e.line_id, at: e.at, seq: e.seq, lineCount: e.line_count,
        })),
      },
      players,
    );
  },
};
