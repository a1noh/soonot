import { describe, expect, it } from 'vitest';
import { rank, tiedGroups } from '../ranking';
import { stonesModule } from '../../module';
import { act, play, started, T0 } from './helpers';

const places = (r: Parameters<typeof rank>[0]) => rank(r).map((x) => [x.teamName, x.stoneIds.length, x.rank]);

describe('ranking', () => {
  it('most stones first; level teams share a place — never broken by time', () => {
    let r = started({ teams: 3 });
    r = play(r, 's1', ['t2'], T0 + 1);
    r = play(r, 's2', ['t3'], T0 + 2);
    r = play(r, 's3', ['t2', 't1'], T0 + 3);
    expect(places(r)).toEqual([
      ['조2', 2, 1],
      ['조1', 1, 2], // setup order inside a shared place
      ['조3', 1, 2],
    ]);
    expect(tiedGroups(r)).toEqual([['t1', 't3']]);
  });

  it('a three-way tie at the top shares 1st, and the next team is 4th', () => {
    let r = started({ teams: 4 });
    r = play(r, 's1', ['t1', 't2', 't4']);
    expect(places(r)).toEqual([
      ['조1', 1, 1],
      ['조2', 1, 1],
      ['조4', 1, 1],
      ['조3', 0, 4],
    ]);
    expect(tiedGroups(r)).toEqual([['t1', 't2', 't4']]);
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
