import { describe, expect, it } from 'vitest';
import type { HostDb } from '@soonot/master';
import { snapshot } from '../persist';
import { assertInvariants } from '../engine/invariants';
import { DEFAULT_PRIZES, DEFAULT_TITLE } from '../shared/constants';

/** A db that returns one saved row, like SQLite would. */
const dbWith = (room: unknown) => ({ prepare: () => ({ get: () => ({ room: JSON.stringify(room) }) }) }) as unknown as HostDb;

describe('a game saved before the manual chooser', () => {
  it('comes back with a team chooser, a title and prizes, and keeps the invariants', () => {
    // The shape the live server wrote before: chooserId only, no title/prizes/turnGuest.
    const old = {
      id: 'r', eventId: 'e', createdAt: 0, state: 'RUNNING',
      teams: [
        { id: 't1', name: '아이언맨', color: '#C0392B', playing: true },
        { id: 't2', name: '헐크', color: '#1F6FB2', playing: true },
      ],
      stones: [{ id: 's1', name: '예배 스톤', color: '#3D7BFF' }, { id: 's2', name: '섬김 스톤', color: '#FFD23F' }],
      games: [
        { id: 'g1', name: 'A', players: '2명', instructions: '' },
        { id: 'g2', name: 'B', players: '모두', instructions: '' },
      ],
      turnTeamId: 't2', round: 1,
      pending: { chooserId: 't2', stoneId: 's2', gameId: 'g2' },
      claims: [{ stoneId: 's1', gameId: 'g1', chooserId: 't1', round: 1, winners: ['t1'], at: 1 }],
      history: [{ kind: 'claim', chooserId: 't1', round: 1 }],
      tiebreak: { id: 'tb', name: '엔드게임', players: '모두', instructions: '' },
      tiebreaks: [], activeTiebreak: null, lastResult: null, seq: 1, startedAt: 0, endedAt: null, revealStep: 0,
    };
    const room = snapshot.read(dbWith(old), 'e')!;
    expect(room).toMatchObject({ title: DEFAULT_TITLE, prizes: DEFAULT_PRIZES, turnGuest: null, turnTeamId: 't2' });
    expect(room.pending).toMatchObject({ chooserId: 't2', chooserName: '헐크' });
    expect(room.claims[0]).toMatchObject({ chooserId: 't1', chooserName: '아이언맨' });
    expect(room.history[0]).toEqual({ kind: 'claim', round: 1, teamId: 't1', guest: null });
    expect(() => assertInvariants(room)).not.toThrow();
  });
});
