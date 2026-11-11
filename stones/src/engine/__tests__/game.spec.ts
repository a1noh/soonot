import { describe, expect, it } from 'vitest';
import { apply, newRoom } from '../apply';
import { EngineError } from '../actions';
import { act, play, setUp, started, step, T0 } from './helpers';

const err = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof EngineError ? e.code : String(e);
  }
  return 'no error';
};

describe('setup', () => {
  const blank = () => newRoom({ id: 'r', eventId: 'e', createdAt: T0 });
  const stones = [{ name: '빨강', mission: 'm' }];

  it('needs two playing teams', () => {
    expect(err(() => apply(blank(), { t: 'SETUP', teams: [{ name: 'a', playing: true }, { name: 'b', playing: false }], stones }, T0))).toBe('TOO_FEW_TEAMS');
  });
  it('rejects duplicate or empty names', () => {
    expect(err(() => apply(blank(), { t: 'SETUP', teams: [{ name: 'a', playing: true }, { name: 'a', playing: true }], stones }, T0))).toBe('DUPLICATE_TEAM_NAME');
    expect(err(() => apply(blank(), { t: 'SETUP', teams: [{ name: 'a', playing: true }, { name: ' ', playing: true }], stones }, T0))).toBe('DUPLICATE_TEAM_NAME');
  });
  it('needs at least one stone', () => {
    expect(err(() => apply(blank(), { t: 'SETUP', teams: [{ name: 'a', playing: true }, { name: 'b', playing: true }], stones: [] }, T0))).toBe('NO_STONES');
  });
  it('keeps teams that sit out, assigns colours, lands in LOBBY', () => {
    const r = setUp({ teams: 4, sitOut: [2] });
    expect(r.state).toBe('LOBBY');
    expect(r.teams.map((t) => t.playing)).toEqual([true, false, true, true]);
    expect(r.stones).toHaveLength(6);
    expect(new Set(r.stones.map((s) => s.color)).size).toBe(6);
  });
  it('can be redone from LOBBY', () => {
    const r = act(setUp(), { t: 'SETUP', teams: [{ name: 'x', playing: true }, { name: 'y', playing: true }], stones });
    expect(r.teams.map((t) => t.name)).toEqual(['x', 'y']);
  });
});

describe('turns', () => {
  it('starts with the first playing team, skipping teams that sit out', () => {
    expect(started({ teams: 3, sitOut: [1] }).turnTeamId).toBe('t2');
  });

  it('rotates in order and counts rounds', () => {
    let r = started({ teams: 3, sitOut: [2] });
    expect([r.turnTeamId, r.round]).toEqual(['t1', 1]);
    r = play(r, 's1', false);
    expect([r.turnTeamId, r.round]).toEqual(['t3', 1]);
    r = act(r, { t: 'SKIP' });
    expect([r.turnTeamId, r.round]).toEqual(['t1', 2]);
  });

  it('success gives the stone; failure does not', () => {
    let r = started();
    r = play(r, 's1', true, T0 + 1);
    r = play(r, 's1', false, T0 + 2);
    expect(r.wins).toEqual([{ teamId: 't1', stoneId: 's1', at: T0 + 1 }]);
    expect(r.lastResult).toMatchObject({ teamId: 't2', stoneId: 's1', success: false });
  });

  it('a stone stays open to other teams but a team cannot win it twice', () => {
    let r = started({ teams: 2 });
    r = play(r, 's1', true);
    r = play(r, 's1', true); // t2 wins the same stone
    expect(r.wins.map((w) => w.teamId)).toEqual(['t1', 't2']);
    expect(err(() => step(r, { t: 'PICK', stoneId: 's1' }))).toBe('ALREADY_HELD');
  });

  it('cannot pick twice, resolve without a pick, or skip mid-pick', () => {
    const r = started();
    expect(err(() => step(r, { t: 'RESOLVE', success: true }))).toBe('NO_PICK');
    const picked = act(r, { t: 'PICK', stoneId: 's2' });
    expect(err(() => step(picked, { t: 'PICK', stoneId: 's3' }))).toBe('PICK_PENDING');
    expect(err(() => step(picked, { t: 'SKIP' }))).toBe('PICK_PENDING');
    expect(act(picked, { t: 'CANCEL_PICK' }).pending).toBeNull();
    expect(err(() => step(r, { t: 'PICK', stoneId: 'nope' }))).toBe('UNKNOWN_STONE');
  });
});

