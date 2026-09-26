import { describe, expect, it } from 'vitest';
import { newRoom } from '../apply';
import { rank } from '../ranking';
import { act, malOf, started, step, T0 } from './helpers';
import type { Room } from '../../shared/types';

describe('a whole game, start to podium (spec §10, milestone 1)', () => {
  it('plays 2 teams SETUP → RUNNING (endless laps) → 게임 종료 → REVEAL', () => {
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

    // 조1 runs a full lap with four 모 (모 grants a bonus, so the turn stays with 조1):
    // 대기→5→10→15→집. On 완주 the 말 RESPAWNS in 대기 and a lap is counted — the game
    // does NOT end (endless laps), it only ends on time or 게임 종료.
    let now = T0;
    const outerMove = () => {
      if (!r.pendingThrow) return; // single-candidate throws auto-apply
      const c = r.pendingThrow.candidates.find((x) => x.to < 21) ?? r.pendingThrow.candidates[0]!;
      r = act(r, { t: 'MOVE', malId: c.malId, to: c.to }, now);
    };
    for (let i = 0; i < 4; i++) {
      now += 1000;
      r = act(r, { t: 'THROW', roll: '모' }, now);
      outerMove();
    }
    expect(r.teams[0]!.finishes).toBe(1); // one lap
    expect(malOf(r, 't1m1').progress).toBe(0); // 말 respawned in 대기
    expect(r.state).toBe('RUNNING'); // never ends by finishing

    r = act(r, { t: 'END', reason: 'master' }, now);
    expect(r.state).toBe('ENDED');
    expect(r.endReason).toBe('master');

    const standings = rank(r);
    expect(standings[0]!.teamName).toBe('청년부 1조'); // leads on laps
    expect(standings[0]!.malHome).toBe(1); // "집" = laps completed

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
