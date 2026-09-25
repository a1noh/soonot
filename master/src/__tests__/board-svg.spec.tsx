// @vitest-environment jsdom
/**
 * Render tests for the 윷놀이 board SVG — locks in the mirrored orientation (말 starts
 * bottom-left, travels right) and the 출발/집 + 갈림길 labels and animated 지름길 prompt.
 * The engine graph is coordinate-free and tested elsewhere; this covers the geometry
 * the projector actually draws, which had no coverage before.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { BoardSvg } from '@soonot/yutnori/src/client/BoardSvg';
import type { BoardView } from '@soonot/yutnori/src/project';

afterEach(cleanup);

const view = (mal: { id: string; progress: number }[], turn = 't1'): BoardView =>
  ({
    kind: 'board',
    state: 'RUNNING',
    teams: [
      { id: 't1', name: '청군', roster: null, color: '#C0392B', mal, finishedAt: null },
      { id: 't2', name: '백군', roster: null, color: '#1F6FB2', mal: [], finishedAt: null },
    ],
    turnTeamId: turn,
    turnTeamName: '청군',
    throwQueue: 0,
    pending: null,
    pendingMiniGame: null,
    miniGames: [],
    remainingMs: 1000,
    paused: false,
    revealStep: 0,
    endReason: null,
    standings: [],
  }) as unknown as BoardView;

/** The viewBox translate of the 말 whose number badge reads `label`. */
function malPos(container: HTMLElement, label: string): { x: number; y: number } {
  const wrap = [...container.querySelectorAll('.board__malwrap')].find(
    (w) => w.querySelector('.board__malnum')?.textContent === label,
  ) as HTMLElement;
  const m = /translate\(([\d.]+)px,\s*([\d.]+)px\)/.exec(wrap.style.transform)!;
  return { x: Number(m[1]), y: Number(m[2]) };
}

describe('BoardSvg geometry', () => {
  it('mirrors so the 말 starts bottom-left (node 1) and travels right (node 5 further right)', () => {
    // team 청군 has two 말: at node 1 (badge "1") and node 5 (also badge "1" — same team).
    // Use two teams instead so the badges differ.
    const v = view([{ id: 't1m1', progress: 1 }]);
    v.teams[1]!.mal = [{ id: 't2m1', progress: 5 }];
    const { container } = render(<BoardSvg view={v} />);
    const start = malPos(container, '1'); // node 1 — 청군
    const corner = malPos(container, '2'); // node 5 (모) — 백군
    expect(start.x).toBeLessThan(50); // starts on the LEFT half
    expect(start.y).toBeGreaterThan(50); // at the BOTTOM
    expect(corner.x).toBeGreaterThan(start.x); // travel goes rightward
  });

  it('draws the 4 direction arrows and the 출발/집 + 갈림길 labels', () => {
    const { container } = render(<BoardSvg view={view([])} />);
    expect(container.querySelectorAll('.board__arrow')).toHaveLength(4);
    const labels = [...container.querySelectorAll('.board__glabel')].map((e) => e.textContent);
    expect(labels).toContain('출발·집');
    expect(labels.filter((t) => t === '갈림길')).toHaveLength(3); // 모, 뒷모, 방
  });

  it('pops the 지름길 prompt only when a 말 rests on a branch 밭', () => {
    const off = render(<BoardSvg view={view([{ id: 't1m1', progress: 3 }])} />);
    expect(off.container.querySelector('.board__choice')).toBeNull();
    cleanup();
    const on = render(<BoardSvg view={view([{ id: 't1m1', progress: 5 }])} />); // 모 = branch
    expect(on.container.querySelector('.board__choice')).not.toBeNull();
    expect(on.container.querySelector('.board__choicetxt')?.textContent).toBe('지름길!');
  });
});
