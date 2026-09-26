import { describe, expect, it } from 'vitest';
import { HOME } from '../../shared/constants';
import { malOf, place, play, started, step, T0 } from './helpers';

describe('movement (req §8.1, §8.3)', () => {
  it('sends an overshoot home (counts a lap) and respawns the 말', () => {
    const r = play(place(started({ malPerTeam: 1 }), { t1m1: 19 }), '모');
    expect(r.teams[0]!.finishes).toBe(1); // one 완주
    expect(malOf(r, 't1m1').progress).toBe(0); // 말 respawned in 대기 (endless laps)
  });

  it('brings a waiting 말 out onto the board', () => {
    const r = play(started({ malPerTeam: 1 }), '걸');
    expect(malOf(r, 't1m1').progress).toBe(3);
  });

  it('lets two 말 of one team share a station, moving independently', () => {
    let r = place(started(), { t1m1: 3 });
    r = play(r, '걸', 't1m2');                       // t1m2: 0 → 3, same station
    expect(malOf(r, 't1m1').progress).toBe(3);
    expect(malOf(r, 't1m2').progress).toBe(3);
    expect(r.history[0]!.captures).toEqual([]);      // no self-capture

    r = { ...r, turnIndex: 0, throwQueue: 1 };
    r = play(r, '도', 't1m1');                        // only one moves
    expect(malOf(r, 't1m1').progress).toBe(4);
    expect(malOf(r, 't1m2').progress).toBe(3);
  });

  it('grants no bonus throw for finishing a 말 (도 passes the turn)', () => {
    const r = play(place(started({ malPerTeam: 1 }), { t1m1: 19 }), '도');
    expect(r.teams[0]!.finishes).toBe(1);            // 완주 counted
    expect(r.turnIndex).toBe(1);                      // turn passed, no bonus
  });

  it('rejects a 말 that was never offered as a candidate', () => {
    const { state } = step(started(), { t: 'THROW', roll: '개' }, T0);
    expect(() => step(state, { t: 'MOVE', malId: 't2m1' }, T0)).toThrow(
      expect.objectContaining({ code: 'ILLEGAL_MOVE' }),
    );
  });

  it('rejects a move when no throw is pending', () => {
    expect(() => step(started(), { t: 'MOVE', malId: 't1m1' }, T0)).toThrow(
      expect.objectContaining({ code: 'NO_PENDING_THROW' }),
    );
  });

  it('records from, to and the roll on the event', () => {
    const r = play(place(started({ malPerTeam: 1 }), { t1m1: 4 }), '걸');
    const ev = r.history[0]!;
    expect(ev).toMatchObject({ seq: 1, teamId: 't1', malId: 't1m1', from: 4, to: 7, roll: '걸' });
  });
});
