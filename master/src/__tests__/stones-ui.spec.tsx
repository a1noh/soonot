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

const game1 = { id: 'g1', name: '코끼리 종이비행기', players: '2명', instructions: '코끼리 코 10바퀴 돌고 날리기' };
const game2 = { id: 'g2', name: '찬양 퀴즈', players: '모두', instructions: '전주 듣고 제목 맞히기' };

function view(o: Partial<StonesView> = {}): StonesView {
  return {
    kind: 'master',
    state: 'RUNNING',
    teams: [
      { id: 't1', name: '아이언맨', color: '#C0392B', playing: true, stoneIds: ['s2'] },
      { id: 't2', name: '헐크', color: '#1F6FB2', playing: true, stoneIds: [] },
      { id: 't3', name: '토르', color: '#1E8449', playing: false, stoneIds: [] },
    ],
    stones: [
      { id: 's1', name: '스페이스 스톤', color: '#3D7BFF', claimed: null },
      { id: 's2', name: '마인드 스톤', color: '#FFD23F', claimed: { winners: ['t1'], gameName: '코끼리 종이비행기' } },
      { id: 's3', name: '타임 스톤', color: '#22E06B', claimed: null },
    ],
    turnTeamId: 't2',
    turnTeamName: '헐크',
    round: 1,
    played: 1,
    total: 3,
    pending: null,
    lastResult: null,
    revealStep: 0,
    activeTiebreak: null,
    standings: [
      { rank: 1, teamId: 't1', teamName: '아이언맨', color: '#C0392B', playing: true, stoneIds: ['s2'] },
      { rank: 2, teamId: 't2', teamName: '헐크', color: '#1F6FB2', playing: true, stoneIds: [] },
    ],
    games: [game1, game2],
    nextGame: game2,
    blocking: false,
    canUndo: true,
    ...o,
  };
}

const board = (o: Partial<StonesView> = {}) => {
  const v = view({ kind: 'board', ...o });
  delete v.games;
  delete v.nextGame;
  delete v.blocking;
  delete v.canUndo;
  return v;
};

describe('StonesMasterPane', () => {
  it('SETUP: Avengers teams, six stones and the six games in order', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<StonesMasterPane view={view({ state: 'SETUP', teams: [], stones: [], games: undefined })} send={send} />);
    await user.click(screen.getByRole('checkbox', { name: '호크아이' })); // sit one team out of choosing
    await user.click(screen.getByRole('button', { name: /준비/ }));
    const [ev, payload] = send.mock.calls[0]!;
    expect(ev).toBe('master:setup');
    expect(payload.teams.map((t: { name: string }) => t.name)).toEqual(['아이언맨', '헐크', '캡틴 아메리카', '토르', '블랙 위도우', '호크아이']);
    expect(payload.teams.at(-1).playing).toBe(false);
    expect(payload.stones).toHaveLength(6);
    expect(payload.games.map((g: { name: string; players: string }) => `${g.name}/${g.players}`)).toEqual([
      '타노스 격추 작전/2명',
      '그루트 노래방/모두',
      '닥터 스트레인지의 선택/모두',
      '앤트맨 돋보기/모두',
      '스파이더맨 아재개그/모두',
      '어벤져스 어셈블/3명',
    ]);
    expect(payload.games.every((g: { instructions: string }) => g.instructions.length > 20)).toBe(true);
    expect(payload.tiebreak).toMatchObject({ name: '엔드게임', players: '모두' });
    expect(payload.tiebreak.instructions).toContain('컵 멀리 놓기');
  });

  it('RUNNING: shows the next game to the master only, and a played stone cannot be picked', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<StonesMasterPane view={view()} send={send} />);
    expect(screen.getByText(/화면엔 안 보여요/)).toBeTruthy();
    expect(screen.getByText(/2\. 찬양 퀴즈/)).toBeTruthy();
    const group = screen.getByRole('group', { name: /헐크 팀이 고를 스톤/ });
    expect(within(group).getByRole('button', { name: /마인드 스톤/ })).toHaveProperty('disabled', true);
    await user.click(within(group).getByRole('button', { name: /타임 스톤/ }));
    expect(send).toHaveBeenCalledWith('master:pick', { stone: 's3' });
  });

  it('a pending pick shows the game; ticked winners get the stone', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const pending = { chooserId: 't2', chooserName: '헐크', stoneId: 's3', game: game2, number: 2 };
    render(<StonesMasterPane view={view({ pending, blocking: true })} send={send} />);
    expect(screen.getByText('전주 듣고 제목 맞히기')).toBeTruthy();
    expect(screen.getByText('팀 전원')).toBeTruthy();
    const pick = within(screen.getByRole('group', { name: /이긴 팀/ }));
    await user.click(pick.getByRole('checkbox', { name: '아이언맨' }));
    await user.click(pick.getByRole('checkbox', { name: '토르' }));
    await user.click(screen.getByRole('button', { name: '2팀에게 스톤 주기' }));
    expect(send).toHaveBeenCalledWith('master:resolve', { winners: ['t1', 't3'] });
    expect(screen.getByRole('button', { name: '건너뛰기' })).toHaveProperty('disabled', true);
  });

  it('toggling a team out of choosing sends master:playing', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<StonesMasterPane view={view()} send={send} />);
    await user.click(within(screen.getByRole('region', { name: '참가 팀' })).getByRole('checkbox', { name: /아이언맨/ }));
    expect(send).toHaveBeenCalledWith('master:playing', { team: 't1', playing: false });
  });
});


