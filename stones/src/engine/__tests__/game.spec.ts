import { describe, expect, it } from 'vitest';
import { apply, newRoom } from '../apply';
import { EngineError } from '../actions';
import { project } from '../../project';
import { act, play, setUp, started, step, T0 } from './helpers';

const err = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof EngineError ? e.code : String(e);
  }
  return 'no error';
};

const games = [{ name: '찬양 퀴즈', players: '모두', instructions: 'i' }];
const stones = [{ name: '스페이스 스톤' }];
const two = [
  { name: 'a', playing: true },
  { name: 'b', playing: true },
];

describe('setup', () => {
  const blank = () => newRoom({ id: 'r', eventId: 'e', createdAt: T0 });

  it('needs two playing teams, unique names, a stone and a game', () => {
    expect(err(() => apply(blank(), { t: 'SETUP', teams: [two[0]!, { name: 'b', playing: false }], stones, games }, T0))).toBe('TOO_FEW_TEAMS');
    expect(err(() => apply(blank(), { t: 'SETUP', teams: [two[0]!, two[0]!], stones, games }, T0))).toBe('DUPLICATE_TEAM_NAME');
    expect(err(() => apply(blank(), { t: 'SETUP', teams: two, stones: [], games }, T0))).toBe('NO_STONES');
    expect(err(() => apply(blank(), { t: 'SETUP', teams: two, stones, games: [] }, T0))).toBe('NO_GAMES');
  });

  it('keeps teams that sit out and the game order as given', () => {
    const r = setUp({ teams: 4, sitOut: [2] });
    expect(r.state).toBe('LOBBY');
    expect(r.teams.map((t) => t.playing)).toEqual([true, false, true, true]);
    expect(r.games.map((g) => g.name)).toEqual(['퀸젯 발사', '헤임달의 귀', '자비스의 선택', '닥터 스트레인지의 눈', '로키의 속임수', '어벤져스 어셈블']);
    expect(r.games.map((g) => g.instructions.split('!')[0])).toEqual(['코끼리 종이비행기', '찬양 퀴즈', '사지선다', '이미지 퀴즈', '넌센스 퀴즈', '일심동체']);
    expect(r.stones.map((s) => s.name)).toEqual(['예배 스톤', '섬김 스톤', '선교 스톤', '양육 스톤', '사역 스톤', '교제 스톤']);
    expect(r.games.map((g) => g.players)).toEqual(['2명', '모두', '모두', '모두', '모두', '3명']);
  });
});

describe('the fixed game order', () => {
  it('whatever stone is tapped, pick N opens game N', () => {
    let r = started();
    r = act(r, { t: 'PICK', stoneId: 's5' });
    expect(r.pending).toMatchObject({ stoneId: 's5', gameId: 'g1' });
    r = act(r, { t: 'RESOLVE', winners: ['t2'] });
    r = act(r, { t: 'PICK', stoneId: 's1' });
    expect(r.pending).toMatchObject({ stoneId: 's1', gameId: 'g2' });
  });

  it('cancelling a pick does not use up a game', () => {
    let r = act(started(), { t: 'PICK', stoneId: 's3' });
    r = act(r, { t: 'CANCEL_PICK' });
    r = act(r, { t: 'PICK', stoneId: 's4' });
    expect(r.pending?.gameId).toBe('g1');
  });

  it('a stone is played for once; nothing can be picked after the last game', () => {
    let r = play(started({ games: 2 }), 's1', []);
    expect(err(() => step(r, { t: 'PICK', stoneId: 's1' }))).toBe('STONE_TAKEN');
    r = play(r, 's2', ['t1']);
    expect(err(() => step(r, { t: 'PICK', stoneId: 's3' }))).toBe('NO_GAME_LEFT');
  });

  it('the projector never sees a game before it is opened', () => {
    const r = started();
    const board = project(r, { kind: 'spectator' });
    expect(JSON.stringify(board)).not.toContain('퀸젯');
    expect(board.games).toBeUndefined();
    const master = project(r, { kind: 'master' });
    expect(master.nextGame?.name).toBe('퀸젯 발사');
    const picked = project(act(r, { t: 'PICK', stoneId: 's2' }), { kind: 'spectator' });
    expect(picked.pending).toMatchObject({ number: 1, game: { name: '퀸젯 발사', players: '2명' } });
    expect(JSON.stringify(picked)).not.toContain('헤임달');
  });
});

