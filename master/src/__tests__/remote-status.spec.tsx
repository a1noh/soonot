// @vitest-environment jsdom
/** The remote's 빙고 status at the reveal: any of the top 3 can be shown on the projector. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BingoStatus } from '../console/RemoteStatus';

afterEach(cleanup);

const grid = (who: string) => Array.from({ length: 25 }, (_, i) => ({ name: i < 8 ? `${who}${i}` : null, number: i, trait: `특징${i}` }));
const winner = (rank: number, n: number, name: string) => ({ rank, n, name, lines: 4 - rank, points: 30 - rank, matched: [{}], grid: grid(name) });
const view = {
  state: 'REVEAL', revealStep: 4, playerCount: 12, connectedCount: 12, bingoCount: 5, leaders: [],
  winners: [winner(1, 1, '민지'), winner(2, 2, '지은'), winner(3, 3, '철수')],
} as never;

describe('빙고 status · 카드 보기', () => {
  it('shows any of the top 3 cards, draws 5 names from that card, and takes it down', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const { rerender } = render(<BingoStatus view={view} spotlight={null} check={null} send={send} />);
    expect(screen.getAllByRole('button', { name: /카드 보기/ })).toHaveLength(3);
    await user.click(screen.getAllByRole('button', { name: /카드 보기/ })[1]!);
    expect(send).toHaveBeenCalledWith('projector:spotlight', { n: 2 });

    rerender(<BingoStatus view={view} spotlight={2} check={null} send={send} />);
    await user.click(screen.getByRole('button', { name: /랜덤 5명/ }));
    const cells = send.mock.calls.at(-1)![1].cells as number[];
    expect(cells).toHaveLength(5);

    rerender(<BingoStatus view={view} spotlight={2} check={cells} send={send} />);
    expect(screen.getByText(/지은의 카드/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '카드 내리기' }));
    expect(send).toHaveBeenLastCalledWith('projector:spotlight', { n: null });
  });
});
