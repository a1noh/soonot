// @vitest-environment jsdom
/**
 * UI test for the bingo player card — the real React tree, driven through a fake
 * socket. It renders the join screen, joins, receives a dealt card, opens a
 * cell, searches the roster, and taps a person; the assertion is that the tap
 * emits the right `cell:fill` to the server. This is "playing bingo through the
 * UI" without a browser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { sockets, FakeSocket } = vi.hoisted(() => {
  class FakeSocket {
    handlers: Record<string, ((d: unknown) => void)[]> = {};
    emitted: { ev: string; payload: unknown }[] = [];
    on(ev: string, cb: (d: unknown) => void) {
      (this.handlers[ev] ||= []).push(cb);
      return this;
    }
    emit(ev: string, payload: unknown, ack?: (v: unknown) => void) {
      this.emitted.push({ ev, payload });
      if (ack) ack(ev === 'room:join' ? { ok: true, playerId: 'me' } : { ok: true });
      return this;
    }
    close() {}
    fire(ev: string, data?: unknown) {
      for (const cb of this.handlers[ev] ?? []) cb(data);
    }
  }
  return { sockets: [] as InstanceType<typeof FakeSocket>[], FakeSocket };
});

vi.mock('socket.io-client', () => ({
  io: () => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  },
}));

// Imported after the mock is registered.
import { App } from '../player/App';
import { CELLS } from '@soonot/bingo/src/shared/constants';

const TRAITS = Array.from({ length: CELLS }, (_, i) => `특징${i + 1}`);
const IDENTITY = Array.from({ length: CELLS }, (_, i) => i);

function playerView(over: Record<string, unknown> = {}) {
  return {
    kind: 'player',
    state: 'RUNNING',
    playerCount: 3,
    connectedCount: 3,
    bingoCount: 0,
    startedAt: Date.now(),
    endedAt: null,
    revealStep: 0,
    traitCount: CELLS,
    standings: [],
    traits: TRAITS,
    roster: [],
    me: {
      id: 'me',
      number: 1,
      nickname: '나',
      permutation: IDENTITY,
      fills: new Array(CELLS).fill(null),
      completedLines: [],
      bestLine: 0,
      filled: 0,
    },
    ...over,
  };
}

beforeEach(() => {
  // Arrive as if the projector QR was scanned (`/{code}`), so the 참여 코드 gate
  // auto-passes and these tests land on the join screen. The gate itself is
  // covered by its own test, which arrives on the bare `/b`.
  window.history.replaceState({}, '', '/ABCD');
});

afterEach(() => {
  cleanup();
  sockets.length = 0;
  localStorage.clear();
});

describe('bingo player card (through the UI)', () => {
  it('join → dealt card → open a cell → search → tap a person → emits cell:fill', async () => {
    const user = userEvent.setup();
    render(<App />);
    const sock = sockets[0]!;

    // Connect + an event exists in LOBBY → the join screen appears.
    act(() => {
      sock.fire('connect');
      sock.fire('event:summary', { code: 'ABCD', title: '한마당', projector: 'auto', projectorLock: null, games: { bingo: { enabled: true, state: 'LOBBY' }, yutnori: { enabled: true, state: 'SETUP' } } });
    });
    expect(screen.getByText('교회 사람 빙고')).toBeTruthy();

    // Join with a nickname.
    await user.type(screen.getByRole('textbox'), '나');
    await user.click(screen.getByRole('button', { name: '입장하기' }));
    expect(sock.emitted.some((e) => e.ev === 'room:join')).toBe(true);

    // The game starts: a card is dealt and the projection arrives.
    act(() => {
      sock.fire('card:assigned', { permutation: IDENTITY, number: 1 });
      sock.fire('room:state', { gameId: 'bingo', view: playerView() });
      sock.fire('roster:snapshot', {
        players: [
          { n: 1, id: 'me', name: '나', conn: true },
          { n: 2, id: 'p2', name: '철수', conn: true },
          { n: 3, id: 'p3', name: '영희', conn: true },
        ],
      });
    });

    // all cells rendered.
    const cells = document.querySelectorAll('.cell');
    expect(cells).toHaveLength(CELLS);

    // Open cell 0, search for player #2, tap them → emits cell:fill.
    await user.click(cells[0] as HTMLElement);
    await user.type(screen.getByRole('textbox'), '2');
    const results = screen.getByRole('list');
    await user.click(within(results).getByText('철수'));

    const fill = sock.emitted.find((e) => e.ev === 'cell:fill');
    expect(fill).toBeTruthy();
    expect(fill!.payload).toMatchObject({ cellIndex: 0, query: '2' });
  });

  it('참여 코드 gate: bare /b shows the code screen — wrong code blocked, right code (any case) passes', async () => {
    window.history.replaceState({}, '', '/b'); // no code in the URL → must type it
    const user = userEvent.setup();
    render(<App />);
    const sock = sockets[0]!;
    act(() => {
      sock.fire('connect');
      sock.fire('event:summary', { code: 'ABCD', title: '한마당', projector: 'auto', projectorLock: null, games: { bingo: { enabled: true, state: 'LOBBY' }, yutnori: { enabled: true, state: 'SETUP' } } });
    });

    // The code screen, not the join screen.
    expect(screen.queryByRole('button', { name: '입장하기' })).toBeNull();
    const codeInput = screen.getByRole('textbox');

    // Wrong code is rejected.
    await user.type(codeInput, 'WRONG');
    await user.click(screen.getByRole('button', { name: '입장' }));
    expect(screen.getByRole('alert').textContent).toContain('코드가 맞지 않아요');
    expect(screen.queryByRole('button', { name: '입장하기' })).toBeNull();

    // Correct code (lower-case → matched case-insensitively) opens the join screen.
    await user.clear(codeInput);
    await user.type(codeInput, 'abcd');
    await user.click(screen.getByRole('button', { name: '입장' }));
    expect(screen.getByRole('button', { name: '입장하기' })).toBeTruthy();
  });

  it('reaction bar: a tap emits `react` with a name, then the buttons disable (도배 guard)', async () => {
    const user = userEvent.setup();
    render(<App />);
    const sock = sockets[0]!;
    act(() => {
      sock.fire('connect');
      sock.fire('event:summary', { code: 'ABCD', title: '한마당', projector: 'auto', projectorLock: null, games: { bingo: { enabled: true, state: 'LOBBY' }, yutnori: { enabled: true, state: 'SETUP' } } });
    });
    await user.type(screen.getByRole('textbox'), '나');
    await user.click(screen.getByRole('button', { name: '입장하기' }));
    act(() => {
      sock.fire('card:assigned', { permutation: IDENTITY, number: 1 });
      sock.fire('room:state', { gameId: 'bingo', view: playerView() });
    });

    const heart = screen.getByRole('button', { name: '🎉 보내기' });
    await user.click(heart);

    // it went out, carrying the sender's nickname so the projector can name it
    const react = sock.emitted.find((e) => e.ev === 'react');
    expect(react).toBeTruthy();
    expect(react!.payload).toMatchObject({ emoji: '🎉', name: '나' });

    // and the whole bar is now on cooldown — you can't hammer it
    expect((heart as HTMLButtonElement).disabled).toBe(true);
    for (const emo of ['❤️', '👏', '🔥', '👍']) {
      expect((screen.getByRole('button', { name: `${emo} 보내기` }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('cannot fill your own number: the search marks self and disables it', async () => {
    const user = userEvent.setup();
    render(<App />);
    const sock = sockets[0]!;
    act(() => {
      sock.fire('connect');
      sock.fire('event:summary', { code: 'ABCD', title: '한마당', projector: 'auto', projectorLock: null, games: { bingo: { enabled: true, state: 'LOBBY' }, yutnori: { enabled: true, state: 'SETUP' } } });
    });
    await user.type(screen.getByRole('textbox'), '나');
    await user.click(screen.getByRole('button', { name: '입장하기' }));
    act(() => {
      sock.fire('card:assigned', { permutation: IDENTITY, number: 1 });
      sock.fire('room:state', { gameId: 'bingo', view: playerView() });
      sock.fire('roster:snapshot', { players: [{ n: 1, id: 'me', name: '나', conn: true }] });
    });

    await user.click(document.querySelectorAll('.cell')[0] as HTMLElement);
    await user.type(screen.getByRole('textbox'), '1'); // that's me
    const selfBtn = within(screen.getByRole('list')).getByText('#1').closest('button') as HTMLButtonElement;
    expect(selfBtn.disabled).toBe(true);
  });
});