const endgame = { id: 'tb', name: '엔드게임', players: '모두', instructions: '컵 멀리 놓기! 선을 넘지 마세요.' };

describe('동점 결정전 on the console', () => {
  const ended = (o: Partial<StonesView> = {}) =>
    view({
      state: 'ENDED',
      tiebreak: endgame,
      tiedGroups: [['t1', 't2']],
      standings: [
        { rank: 1, teamId: 't1', teamName: '아이언맨', color: '#C0392B', playing: true, stoneIds: ['s2'] },
        { rank: 1, teamId: 't2', teamName: '헐크', color: '#1F6FB2', playing: true, stoneIds: ['s1'] },
      ],
      ...o,
    });

  it('marks the tie and opens 엔드게임 for that group', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<StonesMasterPane view={ended()} send={send} />);
    expect(screen.getByText('공동 1위')).toBeTruthy();
    expect(screen.getAllByText('동점').length).toBe(2);
    await user.click(screen.getByRole('button', { name: /동점 결정전 · 엔드게임/ }));
    expect(send).toHaveBeenCalledWith('master:tiebreak:start', { teamIds: ['t1', 't2'] });
  });

  it('tap teams in finishing order, then 결과 확정', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const active = {
      teams: [
        { id: 't1', name: '아이언맨', color: '#C0392B' },
        { id: 't2', name: '헐크', color: '#1F6FB2' },
      ],
      game: endgame,
    };
    render(<StonesMasterPane view={ended({ activeTiebreak: active })} send={send} />);
    expect(screen.getByText('컵 멀리 놓기! 선을 넘지 마세요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '순위 발표' })).toHaveProperty('disabled', true);
    const confirmBtn = screen.getByRole('button', { name: '결과 확정' });
    expect(confirmBtn).toHaveProperty('disabled', true);
    await user.click(screen.getByRole('button', { name: /헐크/ }));
    await user.click(screen.getByRole('button', { name: /아이언맨/ }));
    await user.click(confirmBtn);
    expect(send).toHaveBeenCalledWith('master:tiebreak:resolve', { order: ['t2', 't1'] });
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

  it('shows the ring and rankings, then the game behind the stone, then the podium', () => {
    render(<App />);
    const sock = sockets[0]!;
    act(() => {
      sock.fire('connect');
      sock.fire('event:summary', summary);
      sock.fire('room:state', { gameId: 'stones', view: board() });
    });
    expect(screen.getByLabelText('순위')).toBeTruthy();
    expect(screen.getAllByText('스페이스 스톤').length).toBeGreaterThan(0);
    expect(screen.getByText('스톤을 하나 고르세요')).toBeTruthy();

    act(() => {
      sock.fire('room:state', {
        gameId: 'stones',
        view: board({ pending: { chooserId: 't2', chooserName: '헐크', stoneId: 's3', game: game2, number: 2 } }),
      });
    });
    expect(screen.getByText('찬양 퀴즈')).toBeTruthy();
    expect(screen.getByText('팀 전원')).toBeTruthy();
    expect(screen.getByText(/헐크 선택 · 모든 팀이 도전해요/)).toBeTruthy();

    act(() => {
      sock.fire('room:state', {
        gameId: 'stones',
        view: board({ lastResult: { seq: 1, stoneId: 's3', gameId: 'g2', winners: ['t1', 't2'] } }),
      });
    });
    expect(screen.getByText(/아이언맨 · 헐크/)).toBeTruthy();

    act(() => {
      sock.fire('room:state', {
        gameId: 'stones',
        view: board({ lastResult: { seq: 2, stoneId: 's1', gameId: 'g3', winners: [] } }),
      });
    });
    expect(screen.getByText(/아무 팀도 스페이스 스톤을 얻지 못했어요/)).toBeTruthy();

    act(() => {
      sock.fire('room:state', { gameId: 'stones', view: board({ state: 'REVEAL', revealStep: 3 }) });
    });
    expect(screen.getByText(/스톤 순위 발표/)).toBeTruthy();
    expect(screen.getByText('스톤 1개')).toBeTruthy();
  });

  it('shows 엔드게임 while a 결정전 is open, then the podium', () => {
    render(<App />);
    const sock = sockets[0]!;
    const active = {
      teams: [
        { id: 't1', name: '아이언맨', color: '#C0392B' },
        { id: 't2', name: '헐크', color: '#1F6FB2' },
      ],
      game: endgame,
    };
    act(() => {
      sock.fire('event:summary', summary);
      sock.fire('room:state', { gameId: 'stones', view: board({ state: 'ENDED', activeTiebreak: active }) });
    });
    expect(screen.getByText('엔드게임')).toBeTruthy();
    expect(screen.getByText(/동점 결정전 · 공동/)).toBeTruthy();
    expect(screen.getByText('컵 멀리 놓기! 선을 넘지 마세요.')).toBeTruthy();
    act(() => {
      sock.fire('room:state', { gameId: 'stones', view: board({ state: 'ENDED' }) });
    });
    expect(screen.getByText(/스톤 순위 발표/)).toBeTruthy();
  });

  it('does not replay an old result when it reconnects', () => {
    render(<App />);
    const sock = sockets[0]!;
    act(() => {
      sock.fire('event:summary', summary);
      sock.fire('room:state', {
        gameId: 'stones',
        view: board({ lastResult: { seq: 4, stoneId: 's1', gameId: 'g1', winners: ['t1'] } }),
      });
    });
    expect(screen.queryByText(/획득/)).toBeNull();
  });
});

import { RulesDoc } from '../rules/RulesDoc';
import { DEFAULT_STONES } from '@soonot/stones/src/shared/constants';

describe('스톤 rules', () => {
  it('states the stone count and ranking, and keeps the game order secret', () => {
    render(<RulesDoc showQr={false} />);
    const section = document.getElementById('stones')!;
    expect(section.textContent).toContain(`스톤 ${DEFAULT_STONES.length}개`);
    // The page is public: the secret game order must not be on it.
    expect(section.textContent).not.toContain('타노스');
    expect(section.textContent).toContain('컵 멀리 놓기');
    expect(section.textContent).not.toContain('코끼리');
  });
});
