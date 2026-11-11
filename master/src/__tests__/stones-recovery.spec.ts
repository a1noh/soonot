/**
 * 스톤 survives a restart (snapshot strategy), and a database written before
 * 스톤 existed gains its `stones_enabled` column on boot instead of crashing.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { createHost, type Host } from '../host/server.js';
import { hashPasscode } from '../identity/passcode.js';
import { loadConfig } from '../config.js';
import { bingoModule } from '@soonot/bingo/src/module.js';
import { yutnoriModule } from '@soonot/yutnori/src/module.js';
import { stonesModule } from '@soonot/stones/src/module.js';
import type { Room as StonesRoom } from '@soonot/stones/src/shared/types.js';

let dir: string | null = null;
const hosts: Host[] = [];
const viewer = { kind: 'master' } as const;

afterEach(async () => {
  for (const h of hosts.splice(0)) await h.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

function boot(dbPath: string): Host {
  const host = createHost({
    config: { ...loadConfig({}), production: false, tls: false, dbPath },
    passcodeHash: hashPasscode('x'),
    modules: { bingo: bingoModule, yutnori: yutnoriModule, stones: stonesModule },
  });
  hosts.push(host);
  return host;
}

describe('스톤 recovery', () => {
  it('comes back mid-game with wins, turn and who plays', async () => {
    dir = mkdtempSync(join(tmpdir(), 'soonot-'));
    const dbPath = join(dir, 'soonot.db');
    const a = boot(dbPath);
    const event = a.registry.open({ title: '한마당', now: Date.now() });
    await a.dispatch(
      'stones',
      {
        t: 'SETUP',
        teams: [
          { name: '선교', playing: true },
          { name: '예배', playing: true },
          { name: '양육', playing: false },
        ],
        stones: [{ name: '빨강', mission: '노래' }, { name: '파랑', mission: '퀴즈' }],
      },
      viewer,
    );
    await a.dispatch('stones', { t: 'START' }, viewer);
    await a.dispatch('stones', { t: 'PICK', stoneId: 's1' }, viewer);
    await a.dispatch('stones', { t: 'RESOLVE', success: true }, viewer);
    await a.dispatch('stones', { t: 'PICK', stoneId: 's2' }, viewer); // left pending on purpose
    await a.close();
    hosts.length = 0;

    const b = boot(dbPath);
    const restored = b.registry.current();
    expect(restored?.id).toBe(event.id);
    expect(restored?.games.stones.enabled).toBe(true);
    const room = restored!.games.stones.state as StonesRoom;
    expect(room.state).toBe('RUNNING');
    expect(room.wins).toEqual([expect.objectContaining({ teamId: 't1', stoneId: 's1' })]);
    expect(room.turnTeamId).toBe('t2');
    expect(room.pending).toEqual({ teamId: 't2', stoneId: 's2' });
    expect(room.teams.map((t) => t.playing)).toEqual([true, true, false]);
    stonesModule.invariants(room);
  }, 30000);

  it('adds stones_enabled to an events table from before 스톤', async () => {
    dir = mkdtempSync(join(tmpdir(), 'soonot-'));
    const dbPath = join(dir, 'soonot.db');
    // The live volume's schema as first deployed: no stones column.
    const old = new Database(dbPath);
    old.exec(`CREATE TABLE events (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      projector TEXT NOT NULL DEFAULT 'auto',
      bingo_enabled INTEGER NOT NULL DEFAULT 1, yut_enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL, closed_at INTEGER)`);
    old.prepare(`INSERT INTO events (id, code, title, created_at) VALUES ('e-old', 'ABCD', '지난 행사', ?)`).run(Date.now());
    old.close();

    const host = boot(dbPath);
    const restored = host.registry.current();
    expect(restored?.title).toBe('지난 행사');
    expect(restored?.games.stones.enabled).toBe(true);
    expect((restored!.games.stones.state as StonesRoom).state).toBe('SETUP');
  }, 30000);
});
