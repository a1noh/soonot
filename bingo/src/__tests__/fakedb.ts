/**
 * A tiny in-memory stand-in for `HostDb`, enough to exercise the real SQL
 * shape of the snapshot strategy without depending on better-sqlite3 at
 * milestone 4. Understands the three statement forms persist.ts uses.
 */
import type { HostDb } from '@soonot/master';

const PK: Record<string, string[]> = {
  bingo_rooms: ['event_id'],
  bingo_players: ['event_id', 'id'],
  bingo_events: ['event_id', 'seq'],
};

export function createFakeDb(): HostDb & {
  tables: Map<string, Map<string, Record<string, unknown>>>;
} {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  const tableOf = (name: string) => {
    let t = tables.get(name);
    if (!t) tables.set(name, (t = new Map()));
    return t;
  };

  return {
    tables,
    exec() {
      /* CREATE TABLE — nothing to do */
    },
    prepare(sql: string) {
      const insert = /INSERT INTO (\w+)\s*\(([^)]+)\)/i.exec(sql);
      const select = /SELECT \* FROM (\w+) WHERE event_id = \?/i.exec(sql);
      const doNothing = /DO NOTHING/i.test(sql);

      return {
        run(...params: unknown[]) {
          if (!insert) throw new Error(`fakedb: unsupported statement: ${sql}`);
          const table = insert[1]!;
          const cols = insert[2]!.split(',').map((c) => c.trim());
          const row: Record<string, unknown> = {};
          cols.forEach((c, i) => (row[c] = params[i]));
          const key = PK[table]!.map((k) => String(row[k])).join('\u0000');
          const t = tableOf(table);
          if (t.has(key) && doNothing) return;
          t.set(key, row);
        },
        get(...params: unknown[]) {
          if (!select) throw new Error(`fakedb: unsupported statement: ${sql}`);
          const eventId = String(params[0]);
          for (const row of tableOf(select[1]!).values()) {
            if (row['event_id'] === eventId) return row;
          }
          return undefined;
        },
        all(...params: unknown[]) {
          if (!select) throw new Error(`fakedb: unsupported statement: ${sql}`);
          const eventId = String(params[0]);
          const rows = [...tableOf(select[1]!).values()].filter((r) => r['event_id'] === eventId);
          const order = /ORDER BY (\w+)/i.exec(sql)?.[1];
          if (order) rows.sort((a, b) => Number(a[order]) - Number(b[order]));
          return rows;
        },
      };
    },
  };
}
