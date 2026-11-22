/**
 * REWIND — the 진행 순서 ◀ 이전: back to the start of round N, so the step on
 * the console and the round the 스톤 game is on always match.
 */
import { describe, expect, it } from 'vitest';
import { EngineError } from '../actions';
import { act, play, started } from './helpers';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof EngineError ? e.code : String(e);
  }
  return 'no error';
};

describe('REWIND (◀ 이전)', () => {
  it('takes back round N and later: stones return, the round-N chooser comes back', () => {
    let r = started({ teams: 3 });
    r = act(r, { t: 'SET_CHOOSER', guest: '빙고 1등 김철수' });
    r = play(r, 's2', ['t2']); // round 1: the guest picks, 조2 wins → 조2 chooses round 2
    r = play(r, 's5', ['t3']); // round 2 → 조3 chooses round 3
    r = act(r, { t: 'PICK', stoneId: 's1' }); // round 3 open

    const back2 = act(r, { t: 'REWIND', round: 2 });
    expect(back2.pending).toBeNull();
    expect(back2.claims.map((c) => c.stoneId)).toEqual(['s2']);
    expect(back2.turnTeamId).toBe('t2'); // who chose round 2

    const back1 = act(r, { t: 'REWIND', round: 1 });
    expect(back1.claims).toEqual([]);
    expect(back1.turnGuest).toBe('빙고 1등 김철수');
  });

  it("keeps an open pick for round N itself, and does nothing when already there", () => {
    let r = started({ teams: 3 });
    r = play(r, 's2', ['t2']);
    r = act(r, { t: 'PICK', stoneId: 's4' }); // round 2 open
    const same = act(r, { t: 'REWIND', round: 2 });
    expect(same.pending?.stoneId).toBe('s4');
    expect(same.claims).toHaveLength(1);
  });

  it('reopens an ended game (before the reveal) and drops 결정전 results', () => {
    let r = started({ teams: 3 });
    r = play(r, 's1', ['t1']);
    r = play(r, 's2', ['t1']);
    r = act(r, { t: 'END' });
    const back = act(r, { t: 'REWIND', round: 2 });
    expect(back.state).toBe('RUNNING');
    expect(back.claims).toHaveLength(1);

    const revealing = act(act(r, { t: 'REVEAL', step: 0 }), { t: 'REVEAL', step: 1 });
    expect(code(() => act(revealing, { t: 'REWIND', round: 1 }))).toBe('ILLEGAL_ACTION');
  });

  it('rejects a round below 1', () => {
    const r = started({ teams: 3 });
    expect(code(() => act(r, { t: 'REWIND', round: 0 }))).toBe('ILLEGAL_ACTION');
  });
});

describe('BACK (◀ 이전 during the reveal)', () => {
  it('steps the podium back a place, then out of the reveal', () => {
    let r = started({ teams: 3 });
    r = play(r, 's1', ['t1']);
    r = act(r, { t: 'END' });
    r = act(r, { t: 'REVEAL', step: 0 });
    for (const st of [1, 2, 3]) r = act(r, { t: 'REVEAL', step: st });
    r = act(r, { t: 'BACK' });
    expect([r.state, r.revealStep]).toEqual(['REVEAL', 2]);
    r = act(r, { t: 'BACK' });
    expect([r.state, r.revealStep]).toEqual(['REVEAL', 1]);
    r = act(r, { t: 'BACK' });
    expect([r.state, r.revealStep]).toEqual(['ENDED', 0]);
  });
});
