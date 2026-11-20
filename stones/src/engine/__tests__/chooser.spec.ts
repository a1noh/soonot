import { describe, expect, it } from 'vitest';
import { EngineError } from '../actions';
import { project } from '../../project';
import { act, play, started, step } from './helpers';

const err = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof EngineError ? e.code : String(e);
  }
  return 'no error';
};

/**
 * The MC script decides who taps the stone: the 빙고 1등 first, then the team
 * that just won (once, the lowest-scoring team). The master sets it by hand.
 */
describe('who chooses the stone', () => {
  it('the 빙고 1등 can choose the first stone as a guest; the pick and claim carry their name', () => {
    let r = act(started({ teams: 3 }), { t: 'SET_CHOOSER', guest: ' 빙고 1등 민지 ' });
    expect([r.turnTeamId, r.turnGuest]).toEqual([null, '빙고 1등 민지']);
    const shown = project(r, { kind: 'spectator' });
    expect(shown).toMatchObject({ turnTeamId: null, turnTeamName: '빙고 1등 민지', turnIsGuest: true });

    r = act(r, { t: 'PICK', stoneId: 's2' });
    expect(project(r, { kind: 'spectator' }).pending).toMatchObject({ chooserId: null, chooserName: '빙고 1등 민지' });
    r = act(r, { t: 'RESOLVE', winners: ['t3'] });
    expect(r.claims[0]).toMatchObject({ chooserId: null, chooserName: '빙고 1등 민지' });
  });

  it('after a win by one team, that team chooses next', () => {
    const r = play(started({ teams: 4 }), 's1', ['t3']);
    expect([r.turnTeamId, r.turnGuest]).toEqual(['t3', null]);
  });

  it('after a shared win or no winner, the choice moves on in order', () => {
    let r = started({ teams: 4 }); // t1 chooses
    r = play(r, 's1', ['t2', 't4']);
    expect(r.turnTeamId).toBe('t2');
    r = play(r, 's2', []);
    expect(r.turnTeamId).toBe('t3');
  });

  it('a guest who chose hands over to the first team in order when nobody wins', () => {
    let r = act(started({ teams: 3 }), { t: 'SET_CHOOSER', guest: '빙고 1등 민지' });
    r = play(r, 's1', []);
    expect([r.turnTeamId, r.turnGuest]).toEqual(['t1', null]);
  });

  it('the master can give the choice to any playing team (e.g. the lowest-scoring one)', () => {
    let r = play(started({ teams: 4 }), 's1', ['t1']);
    r = act(r, { t: 'SET_CHOOSER', teamId: 't4' });
    expect(r.turnTeamId).toBe('t4');
  });

  it('rejects a pick in progress, an unknown or sitting-out team, and an empty name', () => {
    const r = started({ teams: 3, sitOut: [3] });
    expect(err(() => step(act(r, { t: 'PICK', stoneId: 's1' }), { t: 'SET_CHOOSER', teamId: 't2' }))).toBe('PICK_PENDING');
    expect(err(() => step(r, { t: 'SET_CHOOSER', teamId: 't9' }))).toBe('UNKNOWN_TEAM');
    expect(err(() => step(r, { t: 'SET_CHOOSER', teamId: 't3' }))).toBe('BAD_CHOOSER');
    expect(err(() => step(r, { t: 'SET_CHOOSER', guest: '   ' }))).toBe('BAD_CHOOSER');
    expect(err(() => step(r, { t: 'SET_CHOOSER' }))).toBe('BAD_CHOOSER');
    expect(err(() => step(r, { t: 'SET_CHOOSER', guest: 'x'.repeat(41) }))).toBe('BAD_CHOOSER');
  });

  it('undo puts the earlier chooser back — a guest included', () => {
    let r = act(started({ teams: 3 }), { t: 'SET_CHOOSER', guest: '빙고 1등 민지' });
    r = play(r, 's1', ['t2']); // t2 now chooses
    r = act(r, { t: 'SET_CHOOSER', teamId: 't3' });
    r = act(r, { t: 'UNDO' }); // the chooser change
    expect(r.turnTeamId).toBe('t2');
    r = act(r, { t: 'UNDO' }); // the claim: back to the guest, stone free again
    expect([r.turnTeamId, r.turnGuest, r.claims.length]).toEqual([null, '빙고 1등 민지', 0]);
  });

  it('flags the last stone, when there is nothing left to choose between', () => {
    let r = started({ teams: 2, games: 2 });
    expect(project(r, { kind: 'spectator' }).lastStone).toBe(false);
    r = play(r, 's1', ['t1']);
    expect(project(r, { kind: 'spectator' }).lastStone).toBe(true);
  });
});