describe('who plays', () => {
  it('a team taken out on its own turn passes the turn on', () => {
    let r = started({ teams: 3 });
    r = act(r, { t: 'SET_PLAYING', teamId: 't1', playing: false });
    expect(r.turnTeamId).toBe('t2');
    r = play(play(r, 's1', false), 's1', false);
    expect(r.turnTeamId).toBe('t2'); // t1 is skipped
  });

  it('a team added mid-game joins the rotation', () => {
    let r = started({ teams: 3, sitOut: [3] });
    r = act(r, { t: 'SET_PLAYING', teamId: 't3', playing: true });
    r = play(play(r, 's1', false), 's1', false);
    expect(r.turnTeamId).toBe('t3');
  });

  it('keeps two teams in the lobby and one while running', () => {
    const lobby = setUp({ teams: 2 });
    expect(err(() => step(lobby, { t: 'SET_PLAYING', teamId: 't1', playing: false }))).toBe('LAST_TEAM');
    let r = started({ teams: 2 });
    r = act(r, { t: 'SET_PLAYING', teamId: 't2', playing: false });
    expect(err(() => step(r, { t: 'SET_PLAYING', teamId: 't1', playing: false }))).toBe('LAST_TEAM');
  });

  it('cannot remove the team mid-pick', () => {
    const r = act(started(), { t: 'PICK', stoneId: 's1' });
    expect(err(() => step(r, { t: 'SET_PLAYING', teamId: 't1', playing: false }))).toBe('PICK_PENDING');
  });
});

describe('undo', () => {
  it('takes back a win and returns the turn', () => {
    let r = started({ teams: 2 });
    r = play(r, 's1', true);
    r = play(r, 's2', false); // wraps → round 2
    expect(r.round).toBe(2);
    r = act(r, { t: 'UNDO' });
    expect([r.turnTeamId, r.round, r.wins.length]).toEqual(['t2', 1, 1]);
    r = act(r, { t: 'UNDO' });
    expect([r.turnTeamId, r.round, r.wins.length]).toEqual(['t1', 1, 0]);
    expect(err(() => step(r, { t: 'UNDO' }))).toBe('NOTHING_TO_UNDO');
  });

  it('undoes a skip, and brings back a team that was taken out since', () => {
    let r = started({ teams: 3 });
    r = act(r, { t: 'SKIP' });
    r = act(r, { t: 'SET_PLAYING', teamId: 't1', playing: false });
    r = act(r, { t: 'UNDO' });
    expect(r.turnTeamId).toBe('t1');
    expect(r.teams[0]!.playing).toBe(true);
  });
});

describe('end and reveal', () => {
  it('end drops a pending pick, resume returns, reveal counts up', () => {
    let r = act(started(), { t: 'PICK', stoneId: 's1' });
    r = act(r, { t: 'END' }, T0 + 5);
    expect([r.state, r.pending, r.endedAt]).toEqual(['ENDED', null, T0 + 5]);
    r = act(r, { t: 'RESUME_FROM_ENDED' });
    expect(r.state).toBe('RUNNING');
    r = act(act(r, { t: 'END' }), { t: 'REVEAL', step: 0 });
    for (const s of [1, 2, 3, 4]) r = act(r, { t: 'REVEAL', step: s });
    expect([r.state, r.revealStep]).toEqual(['REVEAL', 4]);
    expect(err(() => step(r, { t: 'REVEAL', step: 4 }))).toBe('BAD_REVEAL_STEP');
  });

  it('rejects play actions outside RUNNING', () => {
    expect(err(() => step(setUp(), { t: 'PICK', stoneId: 's1' }))).toBe('ILLEGAL_ACTION');
  });
});
