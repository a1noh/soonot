import { describe, expect, it } from 'vitest';
import { EngineError } from '../actions';
import { emitted, place, play, started, step, T0, turn } from './helpers';

describe('throw entry (req §7)', () => {
  it('grants an extra throw for 윷 and 모, and none for 도/개/걸', () => {
    for (const [roll, expectedQueue] of [['도', 0], ['개', 0], ['걸', 0], ['윷', 1], ['모', 1]] as const) {
      // One 말 per team keeps the move forced, isolating the bonus rule.
      const r = play(started({ malPerTeam: 1 }), roll);
      if (expectedQueue === 1) {
        expect(r.turnIndex, `${roll} keeps the turn`).toBe(0);
        expect(r.throwQueue).toBe(1);
      } else {
        expect(r.turnIndex, `${roll} passes the turn`).toBe(1);
      }
    }
  });

  it('stacks consecutive bonuses instead of collapsing them', () => {
    let r = started({ malPerTeam: 1 });
    r = play(r, '윷');            // bonus
    expect(r.turnIndex).toBe(0);
    r = play(r, '모');            // another bonus
    expect(r.turnIndex).toBe(0);
    r = play(r, '개');            // no bonus — turn ends
    expect(r.turnIndex).toBe(1);
  });

  it('always emits throw:recorded, even when the move is forced', () => {
    const { events } = turn(started({ malPerTeam: 1 }), '개');
    expect(emitted(events, 'throw:recorded')).toHaveLength(1);
  });

  it('auto-applies the move when only one candidate exists', () => {
    const { state } = turn(started({ malPerTeam: 1 }), '개');
    expect(state.pendingThrow).toBeNull();
    expect(state.history).toHaveLength(1);
  });

  it('waits for a 말 choice when more than one candidate exists', () => {
    const { state } = step(started(), { t: 'THROW', roll: '개' }, T0);
    expect(state.pendingThrow).not.toBeNull();
    expect(state.pendingThrow!.candidates).toHaveLength(2);
    expect(state.history).toHaveLength(0);
  });

  it('rejects a second throw while one is pending', () => {
    const { state } = step(started(), { t: 'THROW', roll: '개' }, T0);
    expect(() => step(state, { t: 'THROW', roll: '도' }, T0)).toThrow(
      expect.objectContaining({ code: 'THROW_PENDING' }),
    );
  });

  it('rejects a throw nobody is owed', () => {
    const r = place(started(), {});
    const spent = { ...r, throwQueue: 0 };
    expect(() => step(spent, { t: 'THROW', roll: '도' }, T0)).toThrow(EngineError);
  });
});
