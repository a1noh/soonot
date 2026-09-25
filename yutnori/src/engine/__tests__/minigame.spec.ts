import { describe, it, expect } from 'vitest';
import { MINIGAME_STATIONS } from '../../shared/constants';
import { isOnBoard } from '../../shared/board';
import { replay, setupOf } from '../replay';
import { act, malOf, currentTeam, started, step, T0 } from './helpers';

// Reach a spot with two throws that keep the same team's turn:
// 윷(4) 대기→4 (bonus, turn stays; 4 is not a spot), then 개(2) 4→6 triggers 미니게임 칸 6.
const toSpot = () => {
  let s = started({ malPerTeam: 1, miniGames: true });
  s = act(s, { t: 'THROW', roll: '윷' }, T0); // 0→4, bonus keeps the turn
  return step(s, { t: 'THROW', roll: '개' }, T0); // 4→6, mini-game triggers
};

describe('mini-games (미니게임 칸)', () => {
  it('spots are spread on-board (ring + 지름길 + 방), never on a corner or 대기/집', () => {
    expect(MINIGAME_STATIONS).toContain(6); // used by toSpot()
    expect(MINIGAME_STATIONS).toContain(8);
    expect(MINIGAME_STATIONS).toContain(23); // the centre 방
    for (const s of MINIGAME_STATIONS) {
      expect(isOnBoard(s)).toBe(true); // never 대기(0) or 집(20)
      expect([0, 5, 10, 15]).not.toContain(s); // never a 갈림길 corner
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

  it('a spot reachable from 대기 (node 1) triggers, and a fail returns the 말 to 대기', () => {
    // Spots now include low 밭 (1, 3): a 말 entering with 도 lands on 1 → mini-game.
    const s = started({ malPerTeam: 1, miniGames: true });
    const trig = step(s, { t: 'THROW', roll: '도' }, T0); // 대기(0) → 1, a ★
    expect(trig.state.pendingMiniGame?.station).toBe(1);
    const bad = act(trig.state, { t: 'MINIGAME_RESOLVE', success: false }, T0);
    expect(malOf(bad, 't1m1').progress).toBe(0); // canceled entry → back to 대기, no crash
  });

  it('landing on the centre 방 (23) triggers a mini-game', () => {
    // 모 0→5 (single candidate, auto-moved; bonus keeps the turn), then 걸 offers
    // BOTH 8칸 and the 지름길 to 방 — take the 지름길 explicitly.
    let r = started({ malPerTeam: 1, miniGames: true });
    r = act(r, { t: 'THROW', roll: '모' }, T0); // 0→5 (모 corner)
    r = act(r, { t: 'THROW', roll: '걸' }, T0); // two candidates: 8 or 방(23)
    r = act(r, { t: 'MOVE', malId: 't1m1', to: 23 }, T0); // 지름길 → 방
    expect(malOf(r, 't1m1').progress).toBe(23);
    expect(r.pendingMiniGame?.station).toBe(23);
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
