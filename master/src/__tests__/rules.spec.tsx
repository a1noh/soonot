// @vitest-environment jsdom
/**
 * The 규칙 문서 is a handoff artifact: VBS 꿈당 runs the event from it, so it must
 * describe the rules the engine ACTUALLY enforces. The doc imports its lists and
 * numbers from the engine rather than restating them, and these tests assert that
 * wiring holds — add a mini-game to `MINI_GAMES` and it appears here; change a
 * roll's step count and the table follows.
 *
 * Content prose is deliberately NOT asserted word-for-word; that would make the
 * doc painful to edit for no safety gain. What is pinned is every rule a leader
 * could get wrong at the table.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { RulesDoc } from '../rules/RulesDoc';
import { MINI_GAMES } from '@soonot/yutnori/src/shared/minigames';
import {
  BONUS_ROLLS,
  DUEL_GAMES,
  MINIGAME_STATIONS,
  ROLLS,
  ROLL_STEPS,
} from '@soonot/yutnori/src/shared/constants';

afterEach(cleanup);

describe('윷놀이 규칙 문서', () => {
  // 물병 세우기 is in BOTH catalogs (mini-game `bottle`, duel `bottleflip`), so every
  // list assertion is scoped to its own section rather than the whole document.
  const section = (id: string) => within(document.getElementById(id)!);

  it('lists every mini-game from the engine catalog, with its instruction', () => {
    render(<RulesDoc showQr={false} />);
    const games = section('minigames');
    for (const g of MINI_GAMES) {
      expect(games.getByRole('rowheader', { name: g.name })).toBeTruthy();
      expect(games.getAllByText(g.instruction).length).toBeGreaterThan(0);
    }
    // The count in the heading is derived, so it can never contradict the table.
    expect(screen.getByText(`미니게임 목록 · ${MINI_GAMES.length}종`)).toBeTruthy();
    // And the table holds exactly the catalog — no stale hand-typed leftovers.
    expect(games.getAllByRole('rowheader')).toHaveLength(MINI_GAMES.length);
  });

  it('lists every 1:1 대결 종목 from the engine catalog', () => {
    render(<RulesDoc showQr={false} />);
    const duels = section('duels');
    for (const g of DUEL_GAMES) {
      expect(duels.getByRole('rowheader', { name: g.name })).toBeTruthy();
    }
    expect(screen.getByText(`1:1 대결 목록 · ${DUEL_GAMES.length}종`)).toBeTruthy();
    expect(duels.getAllByRole('rowheader')).toHaveLength(DUEL_GAMES.length);
  });

  it('states each roll’s step count and which ones throw again', () => {
    render(<RulesDoc showQr={false} />);
    for (const roll of ROLLS) {
      const row = screen.getByRole('rowheader', { name: roll }).closest('tr')!;
      expect(row.textContent).toContain(`${ROLL_STEPS[roll]}칸`);
      // 윷/모 grant a bonus throw; the rest must not claim one.
      expect(row.textContent).toContain(BONUS_ROLLS.includes(roll) ? '예' : '아니오');
    }
  });

  it('accounts for every 미니게임 칸, and says how many there are', () => {
    const { container } = render(<RulesDoc showQr={false} />);
    // The stated total is derived from the array, not typed in.
    expect(screen.getByText(`${MINIGAME_STATIONS.length}곳`)).toBeTruthy();
    // Every station is shown as a chip — 방(23) by name, the rest as "N칸" — and
    // the chips are exactly the array, so none is missing or invented.
    const chips = [...container.querySelectorAll('.rules__chip')].map((el) => el.textContent);
    expect(chips).toHaveLength(MINIGAME_STATIONS.length);
    for (const n of MINIGAME_STATIONS) {
      expect(chips).toContain(n === 23 ? '방' : `${n}칸`);
    }
  });

  it('pins the rules a leader is most likely to get wrong', () => {
    const { container } = render(<RulesDoc showQr={false} />);
    const text = container.textContent ?? '';
    // 지름길 opens only on an EXACT landing — the single most-misplayed rule.
    expect(text).toContain('정확히 멈췄을 때만');
    expect(text).toContain('지나가면 열리지 않습니다');
    // No 백도 in this variant.
    expect(text).toContain('백도');
    // A fail steps back ONE 밭 — not a full revert (engine: `stepBefore`).
    expect(text).toContain('한 칸만 뒤로');
    // Endless laps: 완주 respawns the 말, so ranking is lap count.
    expect(text).toContain('대기로 돌아');
    // One bonus per catch no matter how many 말 went home.
    expect(text).toContain('추가 던지기는 한 번뿐');
    // The app never randomizes the throw.
    expect(text).toContain('앱이 굴리지 않습니다');
  });

  it('renders both parts and the troubleshooting section', () => {
    render(<RulesDoc showQr={false} />);
    expect(screen.getByRole('heading', { name: /1부 · 게임 규칙/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /2부 · 진행 순서/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /문제가 생기면/ })).toBeTruthy();
  });

  it('omits the QR when asked, and includes it by default', () => {
    const { container, unmount } = render(<RulesDoc showQr={false} />);
    expect(container.querySelector('.rules__qr')).toBeNull();
    unmount();
    const second = render(<RulesDoc />);
    expect(second.container.querySelector('.rules__qr')).toBeTruthy();
  });
});
