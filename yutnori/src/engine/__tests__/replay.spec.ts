import { describe, expect, it } from 'vitest';
import { replay, setupOf } from '../replay';
import { assertInvariants } from '../invariants';
import type { Roll, Room } from '../../shared/types';
import { act, play, started, T0 } from './helpers';

const SCRIPT: Roll[] = ['개', '걸', '윷', '도', '모', '개', '걸', '도', '모', '윷', '개', '도'];

function scripted(): Room {
  let r = started({ teams: 3, malPerTeam: 2 });
  let t = T0;
  for (const roll of SCRIPT) {
    if (r.state !== 'RUNNING') break;
    t += 1000;
    // Always take the first candidate — a fixed policy keeps the game deterministic.
    r = play(r, roll, undefined, t);
  }
  return r;
}

describe('replay (spec §4.4, §8.3)', () => {
  it('reproduces the exact state that produced the event log', () => {
    const live = scripted();
    expect(live.history.length).toBeGreaterThan(5);
    const rebuilt = replay(setupOf(live), live.history);
    expect(rebuilt).toEqual(live);
  });

  it('reproduces the state at every prefix of the log', () => {
    const live = scripted();
    for (let n = 0; n <= live.history.length; n++) {
      const rebuilt = replay(setupOf(live), live.history.slice(0, n));
      assertInvariants(rebuilt);
      expect(rebuilt.history).toHaveLength(n);
    }
  });

  it('is deterministic — replaying twice gives identical results', () => {
    const live = scripted();
    expect(replay(setupOf(live), live.history)).toEqual(replay(setupOf(live), live.history));
  });

  it('does not read the current clock — event timestamps drive it', () => {
    const live = scripted();
    const rebuilt = replay(setupOf(live), live.history);
    const last = live.history[live.history.length - 1]!;
    const movingTeam = rebuilt.teams.find((t) => t.id === last.teamId)!;
    expect(movingTeam.lastProgressAt).toBe(last.at);
  });

  it('carries the clock and lifecycle across, since no event determines them', () => {
    const live = act(scripted(), { t: 'END', reason: 'master' }, T0 + 99_000);
    const rebuilt = replay(setupOf(live), live.history);
    expect(rebuilt.state).toBe('ENDED');
    expect(rebuilt.endedAt).toBe(T0 + 99_000);
    expect(rebuilt.endReason).toBe('master');
    expect(rebuilt.timeLimitMs).toBe(live.timeLimitMs);
  });

  it('rebuilds an empty log back to the opening position', () => {
    const live = scripted();
    const rebuilt = replay(setupOf(live), []);
    expect(rebuilt.history).toEqual([]);
    expect(rebuilt.turnIndex).toBe(0);
    expect(rebuilt.throwQueue).toBe(1);
    expect(rebuilt.teams.flatMap((t) => t.mal).every((m) => m.progress === 0)).toBe(true);
  });
});
