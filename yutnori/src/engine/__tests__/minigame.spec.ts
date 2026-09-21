import { describe, it, expect } from 'vitest';
import { MINIGAME_STATIONS } from '../../shared/constants';
import { replay, setupOf } from '../replay';
import { act, malOf, currentTeam, started, step, T0 } from './helpers';

// Spots are ≥6, so reach one with two throws that keep the same team's turn:
// 윷(4) 대기→4 (bonus, turn stays), then 개(2) 4→6 (no bonus) lands on 미니게임 칸 6.
const toSpot = () => {
  let s = started({ malPerTeam: 1, miniGames: true });
  s = act(s, { t: 'THROW', roll: '윷' }, T0); // 0→4, bonus keeps the turn
  return step(s, { t: 'THROW', roll: '개' }, T0); // 4→6, mini-game triggers
};

describe('mini-games (미니게임 칸)', () => {
  it('spots are all ≥6 so a 말 can never hit one leaving 대기', () => {
    expect(MINIGAME_STATIONS).toContain(6);
    expect(MINIGAME_STATIONS).toContain(8);
    for (const s of MINIGAME_STATIONS) {
      expect(s).toBeGreaterThanOrEqual(6); // > 모(5): unreachable from 대기 in one move
      expect(s).toBeLessThan(20);
    }
  });

  it('landing on a 미니게임 칸 freezes the turn and blocks another throw', () => {
    const { state, events } = toSpot();
    expect(state.pendingMiniGame).not.toBeNull();
    expect(state.pendingMiniGame!.station).toBe(6);
    expect(malOf(state, 't1m1').progress).toBe(6);
    expect(events.some((e) => e.e === 'minigame:triggered')).toBe(true);
    expect(() => step(state, { t: 'THROW', roll: '도' }, T0)).toThrow(
      expect.objectContaining({ code: 'MINIGAME_PENDING' }),
    );
  });

  it('success keeps the move and passes the turn (개 grants no bonus)', () => {
    let r = toSpot().state;
    r = act(r, { t: 'MINIGAME_SPIN', gameId: 'jegi' }, T0);
    r = act(r, { t: 'MINIGAME_RESOLVE', success: true }, T0);
    expect(r.pendingMiniGame).toBeNull();
    expect(malOf(r, 't1m1').progress).toBe(6); // move stands
    expect(currentTeam(r).name).toBe('조2'); // turn passed
    expect(r.history.at(-1)!.miniGame).toEqual({ gameId: 'jegi', success: true });
  });

  it('fail reverts the 말 to where it was (NOT 대기) and passes the turn', () => {
    let r = toSpot().state;
    r = act(r, { t: 'MINIGAME_RESOLVE', success: false }, T0);
    expect(r.pendingMiniGame).toBeNull();
    expect(malOf(r, 't1m1').progress).toBe(4); // back to the pre-move station, still on the board
    expect(currentTeam(r).name).toBe('조2'); // turn passes
    expect(r.history.at(-1)!.miniGame!.success).toBe(false);
  });

  it('a bonus throw is honoured on success but forfeited on fail', () => {
    // 윷(4) 대기→4 (+bonus), then 윷(4) 4→8 (미니게임 8, +bonus).
    let base = started({ malPerTeam: 1, miniGames: true });
    base = act(base, { t: 'THROW', roll: '윷' }, T0);
    const trig = step(base, { t: 'THROW', roll: '윷' }, T0);
    expect(trig.state.pendingMiniGame!.station).toBe(8);

    const ok = act(trig.state, { t: 'MINIGAME_RESOLVE', success: true }, T0);
    expect(malOf(ok, 't1m1').progress).toBe(8);
    expect(currentTeam(ok).name).toBe('조1'); // still 조1 — bonus throw owed

    const bad = act(trig.state, { t: 'MINIGAME_RESOLVE', success: false }, T0);
    expect(malOf(bad, 't1m1').progress).toBe(4); // reverted to before the move
    expect(currentTeam(bad).name).toBe('조2'); // bonus forfeited, turn passed
  });

  it('replay reproduces the outcome — success and failure alike (determinism)', () => {
    for (const success of [true, false]) {
      let r = toSpot().state;
      r = act(r, { t: 'MINIGAME_SPIN', gameId: 'ramen3' }, T0);
      r = act(r, { t: 'MINIGAME_RESOLVE', success }, T0);
      const rebuilt = replay(setupOf(r), r.history);
      expect(rebuilt.teams.map((t) => t.mal.map((m) => m.progress))).toEqual(
        r.teams.map((t) => t.mal.map((m) => m.progress)),
      );
      expect(rebuilt.turnIndex).toBe(r.turnIndex);
      expect(rebuilt.throwQueue).toBe(r.throwQueue);
      expect(rebuilt.history.at(-1)!.miniGame).toEqual(r.history.at(-1)!.miniGame);
    }
  });

  it('undo after a resolved mini-game reverts that move', () => {
    let r = toSpot().state;
    r = act(r, { t: 'MINIGAME_RESOLVE', success: true }, T0);
    r = act(r, { t: 'UNDO' }, T0);
    expect(malOf(r, 't1m1').progress).toBe(4); // back to after the first throw
    expect(currentTeam(r).name).toBe('조1');
  });
});
