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

describe('동점 결정전 (타노스의 핑거 스냅 · 인피니티 컵 컬링) — for 1위 only', () => {
  it('defaults to 타노스의 핑거 스냅 with the whole team', () => {
    const r = endedWithTies();
    expect(r.tiebreak).toMatchObject({ name: '타노스의 핑거 스냅', players: '모두' });
    expect(r.tiebreak.instructions).toBe(DEFAULT_TIEBREAK.instructions);
    expect(r.tiebreak.instructions.startsWith('인피니티 컵 컬링!')).toBe(true);
  });

  it('only a tie for 1위 needs a 결정전; other ties share their place', () => {
    const r = endedWithTies();
    expect(tiedGroups(r)).toEqual([['t1', 't3']]);
    expect(rank(r).filter((s) => s.rank === 3).map((s) => s.teamId)).toEqual(['t2', 't4']);
    expect(project(r, { kind: 'master' }).tiedGroups).toEqual(tiedGroups(r));
    expect(project(r, { kind: 'spectator' }).tiedGroups).toBeUndefined();
  });

  it('the projector learns the open 1위 tie (to show the 결정전, not the podium)', () => {
    const r = endedWithTies();
    expect(project(r, { kind: 'spectator' }).firstTie).toMatchObject({
      teams: [{ name: '조1' }, { name: '조3' }],
      game: { name: '타노스의 핑거 스냅' },
    });
    const started1 = act(r, { t: 'TIEBREAK_START', teamIds: ['t1', 't3'] });
    expect(project(started1, { kind: 'spectator' }).firstTie).toBeNull();
    const done = act(started1, { t: 'TIEBREAK_RESOLVE', order: ['t3', 't1'] });
    expect(project(done, { kind: 'spectator' }).firstTie).toBeNull();
  });

  it('start → resolve orders the 1위 group; lower ties stay shared', () => {
    let r = endedWithTies();
    r = act(r, { t: 'TIEBREAK_START', teamIds: ['t3', 't1'] });
    expect(r.activeTiebreak).toEqual(['t1', 't3']); // setup order
    expect(project(r, { kind: 'spectator' }).activeTiebreak).toMatchObject({
      teams: [{ name: '조1' }, { name: '조3' }],
      game: { name: '타노스의 핑거 스냅' },
    });
    r = act(r, { t: 'TIEBREAK_RESOLVE', order: ['t3', 't1'] });
    expect(rank(r).map((s) => [s.teamId, s.rank])).toEqual([
      ['t3', 1],
      ['t1', 2],
      ['t2', 3],
      ['t4', 3],
    ]);
    expect(tiedGroups(r)).toEqual([]);
  });

  it('only the whole 1위 group can play it — not a lower tie', () => {
    const r = endedWithTies();
    expect(err(() => step(r, { t: 'TIEBREAK_START', teamIds: ['t2', 't4'] }))).toBe('NOT_TIED');
    expect(err(() => step(r, { t: 'TIEBREAK_START', teamIds: ['t1', 't2'] }))).toBe('NOT_TIED');
    expect(err(() => step(r, { t: 'TIEBREAK_START', teamIds: ['t1'] }))).toBe('NOT_TIED');
    expect(err(() => step(r, { t: 'TIEBREAK_START', teamIds: ['t1', 't3', 't1'] }))).toBe('NOT_TIED');
  });

  it('the result must name exactly the teams that played', () => {
    const r = act(endedWithTies(), { t: 'TIEBREAK_START', teamIds: ['t1', 't3'] });
    expect(err(() => step(r, { t: 'TIEBREAK_RESOLVE', order: ['t1'] }))).toBe('BAD_ORDER');
    expect(err(() => step(r, { t: 'TIEBREAK_RESOLVE', order: ['t1', 't2'] }))).toBe('BAD_ORDER');
    expect(err(() => step(r, { t: 'TIEBREAK_RESOLVE', order: ['t1', 't1'] }))).toBe('BAD_ORDER');
    expect(err(() => step(r, { t: 'TIEBREAK_START', teamIds: ['t1', 't3'] }))).toBe('TIEBREAK_PENDING');
  });

  it('cancel closes it with no result', () => {
    let r = act(endedWithTies(), { t: 'TIEBREAK_START', teamIds: ['t1', 't3'] });
    r = act(r, { t: 'TIEBREAK_CANCEL' });
    expect([r.activeTiebreak, r.tiebreaks]).toEqual([null, []]);
    expect(err(() => step(r, { t: 'TIEBREAK_CANCEL' }))).toBe('NO_TIEBREAK');
  });

  it('the reveal waits until 1위 is decided — never a tied 1위', () => {
    const ended = endedWithTies();
    expect(err(() => step(ended, { t: 'REVEAL', step: 0 }))).toBe('TIE_FOR_FIRST');
    const open = act(ended, { t: 'TIEBREAK_START', teamIds: ['t1', 't3'] });
    expect(err(() => step(open, { t: 'REVEAL', step: 0 }))).toBe('TIEBREAK_PENDING');
    expect(err(() => step(act(open, { t: 'TIEBREAK_CANCEL' }), { t: 'REVEAL', step: 0 }))).toBe('TIE_FOR_FIRST');
    const decided = act(open, { t: 'TIEBREAK_RESOLVE', order: ['t1', 't3'] });
    expect(act(decided, { t: 'REVEAL', step: 0 }).state).toBe('REVEAL');
  });

  it('a tie below 1위 does not hold the reveal', () => {
    let r = started({ teams: 4 });
    r = play(r, 's1', ['t1']);
    r = play(r, 's2', ['t1']);
    r = play(r, 's3', ['t2', 't4']);
    r = act(r, { t: 'END' });
    expect(tiedGroups(r)).toEqual([]);
    expect(act(r, { t: 'REVEAL', step: 0 }).state).toBe('REVEAL');
  });

  it('undo after 게임 종료 takes back the 결정전', () => {
    let r = act(endedWithTies(), { t: 'TIEBREAK_START', teamIds: ['t1', 't3'] });
    expect(err(() => step(r, { t: 'UNDO' }))).toBe('TIEBREAK_PENDING');
    r = act(act(r, { t: 'TIEBREAK_RESOLVE', order: ['t3', 't1'] }), { t: 'UNDO' });
    expect(r.tiebreaks).toEqual([]);
    expect(tiedGroups(r)).toEqual([['t1', 't3']]);
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

describe('감사 스톤 — the secret 7th stone', () => {
  it('stays hidden without a 1위 tie, appears for the 결정전, and goes to its winner', () => {
    let clear = started({ teams: 3 });
    clear = play(clear, 's1', ['t1']);
    clear = act(clear, { t: 'END' });
    expect(project(clear, { kind: 'spectator' }).secretStone).toBeNull();

    const tied = endedWithTies();
    expect(project(tied, { kind: 'spectator' }).secretStone).toMatchObject({ name: '감사 스톤', teamId: null });
    const decided = act(act(tied, { t: 'TIEBREAK_START', teamIds: ['t1', 't3'] }), { t: 'TIEBREAK_RESOLVE', order: ['t3', 't1'] });
    expect(project(decided, { kind: 'spectator' }).secretStone).toMatchObject({ name: '감사 스톤', teamId: 't3' });
  });
});
