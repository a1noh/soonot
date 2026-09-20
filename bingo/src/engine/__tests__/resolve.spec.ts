import { describe, it, expect } from 'vitest';
import { resolve } from '../resolve';
import { running, step } from './helpers';

describe('resolve (req §7.0)', () => {
  it('resolves an exact player number', () => {
    const r = running(3);
    expect(resolve(r, '2')).toEqual({ k: 'hit', playerId: 'p2' });
    expect(resolve(r, '002')).toEqual({ k: 'hit', playerId: 'p2' });
  });

  it('resolves a unique nickname', () => {
    const r = running(2, ['지은', '민수']);
    expect(resolve(r, '민수')).toEqual({ k: 'hit', playerId: 'p2' });
  });

  it('THREE 민수 resolve as ambiguous, not as an error', () => {
    const r = running(3, ['민수', '민수', '민수']);
    const out = resolve(r, '민수');
    expect(out.k).toBe('ambiguous');
    if (out.k !== 'ambiguous') throw new Error('unreachable');
    expect([...out.playerIds].sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('matches across NFC and whitespace variation', () => {
    const r = running(2, ['민수', '지은']);
    expect(resolve(r, ' 민수 ')).toEqual({ k: 'hit', playerId: 'p1' });
    expect(resolve(r, '민수'.normalize('NFD'))).toEqual({ k: 'hit', playerId: 'p1' });
  });

  it('misses an unknown name and an unused number', () => {
    const r = running(2);
    expect(resolve(r, '민슈')).toEqual({ k: 'miss' });
    expect(resolve(r, '99')).toEqual({ k: 'miss' });
  });

  it('a nickname containing digits is not treated as a number', () => {
    let r = running(2);
    r = step(r, { t: 'JOIN', playerId: 'px', nickname: '민수2호' });
    expect(resolve(r, '민수2호')).toEqual({ k: 'hit', playerId: 'px' });
    expect(resolve(r, '1')).toEqual({ k: 'hit', playerId: 'p1' });
  });
});
