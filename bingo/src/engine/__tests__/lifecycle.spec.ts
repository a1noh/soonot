import { describe, it, expect } from 'vitest';
import { EngineError } from '@soonot/master';
import { apply, create } from '../apply';
import { CELLS } from '../../shared/constants';
import { T81, running, step, tick } from './helpers';

describe('lifecycle (req §4)', () => {
  it('SETUP requires exactly 81 traits', () => {
    const r = create('ev1', tick());
    expect(() => apply(r, { t: 'SET_TRAITS', texts: ['a'] }, tick())).toThrow(EngineError);
    expect(step(r, { t: 'SET_TRAITS', texts: T81 }).state).toBe('LOBBY');
  });

  it('START needs at least 2 players and assigns every card', () => {
    let r = step(create('ev1', tick()), { t: 'SET_TRAITS', texts: T81 });
    r = step(r, { t: 'JOIN', playerId: 'p1', nickname: 'a' });
    expect(() => apply(r, { t: 'START' }, tick())).toThrow(EngineError);
    r = step(r, { t: 'JOIN', playerId: 'p2', nickname: 'b' });
    r = step(r, { t: 'START' });
    expect(r.state).toBe('RUNNING');
    for (const p of r.players.values()) expect(p.permutation).toHaveLength(CELLS);
  });

  it('FILL is illegal before START and after END', () => {
    let r = step(create('ev1', tick()), { t: 'SET_TRAITS', texts: T81 });
    r = step(r, { t: 'JOIN', playerId: 'p1', nickname: 'a' });
    r = step(r, { t: 'JOIN', playerId: 'p2', nickname: 'b' });
    const fill = { t: 'FILL', playerId: 'p1', cellIndex: 0, query: '2' } as const;
    expect(() => apply(r, fill, tick())).toThrow(/NOT_ALLOWED_IN_STATE/);
    r = step(r, { t: 'START' });
    r = step(r, { t: 'END' });
    expect(() => apply(r, fill, tick())).toThrow(/NOT_ALLOWED_IN_STATE/);
  });

  it('a late joiner is flagged and gets a card immediately (req §4)', () => {
    let r = running(2);
    r = step(r, { t: 'JOIN', playerId: 'late', nickname: '늦참' }, 9999);
    const p = r.players.get('late')!;
    expect(p.lateJoin).toBe(true);
    expect(p.joinedAt).toBe(9999);
    expect(p.permutation).toHaveLength(CELLS);
    expect(r.players.get('p1')!.lateJoin).toBe(false);
  });

  it('numbers are sequential and never reused', () => {
    let r = running(3);
    expect([...r.players.values()].map((p) => p.number)).toEqual([1, 2, 3]);
    r = step(r, { t: 'JOIN', playerId: 'p4', nickname: 'd' });
    expect(r.players.get('p4')!.number).toBe(4);
  });

  it('a disconnect keeps the player nameable (req §7.4)', () => {
    let r = running(3);
    r = step(r, { t: 'DISCONNECT', playerId: 'p2' });
    expect(r.players.get('p2')!.connected).toBe(false);
    r = step(r, { t: 'FILL', playerId: 'p1', cellIndex: 0, query: '2' });
    expect(r.players.get('p1')!.fills[0]).toBe('p2');
  });

  it('REJOIN restores the same card', () => {
    let r = running(3);
    r = step(r, { t: 'FILL', playerId: 'p1', cellIndex: 0, query: '2' });
    const before = r.players.get('p1')!.permutation;
    r = step(r, { t: 'DISCONNECT', playerId: 'p1' });
    r = step(r, { t: 'REJOIN', playerId: 'p1' });
    const p = r.players.get('p1')!;
    expect(p.connected).toBe(true);
    expect(p.permutation).toEqual(before);
    expect(p.fills[0]).toBe('p2');
  });

  it('rejects a duplicate playerId and an empty nickname', () => {
    const r = running(2);
    expect(() => apply(r, { t: 'JOIN', playerId: 'p1', nickname: 'x' }, tick())).toThrow(/ALREADY_JOINED/);
    expect(() => apply(r, { t: 'JOIN', playerId: 'zz', nickname: '  ' }, tick())).toThrow(/EMPTY_NICKNAME/);
  });
});
