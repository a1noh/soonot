// @vitest-environment jsdom
/**
 * Projector presentation-mode UI test (through a fake socket): it must render the
 * standby, the running 윷놀이 board, and float emoji reactions — without crashing
 * (a render crash would also silence the reactions, since the socket only
 * connects when the tree mounts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

const { sockets, FakeSocket } = vi.hoisted(() => {
  class FakeSocket {
    handlers: Record<string, ((d: unknown) => void)[]> = {};
    on(ev: string, cb: (d: unknown) => void) {
      (this.handlers[ev] ||= []).push(cb);
      return this;
    }
    emit() {
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

import { App } from '../projector/App';

const summary = {
  code: 'ABCD',
  title: '한마당',
  projector: 'yutnori' as const,
  projectorLock: null,
  games: { bingo: { enabled: true, state: 'SETUP' }, yutnori: { enabled: true, state: 'RUNNING' } },
};

function yutView(over: Record<string, unknown> = {}) {
  return {
    kind: 'board',
    state: 'RUNNING',
    teams: [
      { id: 't1', name: 'A조', roster: null, color: '#C0392B', mal: [{ id: 't1m1', progress: 3 }], finishedAt: null },
      { id: 't2', name: 'B조', roster: null, color: '#1F6FB2', mal: [{ id: 't2m1', progress: 0 }], finishedAt: null },
    ],
    turnTeamId: 't2',
    turnTeamName: 'B조',
    throwQueue: 1,
    pending: null,
    pendingMiniGame: null,
    remainingMs: 1_150_000,
    paused: false,
    revealStep: 0,
    endReason: null,
    standings: [],
    miniGames: [{ id: 'jegi', name: '제기차기', instruction: '제기를 3번 차기' }],
    ...over,
  };
}

afterEach(() => {
  cleanup();
  sockets.length = 0;
});

describe('projector presentation mode', () => {
  it('renders standby before an event, then the 윷놀이 board once it is running', () => {
    render(<App />);
    const sock = sockets[0]!;
    act(() => sock.fire('connect'));
    // No event → standby, no crash.
    expect(screen.getByText('SOONOT')).toBeTruthy();

    act(() => {
      sock.fire('event:summary', summary);
      sock.fire('room:state', { gameId: 'yutnori', view: yutView() });
    });
    // The board renders (turn label + the SVG board).
    expect(screen.getByText(/B조 차례/)).toBeTruthy();
    expect(document.querySelector('svg.board')).toBeTruthy();
  });

  it('shows the board (not standby) even while yutnori is still in SETUP', () => {
    render(<App />);
    const sock = sockets[0]!;
    act(() => {
      sock.fire('connect');
      sock.fire('event:summary', summary);
      sock.fire('room:state', { gameId: 'yutnori', view: yutView({ state: 'SETUP' }) });
    });
    expect(document.querySelector('svg.board')).toBeTruthy(); // board-centric like /y
    expect(screen.getByText(/팀을 준비/)).toBeTruthy();
  });

  it('floats an emoji reaction onto the stage', () => {
    render(<App />);
    const sock = sockets[0]!;
    act(() => {
      sock.fire('connect');
      sock.fire('event:summary', summary);
      sock.fire('room:state', { gameId: 'yutnori', view: yutView() });
    });
    expect(document.querySelectorAll('.reaction')).toHaveLength(0);
    act(() => sock.fire('reaction', { emoji: '🎉' }));
    const flying = document.querySelectorAll('.reaction');
    expect(flying).toHaveLength(1);
    expect(flying[0]!.textContent).toBe('🎉');
  });

  it('plays the 미니게임! callout first, then reveals the roulette', () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      const sock = sockets[0]!;
      act(() => {
        sock.fire('connect');
        sock.fire('event:summary', summary);
        sock.fire('room:state', {
          gameId: 'yutnori',
          view: yutView({ pendingMiniGame: { teamId: 't1', teamName: 'A조', station: 8, gameId: 'jegi' } }),
        });
      });
      // During the hold the board is still shown (the callout plays over it) —
      // the roulette card is NOT up yet.
      expect(screen.queryByText('제기차기')).toBeNull();
      // After the callout finishes, the roulette pops in.
      act(() => vi.advanceTimersByTime(2200));
      expect(screen.getByText('제기차기')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
