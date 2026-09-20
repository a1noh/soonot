/**
 * One SQLite file for the whole host (spec §8.1).
 *
 * `better-sqlite3` is synchronous, which is what we want: a write can never
 * land out of order relative to the state it describes, and there is no
 * connection pool to misconfigure in a church basement.
 */
import Database from 'better-sqlite3';
import type { HostDb } from './strategy.js';

export const HOST_SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  projector     TEXT NOT NULL DEFAULT 'auto',
  bingo_enabled INTEGER NOT NULL DEFAULT 1,
  yut_enabled   INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  closed_at     INTEGER
);

CREATE TABLE IF NOT EXISTS host_config (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
`;

export interface OpenedDb {
  db: HostDb;
  raw: Database.Database;
  close(): void;
}

/**
 * WAL so a reader never blocks the writer; `synchronous=NORMAL` because losing
 * the last few milliseconds to a power cut is survivable and an fsync per
 * write is not (bingo §14).
 */
export function openDb(path: string, schemas: readonly string[]): OpenedDb {
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('synchronous = NORMAL');
  raw.pragma('foreign_keys = ON');
  raw.exec(HOST_SCHEMA);
  for (const schema of schemas) raw.exec(schema);
  return {
    raw,
    db: raw as unknown as HostDb,
    close: () => raw.close(),
  };
}
