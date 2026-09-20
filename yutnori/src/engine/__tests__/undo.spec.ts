import { describe, expect, it } from 'vitest';
import { HOME } from '../../shared/constants';
import { act, emitted, malOf, play, started, step, T0, turn } from './helpers';

const LATER = T0 + 60_000;

describe('undo — 되돌리기 (req §7.1, §17)', () => {
  it('reverts a mis-tapped roll to the exact state before it', () => {
    const before = started();
    const after = play(before, '개', 't1m1');
    const undone = act(after, { t: 'UNDO' }, LATER);
    expect(undone).toEqual(before);
  });

  it('refuses when there is nothing to undo', () => {
    expect(() => step(started(), { t: 'UNDO' }, T0)).toThrow(
      expect.objectContaining({ code: 'NOTHING_TO_UNDO' }),
    );
  });

  it('restores a captured 말 to its exact station and removes the bonus throw', () => {
    // Reached by playing, never by fabricating state: undo replays the log, so only
    // positions the log actually produced can come back (see `place` in helpers).
    let r = started({ malPerTeam: 1 });
    r = play(r, '도');                          // 조1: 0 → 1, turn passes
    r = play(r, '걸');                          // 조2: 0 → 3, turn passes back
    const before = r;

    const after = play(r, '개');                // 조1: 1 → 3, catching 조2
    expect(malOf(after, 't2m1').progress).toBe(0);
    expect(after.throwQueue).toBe(1);          // catch bonus
    expect(after.turnIndex).toBe(0);

    const undone = act(after, { t: 'UNDO' }, LATER);
    expect(malOf(undone, 't2m1').progress).toBe(3);   // exact prior station, not 0
    expect(undone).toEqual(before);
  });

  it('puts a finished 말 back on the board and clears finishedAt', () => {
    let before = started({ malPerTeam: 1 });
    // 모/모/모/윷 = 19, and every one of them is a bonus roll, so 조1 keeps the turn.
    for (const roll of ['모', '모', '모', '윷'] as const) before = play(before, roll);
    expect(malOf(before, 't1m1').progress).toBe(19);
    expect(before.turnIndex).toBe(0);

    const after = play(before, '도');
    expect(after.teams[0]!.finishedAt).toBe(T0);
    expect(malOf(after, 't1m1').progress).toBe(HOME);

    const undone = act(after, { t: 'UNDO' }, LATER);
    expect(undone.teams[0]!.finishedAt).toBeNull();
    expect(malOf(undone, 't1m1').progress).toBe(19);
    expect(undone.turnIndex).toBe(0);                  // back in the turn order
    expect(undone).toEqual(before);
  });

  it('restores the turn pointer when the undone move had ended the turn', () => {
    const before = started({ malPerTeam: 1 });
    const after = play(before, '개');
    expect(after.turnIndex).toBe(1);                   // turn passed to 조2
    const undone = act(after, { t: 'UNDO' }, LATER);
    expect(undone.turnIndex).toBe(0);
    expect(undone).toEqual(before);
  });

  it('is repeatable — walks back several events', () => {
    const start = started({ malPerTeam: 1 });
    let r = play(start, '개');          // 조1 moves, turn → 조2
    r = play(r, '걸');                  // 조2 moves, turn → 조1
    r = play(r, '도');                  // 조1 moves again
    expect(r.history).toHaveLength(3);

    r = act(r, { t: 'UNDO' }, LATER);
    r = act(r, { t: 'UNDO' }, LATER);
    r = act(r, { t: 'UNDO' }, LATER);
    expect(r.history).toHaveLength(0);
    expect(r).toEqual(start);
  });

  it('cancels a throw entered but not yet resolved, returning it to the queue', () => {
    const before = started();
    const thrown = step(before, { t: 'THROW', roll: '모' }, T0).state;
    expect(thrown.pendingThrow).not.toBeNull();
    expect(thrown.throwQueue).toBe(0);

    const { state, events } = step(thrown, { t: 'UNDO' }, LATER);
    expect(state.pendingThrow).toBeNull();
    expect(state.throwQueue).toBe(1);
    expect(state).toEqual(before);
    expect(emitted(events, 'undo:applied')[0]).toMatchObject({ revertedSeq: 0 });
  });

  it('reports which event was reverted', () => {
    const r = play(started({ malPerTeam: 1 }), '개');
    const { events } = step(r, { t: 'UNDO' }, LATER);
    expect(emitted(events, 'undo:applied')[0]).toMatchObject({ revertedSeq: 1 });
  });

  it('is not available once the game has ended', () => {
    const ended = act(play(started({ malPerTeam: 1 }), '개'), { t: 'END', reason: 'master' }, LATER);
    expect(() => step(ended, { t: 'UNDO' }, LATER)).toThrow(
      expect.objectContaining({ code: 'ILLEGAL_ACTION' }),
    );
    void turn;
  });
});
