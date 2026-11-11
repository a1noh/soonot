// @vitest-environment jsdom
/**
 * 스톤 UI: the console pane sends the right actions, and the projector shows
 * the ring, the mission and the rankings, then the podium.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StonesMasterPane } from '@soonot/stones/src/client/MasterPane';
import type { StonesView } from '@soonot/stones/src/project';

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

afterEach(() => {
  cleanup();
  sockets.length = 0;
});

const stones = [
  { id: 's1', name: '빨강 스톤', color: '#FF4D5E', mission: '노래 한 소절' },
  { id: 's2', name: '파랑 스톤', color: '#4D8DFF', mission: '퀴즈 3문제' },
];

function view(o: Partial<StonesView> = {}): StonesView {
  return {
    kind: 'master',
    state: 'RUNNING',
    teams: [
      { id: 't1', name: '선교', color: '#C0392B', playing: true, stoneIds: ['s2'] },
      { id: 't2', name: '예배', color: '#1F6FB2', playing: true, stoneIds: [] },
      { id: 't3', name: '양육', color: '#1E8449', playing: false, stoneIds: [] },
    ],
    stones,
    turnTeamId: 't1',
    turnTeamName: '선교',
    round: 2,
    pending: null,
    lastResult: null,
    revealStep: 0,
    standings: [
      { rank: 1, teamId: 't1', teamName: '선교', color: '#C0392B', playing: true, stoneIds: ['s2'], reachedAt: 1 },
      { rank: 2, teamId: 't2', teamName: '예배', color: '#1F6FB2', playing: true, stoneIds: [], reachedAt: null },
    ],
    blocking: false,
    canUndo: true,
    ...o,
  };
}

describe('StonesMasterPane', () => {
  it('SETUP: ticks who plays and sends teams + stones', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<StonesMasterPane view={view({ state: 'SETUP', teams: [], stones: [] })} send={send} />);
    await user.click(screen.getByRole('checkbox', { name: '친교' })); // sit one default team out
    await user.click(screen.getByRole('button', { name: /준비/ }));
    const payload = send.mock.calls[0]![1];
    expect(send.mock.calls[0]![0]).toBe('master:setup');
    expect(payload.teams).toHaveLength(7);
    expect(payload.teams.find((t: { name: string }) => t.name === '친교').playing).toBe(false);
    expect(payload.stones).toHaveLength(6);
  });

  it('RUNNING: a held stone cannot be picked; another one sends master:pick', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<StonesMasterPane view={view()} send={send} />);
    const group = screen.getByRole('group', { name: /선교 팀이 도전할 스톤/ });
    expect(within(group).getByRole('button', { name: /파랑 스톤/ })).toHaveProperty('disabled', true);
    await user.click(within(group).getByRole('button', { name: /빨강 스톤/ }));
    expect(send).toHaveBeenCalledWith('master:pick', { stone: 's1' });
  });

  it('a pending pick shows the mission and 성공 / 실패', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<StonesMasterPane view={view({ pending: { teamId: 't1', teamName: '선교', stoneId: 's1' }, blocking: true })} send={send} />);
    expect(screen.getByText('노래 한 소절')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '성공' }));
    expect(send).toHaveBeenCalledWith('master:resolve', { success: true });
    expect(screen.getByRole('button', { name: '건너뛰기' })).toHaveProperty('disabled', true);
  });

  it('toggling a team out sends master:playing', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<StonesMasterPane view={view()} send={send} />);
    await user.click(screen.getByRole('checkbox', { name: /예배/ }));
    expect(send).toHaveBeenCalledWith('master:playing', { team: 't2', playing: false });
  });
});

describe('스톤 on the projector', () => {
  const summary = {
    code: 'ABCD',
    title: '한마당',
    projector: 'stones' as const,
    projectorLock: null,
    games: {
      bingo: { enabled: true, state: 'SETUP' },
      yutnori: { enabled: true, state: 'SETUP' },
      stones: { enabled: true, state: 'RUNNING' },
    },
  };

  it('shows the ring and rankings, then the mission, then the podium', () => {
    render(<App />);
    const sock = sockets[0]!;
    act(() => {
      sock.fire('connect');
      sock.fire('event:summary', summary);
      sock.fire('room:state', { gameId: 'stones', view: view({ kind: 'board' }) });
    });
    expect(screen.getByLabelText('순위')).toBeTruthy();
    expect(screen.getAllByText('빨강 스톤').length).toBeGreaterThan(0);
    expect(screen.getByText('도전할 스톤을 골라요')).toBeTruthy();

    act(() => {
      sock.fire('room:state', {
        gameId: 'stones',
        view: view({ kind: 'board', pending: { teamId: 't1', teamName: '선교', stoneId: 's1' } }),
      });
    });
    expect(screen.getByText('노래 한 소절')).toBeTruthy();
    expect(screen.getByText(/선교 도전/)).toBeTruthy();

    act(() => {
      sock.fire('room:state', {
        gameId: 'stones',
        view: view({ kind: 'board', lastResult: { seq: 1, teamId: 't1', stoneId: 's1', success: true } }),
      });
    });
    expect(screen.getByText(/빨강 스톤 획득/)).toBeTruthy();

    act(() => {
      sock.fire('room:state', { gameId: 'stones', view: view({ kind: 'board', state: 'REVEAL', revealStep: 3 }) });
    });
    expect(screen.getByText(/스톤 순위 발표/)).toBeTruthy();
    expect(screen.getByText('스톤 1개')).toBeTruthy();
  });

  it('does not replay an old result when it reconnects', () => {
    render(<App />);
    const sock = sockets[0]!;
    act(() => {
      sock.fire('event:summary', summary);
      sock.fire('room:state', {
        gameId: 'stones',
        view: view({ kind: 'board', lastResult: { seq: 4, teamId: 't1', stoneId: 's1', success: true } }),
      });
    });
    expect(screen.queryByText(/획득/)).toBeNull();
  });
});

import { RulesDoc } from '../rules/RulesDoc';
import { DEFAULT_STONES } from '@soonot/stones/src/shared/constants';

describe('스톤 rules', () => {
  it('states the stone count from the engine and how ranking works', () => {
    render(<RulesDoc showQr={false} />);
    const section = document.getElementById('stones')!;
    expect(section.textContent).toContain(`기본 스톤은 ${DEFAULT_STONES.length}개`);
    expect(section.textContent).toContain('먼저 도달한');
  });
});
