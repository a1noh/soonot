import { describe, expect, it } from 'vitest';
import { EngineError } from '../actions';
import { rank, tiedGroups } from '../ranking';
import { project } from '../../project';
import { DEFAULT_TIEBREAK } from '../../shared/constants';
import { act, play, started, step } from './helpers';

const err = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof EngineError ? e.code : String(e);
  }
  return 'no error';
};

/** 4 teams: t1 and t3 tied on 2 (1st), t2 and t4 tied on 1 (3rd). Ended. */
function endedWithTies() {
  let r = started({ teams: 4 });
  r = play(r, 's1', ['t1', 't3']);
  r = play(r, 's2', ['t1', 't3']);
  r = play(r, 's3', ['t2', 't4']);
  return act(r, { t: 'END' });
}

describe('동점 결정전 (엔드게임 · 컵 멀리 놓기)', () => {
  it('defaults to 엔드게임 with the whole team', () => {
    const r = endedWithTies();
    expect(r.tiebreak).toMatchObject({ name: '엔드게임', players: '모두' });
    expect(r.tiebreak.instructions).toBe(DEFAULT_TIEBREAK.instructions);
    expect(r.tiebreak.instructions.startsWith('컵 멀리 놓기!')).toBe(true);
  });

  it('lists tied groups best place first; the master sees them, the projector does not', () => {
    const r = endedWithTies();
    expect(tiedGroups(r)).toEqual([
      ['t1', 't3'],
      ['t2', 't4'],
    ]);
    expect(project(r, { kind: 'master' }).tiedGroups).toEqual(tiedGroups(r));
    expect(project(r, { kind: 'spectator' }).tiedGroups).toBeUndefined();
  });

  it('start → resolve orders the group; the rest stays tied', () => {
    let r = endedWithTies();
    r = act(r, { t: 'TIEBREAK_START', teamIds: ['t3', 't1'] });
    expect(r.activeTiebreak).toEqual(['t1', 't3']); // setup order
    expect(project(r, { kind: 'spectator' }).activeTiebreak).toMatchObject({
      teams: [{ name: '조1' }, { name: '조3' }],
      game: { name: '엔드게임' },
    });
    r = act(r, { t: 'TIEBREAK_RESOLVE', order: ['t3', 't1'] });
    expect(rank(r).map((s) => [s.teamId, s.rank])).toEqual([
      ['t3', 1],
      ['t1', 2],
      ['t2', 3],
      ['t4', 3],
    ]);
    expect(tiedGroups(r)).toEqual([['t2', 't4']]);
  });

  it('only a whole tied group can play it', () => {
    const r = endedWithTies();
    expect(err(() => step(r, { t: 'TIEBREAK_START', teamIds: ['t1', 't2'] }))).toBe('NOT_TIED');
    expect(err(() => step(r, { t: 'TIEBREAK_START', teamIds: ['t1'] }))).toBe('NOT_TIED');
    expect(err(() => step(r, { t: 'TIEBREAK_START', teamIds: ['t1', 't3', 't1'] }))).toBe('NOT_TIED');
  });

  it('the result must name exactly the teams that played', () => {
    const r = act(endedWithTies(), { t: 'TIEBREAK_START', teamIds: ['t1', 't3'] });
    expect(err(() => step(r, { t: 'TIEBREAK_RESOLVE', order: ['t1'] }))).toBe('BAD_ORDER');
    expect(err(() => step(r, { t: 'TIEBREAK_RESOLVE', order: ['t1', 't2'] }))).toBe('BAD_ORDER');
    expect(err(() => step(r, { t: 'TIEBREAK_RESOLVE', order: ['t1', 't1'] }))).toBe('BAD_ORDER');
    expect(err(() => step(r, { t: 'TIEBREAK_START', teamIds: ['t2', 't4'] }))).toBe('TIEBREAK_PENDING');
  });

  it('cancel closes it with no result', () => {
    let r = act(endedWithTies(), { t: 'TIEBREAK_START', teamIds: ['t2', 't4'] });
    r = act(r, { t: 'TIEBREAK_CANCEL' });
    expect([r.activeTiebreak, r.tiebreaks]).toEqual([null, []]);
    expect(err(() => step(r, { t: 'TIEBREAK_CANCEL' }))).toBe('NO_TIEBREAK');
  });

  it('the reveal waits for an open 결정전', () => {
    const r = act(endedWithTies(), { t: 'TIEBREAK_START', teamIds: ['t1', 't3'] });
    expect(err(() => step(r, { t: 'REVEAL', step: 0 }))).toBe('TIEBREAK_PENDING');
    expect(act(act(r, { t: 'TIEBREAK_CANCEL' }), { t: 'REVEAL', step: 0 }).state).toBe('REVEAL');
  });

  it('undo after 게임 종료 takes back the last 결정전', () => {
    let r = act(endedWithTies(), { t: 'TIEBREAK_START', teamIds: ['t1', 't3'] });
    r = act(r, { t: 'TIEBREAK_RESOLVE', order: ['t1', 't3'] });
    r = act(r, { t: 'TIEBREAK_START', teamIds: ['t2', 't4'] });
    expect(err(() => step(r, { t: 'UNDO' }))).toBe('TIEBREAK_PENDING');
    r = act(act(r, { t: 'TIEBREAK_RESOLVE', order: ['t4', 't2'] }), { t: 'UNDO' });
    expect(r.tiebreaks).toEqual([['t1', 't3']]);
    r = act(r, { t: 'UNDO' });
    expect(err(() => step(r, { t: 'UNDO' }))).toBe('NOTHING_TO_UNDO');
  });

  it('resuming play drops 결정전 results (stones may still change)', () => {
    let r = act(endedWithTies(), { t: 'TIEBREAK_START', teamIds: ['t1', 't3'] });
    r = act(r, { t: 'TIEBREAK_RESOLVE', order: ['t1', 't3'] });
    r = act(r, { t: 'RESUME_FROM_ENDED' });
    expect(r.tiebreaks).toEqual([]);
  });

  it('only after 게임 종료', () => {
    expect(err(() => step(started(), { t: 'TIEBREAK_START', teamIds: ['t1', 't2'] }))).toBe('ILLEGAL_ACTION');
  });
});
