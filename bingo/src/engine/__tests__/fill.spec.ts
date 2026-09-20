import { describe, it, expect } from 'vitest';
import { apply } from '../apply';
import { running, step, emitsOf, tick } from './helpers';

describe('fill validation (req §7.2)', () => {
  it('a valid fill turns the cell green and is unicast', () => {
    const r = running(3);
    const emits = emitsOf(r, { t: 'FILL', playerId: 'p1', cellIndex: 0, query: '2' });
    expect(emits).toHaveLength(1);
    expect(emits[0]!.to).toBe('player');
    expect(emits[0]!.ev).toBe('cell:result');
    expect((emits[0]!.data as { ok: boolean }).ok).toBe(true);
  });

  it('rejects naming yourself', () => {
    const r = running(3);
    const e = emitsOf(r, { t: 'FILL', playerId: 'p1', cellIndex: 0, query: '1' });
    expect((e[0]!.data as { reason: string }).reason).toBe('SELF');
  });

  it('rejects reusing a person already on the card', () => {
    let r = running(3);
    r = step(r, { t: 'FILL', playerId: 'p1', cellIndex: 0, query: '2' });
    const e = emitsOf(r, { t: 'FILL', playerId: 'p1', cellIndex: 1, query: '2' });
    expect((e[0]!.data as { reason: string }).reason).toBe('REUSED');
  });

  it('rejects an already-filled cell', () => {
    let r = running(3);
    r = step(r, { t: 'FILL', playerId: 'p1', cellIndex: 0, query: '2' });
    const e = emitsOf(r, { t: 'FILL', playerId: 'p1', cellIndex: 0, query: '3' });
    expect((e[0]!.data as { reason: string }).reason).toBe('CELL_TAKEN');
  });

  it('rejects an unknown person', () => {
    const r = running(3);
    const e = emitsOf(r, { t: 'FILL', playerId: 'p1', cellIndex: 0, query: '없는사람' });
    expect((e[0]!.data as { reason: string }).reason).toBe('NO_SUCH_PERSON');
  });

  it('an ambiguous name returns candidates and changes NO state', () => {
    const r = running(3, ['지은', '민수', '민수']);
    const { state, emits } = apply(r, { t: 'FILL', playerId: 'p1', cellIndex: 0, query: '민수' }, tick());
    expect(state).toBe(r); // literally unchanged — no cell is reserved
    expect(emits[0]!.ev).toBe('cell:candidates');
    const d = emits[0]!.data as { candidates: unknown[] };
    expect(d.candidates).toHaveLength(2);
  });

  it('FILL_PICK commits a disambiguated choice and re-validates', () => {
    let r = running(3, ['지은', '민수', '민수']);
    r = step(r, { t: 'FILL_PICK', playerId: 'p1', cellIndex: 0, targetId: 'p3' });
    expect(r.players.get('p1')!.fills[0]).toBe('p3');
    // stale pick of an already-used person is still rejected
    const e = emitsOf(r, { t: 'FILL_PICK', playerId: 'p1', cellIndex: 1, targetId: 'p3' });
    expect((e[0]!.data as { reason: string }).reason).toBe('REUSED');
  });

  it('clearing frees that person for reuse (req §7.3)', () => {
    let r = running(3);
    r = step(r, { t: 'FILL', playerId: 'p1', cellIndex: 0, query: '2' });
    expect(r.players.get('p1')!.usedPlayerIds.has('p2')).toBe(true);
    r = step(r, { t: 'CLEAR', playerId: 'p1', cellIndex: 0 });
    expect(r.players.get('p1')!.usedPlayerIds.has('p2')).toBe(false);
    r = step(r, { t: 'FILL', playerId: 'p1', cellIndex: 5, query: '2' });
    expect(r.players.get('p1')!.fills[5]).toBe('p2');
  });

  it('server stamps filledAt; client clocks are never used', () => {
    let r = running(3);
    r = step(r, { t: 'FILL', playerId: 'p1', cellIndex: 0, query: '2' }, 555);
    expect(r.players.get('p1')!.filledAt[0]).toBe(555);
  });
});
