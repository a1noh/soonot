/**
 * M1's acceptance (spec §8.4): kill the host mid-game, boot a new one against
 * the same file, and both games come back.
 *
 * Uses a real SQLite file in a temp dir — an in-memory database cannot prove
 * anything about surviving a process that no longer exists.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHost, type Host } from '../host/server.js';
import { hashPasscode } from '../identity/passcode.js';
import { loadConfig } from '../config.js';
import { bingoModule } from '@soonot/bingo/src/module.js';
import { yutnoriModule } from '@soonot/yutnori/src/module.js';
import { CELLS } from '@soonot/bingo/src/shared/constants.js';
import type { Room as BingoRoom } from '@soonot/bingo/src/shared/types.js';
import type { Room as YutRoom } from '@soonot/yutnori/src/shared/types.js';

const TRAITS = Array.from({ length: CELLS }, (_, i) => `특징${i}`);
let dir: string | null = null;
const hosts: Host[] = [];

afterEach(async () => {
  for (const h of hosts.splice(0)) await h.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

function boot(dbPath: string): Host {
  const host = createHost({
    config: { ...loadConfig({}), production: false, tls: false, dbPath },
    passcodeHash: hashPasscode('x'),
    modules: { bingo: bingoModule, yutnori: yutnoriModule },
  });
  hosts.push(host);
  return host;
}

const viewer = { kind: 'master' } as const;

describe('crash recovery', () => {
  it('both games survive a restart', async () => {
    dir = mkdtempSync(join(tmpdir(), 'soonot-'));
    const dbPath = join(dir, 'soonot.db');

    // ---- first process -----------------------------------------------------
    const a = boot(dbPath);
    const event = a.registry.open({ title: '한마당', now: Date.now() });

    await a.dispatch('bingo', { t: 'SET_TRAITS', texts: TRAITS }, viewer);
    await a.dispatch('bingo', { t: 'JOIN', playerId: 'p1', nickname: '민수' }, viewer);
    await a.dispatch('bingo', { t: 'JOIN', playerId: 'p2', nickname: '지은' }, viewer);
    await a.dispatch('bingo', { t: 'START' }, viewer);
    await a.dispatch('bingo', { t: 'FILL', playerId: 'p1', cellIndex: 4, query: '2' }, viewer);

    await a.dispatch(
      'yutnori',
      { t: 'SETUP', teams: [{ name: '청년' }, { name: '장년' }], malPerTeam: 2, timeLimitMin: 20 },
      viewer,
    );
    await a.dispatch('yutnori', { t: 'START' }, viewer);
    await a.dispatch('yutnori', { t: 'THROW', roll: '걸' }, viewer);
    const mid = a.registry.require().games.yutnori.state as YutRoom;
    if (mid.pendingThrow) {
      await a.dispatch('yutnori', { t: 'MOVE', malId: mid.pendingThrow.candidates[0]!.malId }, viewer);
    }

    a.persistence.flush();
    await a.close();
    hosts.length = 0;

    // ---- second process, same file ----------------------------------------
    const b = boot(dbPath);
    const restored = b.registry.current();

    expect(restored).not.toBeNull();
    expect(restored!.id).toBe(event.id);
    expect(restored!.code).toBe(event.code);
    expect(restored!.title).toBe('한마당');

    // bingo: snapshot strategy
    const bingo = restored!.games.bingo.state as BingoRoom;
    expect(bingoModule.lifecycle(bingo)).toBe('RUNNING');
    expect(bingo.players.size).toBe(2);
    expect(bingo.players.get('p1')!.fills[4]).toBe('p2');
    // the card is regenerated from the seed, never stored (req §6)
    expect(bingo.players.get('p1')!.permutation).toHaveLength(CELLS);

    // yutnori: event-log strategy, positions derived by replay
    const yut = restored!.games.yutnori.state as YutRoom;
    expect(yutnoriModule.lifecycle(yut)).toBe('RUNNING');
    expect(yut.teams.map((t) => t.name)).toEqual(['청년', '장년']);
    expect(yut.history.length).toBeGreaterThan(0);
    const moved = yut.teams.flatMap((t) => t.mal).filter((m) => m.progress > 0);
    expect(moved.length).toBeGreaterThan(0);

    // and the restored state is internally consistent
    bingoModule.invariants(bingo);
    yutnoriModule.invariants(yut);
  }, 30000);

  it('ignores an event older than six hours', async () => {
    dir = mkdtempSync(join(tmpdir(), 'soonot-'));
    const dbPath = join(dir, 'soonot.db');
    const long = 7 * 60 * 60 * 1000;

    const a = boot(dbPath);
    a.registry.open({ title: '어제', now: Date.now() - long });
    await a.dispatch('bingo', { t: 'SET_TRAITS', texts: TRAITS }, viewer);
    a.persistence.flush();
    await a.close();
    hosts.length = 0;

    expect(boot(dbPath).registry.current()).toBeNull();
  }, 30000);
});
