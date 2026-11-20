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
      { id: 't1', name: 'A조', roster: null, color: '#C0392B', mal: [{ id: 't1m1', progress: 3 }], finishedAt: null, miniWins: 0 },
      { id: 't2', name: 'B조', roster: null, color: '#1F6FB2', mal: [{ id: 't2m1', progress: 0 }], finishedAt: null, miniWins: 0 },
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
    duelGames: [],
    miniRanking: [],
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
    expect(screen.getByText('추수감사절')).toBeTruthy();

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

  it('spotlights a winner\'s whole card on /p when the master pushes it', () => {
    render(<App />);
    const sock = sockets[0]!;
    const bWinner = {
      rank: 1,
      n: 7,
      name: '민지',
      lines: 1,
      points: 6,
      matched: [{ trait: '커피를 좋아해요', name: '지훈', number: 3 }],
      grid: [
        { trait: '커피를 좋아해요', name: '지훈', number: 3, line: true },
        { trait: '강아지를 키워요', name: null, number: null, line: false },
      ],
    };
    const bReveal = {
      kind: 'spectator',
      state: 'REVEAL',
      revealStep: 4,
      connectedCount: 2,
      playerCount: 2,
      bingoCount: 1,
      standings: [],
      board: [],
      roster: [],
      bingoBreakdown: [],
      winners: [bWinner],
    };
    // Point the projector at bingo and reveal, but WITHOUT a spotlight → podium,
    // not the whole-card grid.
    act(() => {
      sock.fire('connect');
      sock.fire('event:summary', { ...summary, projector: 'bingo', bingoSpotlight: null });
      sock.fire('room:state', { gameId: 'bingo', view: bReveal });
    });
    expect(document.querySelector('.wcard')).toBeNull();
    expect(document.querySelector('.podium')).toBeTruthy();

    // The master pushes 민지's card → the whole 5×5 card (one cell per grid entry,
    // matched people named, empty cells trait-only) replaces the podium.
    act(() => sock.fire('event:summary', { ...summary, projector: 'bingo', bingoSpotlight: 7 }));
    expect(document.querySelector('.wcard')).toBeTruthy();
    expect(document.querySelector('.podium')).toBeNull();
    expect(screen.getByText('민지')).toBeTruthy();
    expect(document.querySelectorAll('.wcell')).toHaveLength(2);
    expect(document.querySelectorAll('.wcell__who')).toHaveLength(1); // only the filled cell
    expect(screen.getByText(/지훈/)).toBeTruthy();
  });

  it('numbers the 랜덤 5명 확인 cells on the spotlighted card', () => {
    render(<App />);
    const sock = sockets[0]!;
    const grid = Array.from({ length: 25 }, (_, i) => ({ trait: `특징 ${i}`, name: i % 2 ? null : `사람${i}`, number: i, line: false }));
    const bReveal = {
      kind: 'spectator', state: 'REVEAL', revealStep: 4, connectedCount: 2, playerCount: 2, bingoCount: 1,
      standings: [], board: [], roster: [], bingoBreakdown: [],
      winners: [{ rank: 1, n: 7, name: '민지', lines: 1, points: 6, matched: [], grid }],
    };
    act(() => {
      sock.fire('connect');
      sock.fire('event:summary', { ...summary, projector: 'bingo', bingoSpotlight: 7, bingoCheck: [8, 0, 4] });
      sock.fire('room:state', { gameId: 'bingo', view: bReveal });
    });
    const checked = [...document.querySelectorAll('.wcell--check')];
    expect(checked).toHaveLength(3);
    // Call-out order is the order the master drew, not card order.
    expect(checked.map((c) => [c.querySelector('.wcell__checknum')!.textContent, c.querySelector('.wcell__who')!.textContent])).toEqual([
      ['2', '사람0 #0'],
      ['3', '사람4 #4'],
      ['1', '사람8 #8'],
    ]);
  });

  it('shows the master\'s countdown over the screen, on the server\'s clock', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000_000);
      render(<App />);
      const sock = sockets[0]!;
      // The projector's clock is 5 s behind the server's; the timer ends 20 s after serverNow.
      act(() => {
        sock.fire('connect');
        sock.fire('event:summary', {
          ...summary,
          serverNow: 1_005_000,
          projectorTimer: { label: '종이비행기 접기', totalMs: 20_000, endsAt: 1_025_000 },
        });
      });
      expect(screen.getByRole('timer').textContent).toContain('종이비행기 접기');
      expect(screen.getByRole('timer').textContent).toContain('0:20');
      act(() => vi.advanceTimersByTime(16_000));
      expect(screen.getByRole('timer').textContent).toContain('0:04');
      expect(document.querySelector('.ptimer.is-urgent')).toBeTruthy();
      act(() => vi.advanceTimersByTime(4_200));
      expect(screen.getByRole('timer').textContent).toContain('시간 종료!');
      act(() => vi.advanceTimersByTime(3_500));
      expect(screen.queryByRole('timer')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not flash 시간 종료! for a countdown that ended before the screen opened', () => {
    render(<App />);
    const sock = sockets[0]!;
    act(() => {
      sock.fire('connect');
      sock.fire('event:summary', { ...summary, serverNow: Date.now(), projectorTimer: { label: '', totalMs: 10_000, endsAt: Date.now() - 60_000 } });
    });
    expect(screen.queryByRole('timer')).toBeNull();
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
