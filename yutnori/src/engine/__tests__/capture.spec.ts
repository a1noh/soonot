import { describe, expect, it } from 'vitest';
import { HOME } from '../../shared/constants';
import { emitted, malOf, place, play, started, turn, T0 } from './helpers';

describe('catching — 잡기 (req §8.2)', () => {
  it('sends the opposing 말 back to 대기 and grants an extra throw', () => {
    const r = play(place(started({ malPerTeam: 1 }), { t1m1: 1, t2m1: 3 }), '개');
    expect(malOf(r, 't2m1').progress).toBe(0);
    expect(malOf(r, 't1m1').progress).toBe(3);
    expect(r.turnIndex).toBe(0);            // bonus throw keeps the turn
    expect(r.throwQueue).toBe(1);
  });

  it('grants exactly one bonus no matter how many 말 are caught', () => {
    const r = play(place(started(), { t1m1: 1, t2m1: 3, t2m2: 3 }), '개', 't1m1');
    expect(malOf(r, 't2m1').progress).toBe(0);
    expect(malOf(r, 't2m2').progress).toBe(0);
    expect(r.history[0]!.bonusGranted).toBe(1);   // 개 gives none; the catch gives one
  });

  it('catches a 말 on the same turn it came out', () => {
    const r = play(place(started({ malPerTeam: 1 }), { t1m1: 0, t2m1: 2 }), '개');
    expect(malOf(r, 't2m1').progress).toBe(0);
  });

  it('cannot catch a 말 in 대기 — it is not on a station', () => {
    const r = place(started({ malPerTeam: 1 }), { t1m1: 0, t2m1: 0 });
    const out = turn(r, '개');
    expect(out.state.history[0]!.captures).toEqual([]);
    expect(emitted(out.events, 'capture:announced')).toHaveLength(0);
  });

  it('cannot catch a 말 at 집 — home is safe', () => {
    const r = place(started({ malPerTeam: 1 }), { t1m1: 19, t2m1: HOME });
    const out = turn(r, '도');
    expect(malOf(out.state, 't1m1').progress).toBe(HOME);
    expect(malOf(out.state, 't2m1').progress).toBe(HOME);
    expect(out.state.history[0]!.captures).toEqual([]);
  });

  it('stacks the 윷 bonus and the catch bonus', () => {
    let r = place(started({ malPerTeam: 1 }), { t1m1: 1, t2m1: 5 });
    r = play(r, '윷');                         // 1 → 5, catches, 윷 bonus + catch bonus
    expect(r.history[0]!.bonusGranted).toBe(2);
    expect(r.throwQueue).toBe(2);
    expect(r.turnIndex).toBe(0);
  });

  it('announces the catch naming both teams and the station', () => {
    const { events } = turn(place(started({ malPerTeam: 1 }), { t1m1: 1, t2m1: 3 }), '개');
    expect(emitted(events, 'capture:announced')[0]).toMatchObject({
      byTeam: 't1', victimTeam: 't2', station: 3, count: 1,
    });
  });

  it('records each captured 말 with the station it was sent home from', () => {
    const r = play(place(started({ malPerTeam: 1 }), { t1m1: 1, t2m1: 3 }), '개');
    expect(r.history[0]!.captures).toEqual([{ malId: 't2m1', teamId: 't2', from: 3 }]);
    void T0;
  });
});
