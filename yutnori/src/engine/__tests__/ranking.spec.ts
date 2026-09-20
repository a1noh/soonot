import { describe, expect, it } from 'vitest';
import { rank } from '../ranking';
import { place, started, T0 } from './helpers';

const order = (r: ReturnType<typeof rank>) => r.map((s) => s.teamId);

describe('ranking (req §11)', () => {
  it('puts finishers above everyone else, earliest finish first', () => {
    const r = place(started({ teams: 3, malPerTeam: 1 }), { t1m1: 20, t2m1: 19, t3m1: 20 });
    r.teams[0]!.finishedAt = T0 + 5000;
    r.teams[2]!.finishedAt = T0 + 1000;
    expect(order(rank(r))).toEqual(['t3', 't1', 't2']);
  });

  it('ranks unfinished teams by 말 home, descending', () => {
    const r = place(started({ teams: 2, malPerTeam: 2 }), { t1m1: 20, t1m2: 1, t2m1: 15, t2m2: 5 });
    expect(order(rank(r))).toEqual(['t1', 't2']);
  });

  it('prefers one 말 all the way home over the same distance split across two', () => {
    // Both total 20. 조1 has committed a 말; 조2 has not.
    const r = place(started({ teams: 2, malPerTeam: 2 }), { t1m1: 20, t1m2: 0, t2m1: 10, t2m2: 10 });
    const standings = rank(r);
    expect(standings[0]!.teamId).toBe('t1');
    expect(standings[0]!.totalProgress).toBe(standings[1]!.totalProgress);
    expect(standings[0]!.malHome).toBe(1);
  });

  it('falls back to total progress when 말 home is level', () => {
    const r = place(started({ teams: 2, malPerTeam: 2 }), { t1m1: 4, t1m2: 3, t2m1: 9, t2m2: 1 });
    expect(order(rank(r))).toEqual(['t2', 't1']);
  });

  it('breaks a total-progress tie in favour of whoever got there earlier', () => {
    const r = place(started({ teams: 2, malPerTeam: 2 }), { t1m1: 5, t1m2: 5, t2m1: 5, t2m2: 5 });
    r.teams[0]!.lastProgressAt = T0 + 9000;
    r.teams[1]!.lastProgressAt = T0 + 2000;
    expect(order(rank(r))).toEqual(['t2', 't1']);
  });

  it('falls back to creation order when nobody moved at all', () => {
    const r = started({ teams: 3 });
    const standings = rank(r);
    expect(order(standings)).toEqual(['t1', 't2', 't3']);
    expect(standings.every((s) => s.totalProgress === 0)).toBe(true);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  it('reports 말 home and total progress per team', () => {
    const r = place(started({ teams: 2, malPerTeam: 2 }), { t1m1: 20, t1m2: 7 });
    const s = rank(r).find((x) => x.teamId === 't1')!;
    expect(s.malHome).toBe(1);
    expect(s.totalProgress).toBe(27);
  });
});
