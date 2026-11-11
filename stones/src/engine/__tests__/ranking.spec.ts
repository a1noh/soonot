import { describe, expect, it } from 'vitest';
import { rank } from '../ranking';
import { stonesModule } from '../../module';
import { act, play, started, T0 } from './helpers';

describe('ranking', () => {
  it('most stones first; a tie goes to whoever got there first', () => {
    let r = started({ teams: 3 });
    r = play(r, 's1', false, T0 + 1); // t1
    r = play(r, 's1', true, T0 + 2); // t2 → 1 at +2
    r = play(r, 's1', true, T0 + 3); // t3 → 1 at +3
    r = play(r, 's2', true, T0 + 4); // t1 → 1 at +4
    r = play(r, 's2', true, T0 + 5); // t2 → 2
    const s = rank(r);
    expect(s.map((x) => [x.teamName, x.stoneIds.length, x.rank])).toEqual([
      ['조2', 2, 1],
      ['조3', 1, 2],
      ['조1', 1, 3],
    ]);
  });

  it('teams level on zero share a place and keep setup order', () => {
    const s = rank(started({ teams: 3 }));
    expect(s.map((x) => [x.teamId, x.rank])).toEqual([
      ['t1', 1],
      ['t2', 1],
      ['t3', 1],
    ]);
  });

  it('leaves out teams that never played', () => {
    const r = started({ teams: 3, sitOut: [3] });
    expect(rank(r).map((x) => x.teamId)).toEqual(['t1', 't2']);
  });

  it('feeds the podium with medals and a detail line', () => {
    let r = play(started({ teams: 2 }), 's1', true);
    r = act(r, { t: 'END' });
    expect(stonesModule.rank(r)).toEqual([
      { id: 't1', label: '조1', detail: '스톤 1개', medal: 1 },
      { id: 't2', label: '조2', detail: '스톤 0개', medal: 2 },
    ]);
  });
});