describe('winners', () => {
  it('every winner gets the stone; zero winners is allowed', () => {
    let r = started();
    r = play(r, 's1', ['t1', 't3']);
    r = play(r, 's2', []);
    expect(r.claims.map((c) => c.winners)).toEqual([['t1', 't3'], []]);
    expect(project(r, { kind: 'spectator' }).teams.map((t) => t.stoneIds)).toEqual([['s1'], [], ['s1']]);
  });

  it('a team that sits out can still win (it played the game)', () => {
    const r = play(started({ teams: 3, sitOut: [3] }), 's1', ['t3']);
    expect(r.claims[0]!.winners).toEqual(['t3']);
  });

  it('rejects an unknown team', () => {
    const r = act(started(), { t: 'PICK', stoneId: 's1' });
    expect(err(() => step(r, { t: 'RESOLVE', winners: ['nope'] }))).toBe('UNKNOWN_TEAM');
  });
});

describe('choosing rotates', () => {
  it('in order, skipping teams that sit out, counting rounds', () => {
    let r = started({ teams: 3, sitOut: [2] });
    expect([r.turnTeamId, r.round]).toEqual(['t1', 1]);
    r = play(r, 's1', []);
    expect([r.turnTeamId, r.round]).toEqual(['t3', 1]);
    r = act(r, { t: 'SKIP' });
    expect([r.turnTeamId, r.round]).toEqual(['t1', 2]);
  });

  it('a team taken out on its own turn passes the turn on', () => {
    let r = act(started(), { t: 'SET_PLAYING', teamId: 't1', playing: false });
    expect(r.turnTeamId).toBe('t2');
    expect(err(() => step(act(r, { t: 'PICK', stoneId: 's1' }), { t: 'SET_PLAYING', teamId: 't2', playing: false }))).toBe('PICK_PENDING');
  });

  it('keeps two teams in the lobby and one while running', () => {
    expect(err(() => step(setUp({ teams: 2 }), { t: 'SET_PLAYING', teamId: 't1', playing: false }))).toBe('LAST_TEAM');
    const r = act(started({ teams: 2 }), { t: 'SET_PLAYING', teamId: 't2', playing: false });
    expect(err(() => step(r, { t: 'SET_PLAYING', teamId: 't1', playing: false }))).toBe('LAST_TEAM');
  });
});

describe('undo', () => {
  it('takes back a whole stone — winners, game slot and chooser', () => {
    let r = play(started(), 's4', ['t2', 't3']);
    r = act(r, { t: 'UNDO' });
    expect([r.claims.length, r.turnTeamId]).toEqual([0, 't1']);
    r = act(r, { t: 'PICK', stoneId: 's4' });
    expect(r.pending?.gameId).toBe('g1'); // the game comes back too
  });

  it('undoes a skip and brings back a team taken out since', () => {
    let r = act(started(), { t: 'SKIP' });
    r = act(r, { t: 'SET_PLAYING', teamId: 't1', playing: false });
    r = act(r, { t: 'UNDO' });
    expect([r.turnTeamId, r.teams[0]!.playing]).toEqual(['t1', true]);
    expect(err(() => step(r, { t: 'UNDO' }))).toBe('NOTHING_TO_UNDO');
  });
});

describe('end and reveal', () => {
  it('end drops a pending pick, resume returns, reveal counts up', () => {
    let r = act(act(started(), { t: 'PICK', stoneId: 's1' }), { t: 'END' }, T0 + 5);
    expect([r.state, r.pending]).toEqual(['ENDED', null]);
    r = act(r, { t: 'RESUME_FROM_ENDED' });
    r = act(act(r, { t: 'END' }), { t: 'REVEAL', step: 0 });
    for (const s of [1, 2, 3, 4]) r = act(r, { t: 'REVEAL', step: s });
    expect([r.state, r.revealStep]).toEqual(['REVEAL', 4]);
    expect(err(() => step(r, { t: 'REVEAL', step: 4 }))).toBe('BAD_REVEAL_STEP');
  });

  it('rejects play outside RUNNING', () => {
    expect(err(() => step(setUp(), { t: 'PICK', stoneId: 's1' }))).toBe('ILLEGAL_ACTION');
  });
});
