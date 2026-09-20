import { describe, expect, it } from 'vitest';
import { apply, newRoom } from '../apply';
import { rank } from '../ranking';
import { act, started, step, T0 } from './helpers';
import type { Room } from '../../shared/types';

describe('a whole game, start to podium (spec §10, milestone 1)', () => {
  it('plays 2 teams from SETUP to REVEAL without a server or a UI', () => {
    let r: Room = newRoom({ id: 'r1', eventId: 'e1', createdAt: T0 });
    expect(r.state).toBe('SETUP');

    r = act(r, {
      t: 'SETUP',
      teams: [{ name: '청년부 1조', roster: '민수, 지영' }, { name: '청년부 2조' }],
      malPerTeam: 1,
      timeLimitMin: 20,
    });
    expect(r.state).toBe('LOBBY');

    r = act(r, { t: 'START' });
    expect(r.state).toBe('RUNNING');

    // 모 is 5 steps and grants a bonus, so each team runs the loop in four throws.
    let now = T0;
    while (r.state === 'RUNNING') {
      now += 1000;
      const thrown = apply(r, { t: 'THROW', roll: '모' }, now);
      r = thrown.state;
      if (r.pendingThrow) r = apply(r, { t: 'MOVE', malId: r.pendingThrow.candidates[0]!.malId }, now).state;
    }

    expect(r.state).toBe('ENDED');
    expect(r.endReason).toBe('allFinished');
    expect(r.history).toHaveLength(8);
    expect(r.teams.every((t) => t.finishedAt !== null)).toBe(true);

    const standings = rank(r);
    expect(standings.map((s) => s.teamName)).toEqual(['청년부 1조', '청년부 2조']);
    expect(standings[0]!.finishedAt).toBeLessThan(standings[1]!.finishedAt!);

    // 3rd → 2nd → 1st → full board (req §11). Two teams, so the podium is short.
    r = act(r, { t: 'REVEAL', step: 0 }, now);
    expect(r.state).toBe('REVEAL');
    for (const stepNo of [1, 2, 3, 4]) {
      r = act(r, { t: 'REVEAL', step: stepNo }, now);
      expect(r.revealStep).toBe(stepNo);
    }
  });
});

describe('setup guards (req §4, §17)', () => {
  const blank = () => newRoom({ id: 'r1', eventId: 'e1', createdAt: T0 });

  it('refuses a single team', () => {
    expect(() => step(blank(), { t: 'SETUP', teams: [{ name: '조1' }], malPerTeam: 2, timeLimitMin: 20 }, T0))
      .toThrow(expect.objectContaining({ code: 'TOO_FEW_TEAMS' }));
  });

  it('refuses duplicate team names', () => {
    expect(() => step(blank(), { t: 'SETUP', teams: [{ name: '조1' }, { name: '조1' }], malPerTeam: 2, timeLimitMin: 20 }, T0))
      .toThrow(expect.objectContaining({ code: 'DUPLICATE_TEAM_NAME' }));
  });

  it('treats names differing only by whitespace as duplicates', () => {
    expect(() => step(blank(), { t: 'SETUP', teams: [{ name: '조1' }, { name: ' 조1 ' }], malPerTeam: 2, timeLimitMin: 20 }, T0))
      .toThrow(expect.objectContaining({ code: 'DUPLICATE_TEAM_NAME' }));
  });

  it('refuses a 말 count outside 1–2 and a sub-minute limit', () => {
    expect(() => step(blank(), { t: 'SETUP', teams: [{ name: 'a' }, { name: 'b' }], malPerTeam: 3 as 1 | 2, timeLimitMin: 20 }, T0))
      .toThrow(expect.objectContaining({ code: 'BAD_MAL_COUNT' }));
    expect(() => step(blank(), { t: 'SETUP', teams: [{ name: 'a' }, { name: 'b' }], malPerTeam: 2, timeLimitMin: 0 }, T0))
      .toThrow(expect.objectContaining({ code: 'BAD_TIME_LIMIT' }));
  });

  it('refuses to add a team once the game has started', () => {
    expect(() => step(started(), { t: 'SETUP', teams: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], malPerTeam: 2, timeLimitMin: 20 }, T0))
      .toThrow(expect.objectContaining({ code: 'ILLEGAL_ACTION' }));
  });

  it('refuses a throw before the game starts', () => {
    const lobby = act(blank(), { t: 'SETUP', teams: [{ name: 'a' }, { name: 'b' }], malPerTeam: 2, timeLimitMin: 20 }, T0);
    expect(() => step(lobby, { t: 'THROW', roll: '도' }, T0))
      .toThrow(expect.objectContaining({ code: 'ILLEGAL_ACTION' }));
  });

  it('assigns distinct colours and deterministic ids', () => {
    const r = started({ teams: 3 });
    expect(r.teams.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(r.teams[0]!.mal.map((m) => m.id)).toEqual(['t1m1', 't1m2']);
    expect(new Set(r.teams.map((t) => t.color)).size).toBe(3);
  });

  it('refuses a reveal step that skips ahead or runs past the board', () => {
    const ended = act(started(), { t: 'END', reason: 'master' }, T0);
    expect(() => step(ended, { t: 'REVEAL', step: 2 }, T0)).toThrow(expect.objectContaining({ code: 'BAD_REVEAL_STEP' }));
    let r = act(ended, { t: 'REVEAL', step: 0 }, T0);
    for (const s of [1, 2, 3, 4]) r = act(r, { t: 'REVEAL', step: s }, T0);
    expect(() => step(r, { t: 'REVEAL', step: 5 }, T0)).toThrow(expect.objectContaining({ code: 'BAD_REVEAL_STEP' }));
  });
});
