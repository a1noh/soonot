import { describe, expect, it } from 'vitest';
import { rank } from '../ranking';
import { stonesModule } from '../../module';
import { act, play, started, T0 } from './helpers';

describe('ranking', () => {
  it('most stones first; a tie goes to whoever got there first', () => {
    let r = started({ teams: 3 });
    r = play(r, 's1', ['t2'], T0 + 1);
    r = play(r, 's2', ['t3'], T0 + 2);
    r = play(r, 's3', ['t2', 't1'], T0 + 3);
    expect(rank(r).map((x) => [x.teamName, x.stoneIds.length, x.rank])).toEqual([
      ['조2', 2, 1],
      ['조3', 1, 2],
      ['조1', 1, 3],
    ]);
  });

  it('joint winners of the same stone share a place', () => {
    const r = play(started({ teams: 3 }), 's1', ['t1', 't3'], T0 + 1);
    expect(rank(r).map((x) => [x.teamId, x.rank])).toEqual([
      ['t1', 1],
      ['t3', 1],
      ['t2', 3],
    ]);
  });

  it('leaves out a team that sits out and won nothing', () => {
    expect(rank(started({ teams: 3, sitOut: [3] })).map((x) => x.teamId)).toEqual(['t1', 't2']);
  });

  it('feeds the podium with medals and a detail line', () => {
    const r = act(play(started({ teams: 2 }), 's1', ['t2']), { t: 'END' });
    expect(stonesModule.rank(r)).toEqual([
      { id: 't2', label: '조2', detail: '스톤 1개', medal: 1 },
      { id: 't1', label: '조1', detail: '스톤 0개', medal: 2 },
    ]);
  });
});
