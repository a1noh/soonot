// @vitest-environment jsdom
/**
 * UI tests for the two master console panes — rendered as real React, clicked
 * with real pointer events. Both panes are pure (view + send props), so these
 * assert that what the master sees and taps produces the right game action.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { YutnoriMasterPane } from '@soonot/yutnori/src/client/MasterPane';
import type { BoardView } from '@soonot/yutnori/src/project';
import { BingoMasterPane } from '../console/BingoPane';
import type { MasterView } from '@soonot/bingo/src/project';
import { CELLS } from '@soonot/bingo/src/shared/constants';

afterEach(cleanup);

const boardView = (o: Partial<BoardView> = {}): BoardView => ({
  kind: 'master',
  state: 'SETUP',
  teams: [],
  turnTeamId: null,
  turnTeamName: null,
  throwQueue: 0,
  pending: null,
  pendingMiniGame: null,
  miniGames: [],
  remainingMs: 1_200_000,
  paused: false,
  revealStep: 0,
  endReason: null,
  standings: [],
  blocking: false,
  canUndo: false,
  ...o,
});

const bingoView = (o: Partial<MasterView> = {}): MasterView => ({
  kind: 'master',
  state: 'SETUP',
  playerCount: 0,
  connectedCount: 0,
  bingoCount: 0,
  startedAt: null,
  endedAt: null,
  revealStep: 0,
  traitCount: 0,
  standings: [],
  roster: [],
  leaders: [],
  ...o,
});

describe('YutnoriMasterPane (윷놀이 console)', () => {
  it('SETUP: submitting the team form sends master:setup with the typed teams', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<YutnoriMasterPane view={boardView({ state: 'SETUP' })} send={send} />);

    await user.click(screen.getByRole('button', { name: /준비 완료/ }));
    expect(send).toHaveBeenCalledWith('master:setup', expect.objectContaining({ malPerTeam: 2, timeLimitMin: expect.any(Number) }));
    const teams = send.mock.calls[0]![1].teams;
    expect(teams).toHaveLength(3); // the default three teams
  });

  it('RUNNING: tapping a throw result sends master:throw', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(
      <YutnoriMasterPane
        view={boardView({ state: 'RUNNING', turnTeamName: 'A조', throwQueue: 1 })}
        send={send}
      />,
    );
    await user.click(screen.getByRole('button', { name: '개' }));
    expect(send).toHaveBeenCalledWith('master:throw', { roll: '개' });
  });

  it('a move candidate is labelled with which 말 moves and to where', () => {
    render(
      <YutnoriMasterPane
        view={boardView({
          state: 'RUNNING',
          turnTeamName: 'A조',
          throwQueue: 0,
          pending: {
            teamId: 't1',
            roll: '걸',
            candidates: [{ malId: 't1m2', from: 6, to: 8, captures: [], finishes: false }] as never,
          },
        })}
        send={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: /말 2/ });
    expect(btn.textContent).toContain('6칸');
    expect(btn.textContent).toContain('8칸');
  });

  it('MINIGAME: judging 실패 sends master:minigame:resolve success:false', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(
      <YutnoriMasterPane
        view={boardView({
          state: 'RUNNING',
          turnTeamName: 'A조',
          // gameId already spun, so the judge buttons are shown.
          pendingMiniGame: { teamId: 't1', teamName: 'A조', station: 8, gameId: 'jegi' },
        })}
        send={send}
      />,
    );
    await user.click(screen.getByRole('button', { name: /실패/ }));
    expect(send).toHaveBeenCalledWith('master:minigame:resolve', { success: false });
  });

  it('RUNNING: tapping a move candidate sends master:move with its malId', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(
      <YutnoriMasterPane
        view={boardView({
          state: 'RUNNING',
          turnTeamName: 'A조',
          throwQueue: 0,
          pending: {
            teamId: 't1',
            roll: '걸',
            candidates: [{ malId: 't1m1', from: 0, to: 3, captures: [], finishes: false }] as never,
          },
        })}
        send={send}
      />,
    );
    await user.click(screen.getByRole('button', { name: /3칸/ }));
    expect(send).toHaveBeenCalledWith('master:move', { malId: 't1m1', to: 3 });
  });
});

describe('BingoMasterPane (빙고 console)', () => {
  it('SETUP: the default traits are ready and submit sends master:setTraits', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<BingoMasterPane view={bingoView({ state: 'SETUP' })} send={send} />);

    const submit = screen.getByRole('button', { name: /개로 준비 완료/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    await user.click(submit);
    expect(send).toHaveBeenCalledWith('master:setTraits', expect.objectContaining({ texts: expect.any(Array) }));
    expect(send.mock.calls[0]![1].texts).toHaveLength(CELLS);
  });

  it('LOBBY: start is enabled at 2+ players and sends master:start', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<BingoMasterPane view={bingoView({ state: 'LOBBY', playerCount: 3, traitCount: CELLS })} send={send} />);
    await user.click(screen.getByRole('button', { name: /게임 시작/ }));
    expect(send).toHaveBeenCalledWith('master:start');
  });

  it('LOBBY: start is disabled with fewer than 2 players', () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    render(<BingoMasterPane view={bingoView({ state: 'LOBBY', playerCount: 1, traitCount: CELLS })} send={send} />);
    expect((screen.getByRole('button', { name: /게임 시작/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('RUNNING: the live dashboard renders bingo leaders', () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    render(
      <BingoMasterPane
        view={bingoView({
          state: 'RUNNING',
          playerCount: 10,
          connectedCount: 9,
          bingoCount: 1,
          traitCount: CELLS,
          leaders: [{ n: 7, name: '민수', at: 1, lines: 2 }],
        })}
        send={send}
      />,
    );
    expect(screen.getByText('민수')).toBeTruthy();
    expect(screen.getByText(/2줄/)).toBeTruthy();
  });
});
