import { describe, expect, it } from 'vitest';
import { replay, setupOf } from '../replay';
import { act, malOf, place, play, started, step, turn, T0 } from './helpers';

/** t1m1 at 1, t2m1 at 3 with 방어전 on — 개 makes t1m1 land on t2m1 (a catch). */
const armed = () => place(started({ malPerTeam: 1, captureDuel: true }), { t1m1: 1, t2m1: 3 });

describe('잡기 방어전 (capture duel, req: A)', () => {
  it('a catch freezes the turn for a 대표 대결 and blocks another throw', () => {
    const { state } = turn(armed(), '개'); // t1m1 1→3, catches t2m1
    expect(state.pendingMiniGame?.duel).toMatchObject({ vsTeam: 't2', byTeamName: '조1', vsTeamName: '조2' });
    expect(() => step(state, { t: 'THROW', roll: '도' }, T0)).toThrow(
      expect.objectContaining({ code: 'MINIGAME_PENDING' }),
    );
  });

  it('defender wins → the capture is reverted: both 말 go back where they were', () => {
    const { state } = turn(armed(), '개');
    const r = act(state, { t: 'MINIGAME_RESOLVE', success: false }, T0); // 수비 대표 승
    expect(malOf(r, 't2m1').progress).toBe(3); // captured 말 survives, restored to its 밭
    expect(malOf(r, 't1m1').progress).toBe(1); // attacker retreats to where it came from
    expect(r.turnIndex).toBe(1); // bonus forfeited, turn passes
    expect(r.pendingMiniGame).toBeNull();
  });

  it('attacker wins → the capture stands and the bonus throw is honoured', () => {
    const { state } = turn(armed(), '개');
    const r = act(state, { t: 'MINIGAME_RESOLVE', success: true }, T0); // 잡은 팀 대표 승
    expect(malOf(r, 't2m1').progress).toBe(0); // stays 대기 (caught)
    expect(malOf(r, 't1m1').progress).toBe(3); // attacker keeps the spot
    expect(r.turnIndex).toBe(0); // catch bonus keeps the turn
    expect(r.throwQueue).toBe(1);
  });

  it('no duel when 방어전 is off — the catch is immediate', () => {
    const { state } = turn(place(started({ malPerTeam: 1 }), { t1m1: 1, t2m1: 3 }), '개');
    expect(state.pendingMiniGame).toBeNull();
    expect(malOf(state, 't2m1').progress).toBe(0);
  });

  it('replays a duel outcome deterministically', () => {
    let r = started({ malPerTeam: 1, captureDuel: true });
    r = play(r, '도'); // 조1: 0→1
    r = play(r, '걸'); // 조2: 0→3
    const caught = turn(r, '개'); // 조1: 1→3, catches → duel pending
    expect(caught.state.pendingMiniGame?.duel).toBeTruthy();
    const resolved = act(caught.state, { t: 'MINIGAME_RESOLVE', success: false }, T0); // defender wins
    const rebuilt = replay(setupOf(resolved), resolved.history);
    expect(rebuilt.teams.map((t) => t.mal.map((m) => m.progress))).toEqual(
      resolved.teams.map((t) => t.mal.map((m) => m.progress)),
    );
  });
});
