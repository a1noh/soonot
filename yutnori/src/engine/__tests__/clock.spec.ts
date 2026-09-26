import { describe, expect, it } from 'vitest';
import { MS_PER_MIN } from '../../shared/constants';
import { isMidTurn, remainingMs } from '../apply';
import { act, place, play, started, step, T0 } from './helpers';

const LIMIT = 20 * MS_PER_MIN;
const EXPIRY = T0 + LIMIT;

describe('clock (req §10)', () => {
  it('counts down from the limit', () => {
    const r = started();
    expect(remainingMs(r, T0)).toBe(LIMIT);
    expect(remainingMs(r, T0 + 5 * MS_PER_MIN)).toBe(15 * MS_PER_MIN);
    expect(remainingMs(r, EXPIRY + 1)).toBe(0);
  });

  it('freezes while paused and resumes where it left off', () => {
    let r = act(started(), { t: 'PAUSE' }, T0 + MS_PER_MIN);
    expect(remainingMs(r, T0 + 10 * MS_PER_MIN)).toBe(19 * MS_PER_MIN);  // frozen
    r = act(r, { t: 'RESUME' }, T0 + 10 * MS_PER_MIN);
    expect(r.totalPausedMs).toBe(9 * MS_PER_MIN);
    expect(remainingMs(r, T0 + 11 * MS_PER_MIN)).toBe(18 * MS_PER_MIN);
  });

  it('rejects a double pause and a resume that was never paused', () => {
    const r = started();
    expect(() => step(r, { t: 'RESUME' }, T0)).toThrow(expect.objectContaining({ code: 'NOT_PAUSED' }));
    const paused = act(r, { t: 'PAUSE' }, T0);
    expect(() => step(paused, { t: 'PAUSE' }, T0)).toThrow(expect.objectContaining({ code: 'ALREADY_PAUSED' }));
  });

  it('adds time with EXTEND', () => {
    const r = act(started(), { t: 'EXTEND', minutes: 5 }, T0);
    expect(remainingMs(r, T0)).toBe(25 * MS_PER_MIN);
  });

  it('ends at 00:00 when the current team has not started its turn', () => {
    const r = started({ malPerTeam: 1 });
    expect(isMidTurn(r)).toBe(false);
    const { state, events } = step(r, { t: 'TICK' }, EXPIRY);
    expect(state.state).toBe('ENDED');
    expect(state.endReason).toBe('timeup');
    expect(events.some((e) => e.e === 'game:ended')).toBe(true);
  });

  it('defers the end while the current team still owes a bonus throw — 마지막 차례', () => {
    let r = play(started({ malPerTeam: 1 }), '윷', undefined, T0);   // bonus, turn stays
    expect(isMidTurn(r)).toBe(true);

    r = act(r, { t: 'TICK' }, EXPIRY);
    expect(r.state).toBe('RUNNING');                                  // deferred

    r = play(r, '개', undefined, EXPIRY);                             // turn ends
    expect(isMidTurn(r)).toBe(false);
    r = act(r, { t: 'TICK' }, EXPIRY);
    expect(r.state).toBe('ENDED');
    expect(r.endReason).toBe('timeup');
  });

  it('does not tick down or end while paused', () => {
    const r = act(started({ malPerTeam: 1 }), { t: 'PAUSE' }, T0);
    const ticked = act(r, { t: 'TICK' }, EXPIRY);
    expect(ticked.state).toBe('RUNNING');
  });

  // (Removed: "ends when every team finished" — 말 respawn on 완주 = endless laps, so a
  //  game never ends by finishing; it ends only on time (timeup) or 게임 종료 (master).)

  it('lets the master end on the spot', () => {
    const r = act(started(), { t: 'END', reason: 'master' }, T0 + 1000);
    expect(r.state).toBe('ENDED');
    expect(r.endReason).toBe('master');
    expect(r.endedAt).toBe(T0 + 1000);
  });

  it('allows 게임 재개 after an accidental end, but not once the reveal has started', () => {
    const ended = act(started(), { t: 'END', reason: 'master' }, T0 + 1000);
    const resumed = act(ended, { t: 'RESUME_FROM_ENDED' }, T0 + 2000);
    expect(resumed.state).toBe('RUNNING');
    expect(resumed.endedAt).toBeNull();

    const revealing = act(act(ended, { t: 'REVEAL', step: 0 }, T0), { t: 'REVEAL', step: 1 }, T0);
    expect(() => step(revealing, { t: 'RESUME_FROM_ENDED' }, T0)).toThrow(
      expect.objectContaining({ code: 'ILLEGAL_ACTION' }),
    );
  });
});
