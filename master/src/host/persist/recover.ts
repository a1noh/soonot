/**
 * Boot recovery (spec §8.4).
 *
 * Load the one event younger than `MAX_AGE_MS` whose games are not all done,
 * restore each game by its own strategy, and rebuild the registry. Connections
 * are gone, so no emits are replayed — clients reconnect and are sent
 * `room:state`.
 */
import type { GameId } from '../../shared/lifecycle.js';
import { GAME_IDS } from '../../shared/lifecycle.js';
import type { AnyGameModule } from '../module.js';
import type { EventRecord } from '../../event/event.js';
import type { HostDb } from './strategy.js';

/** A game older than an evening is not being recovered into (spec §8.4). */
export const MAX_AGE_MS = 6 * 60 * 60 * 1000;

interface EventRow {
  id: string;
  code: string;
  title: string;
  projector: string;
  bingo_enabled: number;
  yut_enabled: number;
  created_at: number;
  closed_at: number | null;
}

export function writeEventRow(db: HostDb, event: EventRecord): void {
  db.prepare(
    `INSERT INTO events (id, code, title, projector, bingo_enabled, yut_enabled, created_at, closed_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       projector = excluded.projector,
       bingo_enabled = excluded.bingo_enabled,
       yut_enabled = excluded.yut_enabled,
       closed_at = excluded.closed_at`,
  ).run(
    event.id,
    event.code,
    event.title,
    event.projector,
    event.games.bingo.enabled ? 1 : 0,
    event.games.yutnori.enabled ? 1 : 0,
    event.createdAt,
    event.closedAt,
  );
}

export function recoverEvent(
  db: HostDb,
  modules: Readonly<Record<GameId, AnyGameModule>>,
  now: number,
): EventRecord | null {
  const row = db
    .prepare(
      `SELECT * FROM events
        WHERE closed_at IS NULL AND created_at > ?
        ORDER BY created_at DESC LIMIT 1`,
    )
    .get(now - MAX_AGE_MS) as EventRow | undefined;
  if (!row) return null;

  const games = {} as EventRecord['games'];
  for (const gameId of GAME_IDS) {
    const module = modules[gameId];
    const strategy = module.persistence;
    const restored =
      strategy.kind === 'snapshot' ? strategy.read(db, row.id) : strategy.replay(db, row.id);
    games[gameId] = {
      // A game with nothing persisted was never started; a fresh SETUP state
      // is the honest restoration of that, not an error.
      state: restored ?? module.create(row.id, now),
      enabled: (gameId === 'bingo' ? row.bingo_enabled : row.yut_enabled) === 1,
      lastRoomWideEmitAt: 0,
    };
  }

  return {
    id: row.id,
    code: row.code,
    title: row.title,
    projector: (row.projector === 'auto' ? 'auto' : row.projector) as EventRecord['projector'],
    // A reveal in progress does not survive a restart: the room saw it stop.
    projectorLock: null,
    games,
    createdAt: row.created_at,
    closedAt: null,
  };
}
