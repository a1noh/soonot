import { describe, it, expect } from 'vitest';
import { BASE_ALLOWED, ROOM_STATES } from '@soonot/master';
import type { Viewer } from '@soonot/master';
import { bingoModule as M } from '../module';
import { CELLS } from '../shared/constants';
import { running, T81 } from '../engine/__tests__/helpers';

const master: Viewer = { kind: 'master' };
const player = (id: string): Viewer => ({ kind: 'player', playerId: id });
const spectator: Viewer = { kind: 'spectator' };

describe('GameModule contract', () => {
  it('declares its identity, clock opt-out and strategy', () => {
    expect(M.id).toBe('bingo');
    // req §16.4 — a 1 Hz tick to 100 clients costs more than the whole game
    expect(M.ticks).toBe(false);
    expect(M.persistence.kind).toBe('snapshot');
  });

  it('allowed is a total record over every RoomState', () => {
    for (const s of ROOM_STATES) expect(Array.isArray(M.allowed[s])).toBe(true);
  });

  it('allowed never contradicts the host base table', () => {
    for (const s of ROOM_STATES) {
      const overlap = M.allowed[s].filter((t) => BASE_ALLOWED[s].includes(t));
      expect(overlap).toEqual([]);
    }
  });

  it('lifecycle reads the shared state out of opaque game state', () => {
    expect(M.lifecycle(M.create('ev1', 1))).toBe('SETUP');
    expect(M.lifecycle(running(2))).toBe('RUNNING');
  });
});

describe('route (master spec §3.2)', () => {
  it('maps master events', () => {
    expect(M.route('master:start', { gameId: 'bingo' }, master)).toEqual({ t: 'START' });
    expect(M.route('master:end', { gameId: 'bingo' }, master)).toEqual({ t: 'END' });
    expect(M.route('master:reveal', { step: 2 }, master)).toEqual({ t: 'REVEAL', step: 2 });
    expect(M.route('master:setTraits', { texts: T81 }, master)).toEqual({ t: 'SET_TRAITS', texts: T81 });
  });

  it('rejects a bad trait count and a bad reveal step', () => {
    expect(M.route('master:setTraits', { texts: ['a'] }, master)).toBeNull();
    expect(M.route('master:reveal', { step: 9 }, master)).toBeNull();
  });

  it('maps player events', () => {
    expect(M.route('room:join', { nickname: '민수' }, player('p1')))
      .toEqual({ t: 'JOIN', playerId: 'p1', nickname: '민수' });
    expect(M.route('cell:fill', { cellIndex: 3, query: '42' }, player('p1')))
      .toEqual({ t: 'FILL', playerId: 'p1', cellIndex: 3, query: '42' });
    expect(M.route('cell:clear', { cellIndex: 3 }, player('p1')))
      .toEqual({ t: 'CLEAR', playerId: 'p1', cellIndex: 3 });
  });

  it('a player can never drive a master action, and vice versa', () => {
    expect(M.route('master:end', {}, player('p1'))).toBeNull();
    expect(M.route('master:start', {}, spectator)).toBeNull();
    expect(M.route('cell:fill', { cellIndex: 0, query: '1' }, master)).toBeNull();
  });

  it('a spectator and an unidentified socket drive nothing', () => {
    expect(M.route('cell:fill', { cellIndex: 0, query: '1' }, spectator)).toBeNull();
    expect(M.route('cell:fill', { cellIndex: 0, query: '1' }, player(''))).toBeNull();
  });

  it('rejects malformed payloads rather than trusting them', () => {
    expect(M.route('cell:fill', { cellIndex: '3', query: '1' }, player('p1'))).toBeNull();
    expect(M.route('cell:fill', { cellIndex: 1.5, query: '1' }, player('p1'))).toBeNull();
    expect(M.route('room:join', {}, player('p1'))).toBeNull();
    expect(M.route('nonsense', {}, player('p1'))).toBeNull();
  });
});

describe('project (master spec §3.3)', () => {
  it('a player sees their OWN card and never anybody elses', () => {
    const r = running(3);
    const v = M.project(r, player('p1')) as { kind: string; me: { id: string } | null };
    expect(v.kind).toBe('player');
    expect(v.me!.id).toBe('p1');
    // the only fills anywhere in the payload are the viewer's own
    expect(JSON.stringify(v)).not.toContain('"fills"'.repeat(2));
    const others = (v as unknown as { roster: { id: string }[] }).roster;
    expect(others).toHaveLength(3);
    expect(JSON.stringify(others)).not.toContain('permutation');
  });

  it('a spectator sees counts but no cards, no roster, no traits', () => {
    const v = M.project(running(3), spectator) as Record<string, unknown>;
    expect(v['kind']).toBe('spectator');
    expect(v['playerCount']).toBe(3);
    expect(v['me']).toBeUndefined();
    expect(v['roster']).toBeUndefined();
    expect(v['traits']).toBeUndefined();
  });

  it('the master sees the roster and a top-10 leaderboard, not 100 rows', () => {
    const v = M.project(running(3), master) as { kind: string; leaders: unknown[]; roster: unknown[] };
    expect(v.kind).toBe('master');
    expect(v.roster).toHaveLength(3);
    expect(v.leaders).toHaveLength(0);
  });

  it('a player who has not joined gets a null card, not an error', () => {
    const v = M.project(running(2), player('ghost')) as { me: unknown };
    expect(v.me).toBeNull();
  });

  it('exposes the 81 traits to players so cells can render', () => {
    const v = M.project(running(2), player('p1')) as { traits: string[] };
    expect(v.traits).toHaveLength(CELLS);
  });
});
