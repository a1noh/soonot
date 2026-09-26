import { describe, expect, it } from 'vitest';
import { rank } from '../ranking';
import { advancementOf } from '../../shared/board';
import { place, started, T0 } from './helpers';

const order = (r: ReturnType<typeof rank>) => r.map((s) => s.teamId);

describe('ranking (req §11) — by 완주(laps), then progress', () => {
  it('ranks by 완주(laps), descending', () => {
    const r = started({ teams: 3, malPerTeam: 1 });
    r.teams[0]!.finishes = 1;
    r.teams[1]!.finishes = 0;
    r.teams[2]!.finishes = 2;
    expect(order(rank(r))).toEqual(['t3', 't1', 't2']);
  });

  it('more laps beats more on-board progress', () => {
    const r = place(started({ teams: 2, malPerTeam: 2 }), { t1m1: 1, t1m2: 1, t2m1: 19, t2m2: 19 });
    r.teams[0]!.finishes = 1; // 조1: 1 lap but barely on the board
    r.teams[1]!.finishes = 0; // 조2: no laps, but two 말 nearly home
    expect(order(rank(r))).toEqual(['t1', 't2']);
    expect(rank(r)[0]!.malHome).toBe(1); // "집" = laps
  });

  it('falls back to total progress when laps are level', () => {
    const r = place(started({ teams: 2, malPerTeam: 2 }), { t1m1: 4, t1m2: 3, t2m1: 19, t2m2: 1 });
    expect(order(rank(r))).toEqual(['t2', 't1']); // t2 has a 말 nearly home
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

  it('reports laps (malHome) and total progress per team', () => {
    const r = place(started({ teams: 2, malPerTeam: 2 }), { t1m1: 7, t1m2: 3 });
    r.teams[0]!.finishes = 2;
    const s = rank(r).find((x) => x.teamId === 't1')!;
    expect(s.malHome).toBe(2); // laps completed
    expect(s.totalProgress).toBe(advancementOf(7) + advancementOf(3)); // on-board, shortcut-aware
  });
});
