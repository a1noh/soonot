/**
 * 다음 ▶ inside a step: the remote's autopilot walks the 빙고 and 스톤 steps
 * action by action, and only an empty plan moves to the next step.
 */
import { describe, expect, it, vi } from 'vitest';
import { enterAction, leaveBackAction, nextAction, prevAction, type AutoContext } from '../console/autopilot';
import { defaultCues } from '../event/show';
import type { EventSummary } from '../event/event';

const cue = (title: string) => defaultCues().find((c) => c.title === title)!;
const event = (o: Partial<EventSummary> = {}): EventSummary =>
  ({
    id: 'e', code: 'ABCD', title: 't', projector: 'auto', projectorLock: null,
    bingoSpotlight: null, bingoPrize: false, bingoCheck: null, projectorTimer: null,
    slide: null, bgm: null, screenTransition: 'fade', muted: false, liveCue: null, serverNow: 0,
    games: {} as EventSummary['games'], ...o,
  }) as EventSummary;

function ctx(title: string, o: Partial<AutoContext> = {}): AutoContext & { send: ReturnType<typeof vi.fn>; setTimer: ReturnType<typeof vi.fn> } {
  return {
    cue: cue(title),
    event: event(),
    bingo: null,
    stones: null,
    send: vi.fn().mockResolvedValue({ ok: true }),
    setTimer: vi.fn().mockResolvedValue(undefined),
    startCue: vi.fn().mockResolvedValue(undefined),
    ...o,
  } as never;
}
const bingo = (o: Record<string, unknown>) => ({ state: 'LOBBY', playerCount: 12, revealStep: 0, winners: [], ...o }) as never;

describe('다음 ▶ in the 빙고 steps', () => {
  it('빙고 QR 안내: 준비 → 시작 (waits for 2 players) → done', async () => {
    const setup = ctx('빙고 QR 안내', { bingo: bingo({ state: 'SETUP' }) });
    const a = nextAction(setup)!;
    expect(a.label).toMatch(/빙고 준비/);
    await a.run!();
    expect(setup.send).toHaveBeenCalledWith('bingo', 'master:setTraits', expect.objectContaining({ texts: expect.any(Array) }));

    expect(nextAction(ctx('빙고 QR 안내', { bingo: bingo({ playerCount: 1 }) }))!.wait).toMatch(/기다리는 중/);
    expect(nextAction(ctx('빙고 QR 안내', { bingo: bingo({}) }))!.label).toBe('빙고 게임 시작 (12명)');
    expect(nextAction(ctx('빙고 QR 안내', { bingo: bingo({ state: 'RUNNING' }) }))).toBeNull();
  });

  it('마감 안내: a sign with no tap of its own — ▶ goes straight on (빙고 종료 happens as 1등 공개 opens)', () => {
    expect(nextAction(ctx('빙고 마감 안내', { bingo: bingo({ state: 'RUNNING' }) }))).toBeNull();
    expect(nextAction(ctx('빙고 마감 안내', { bingo: bingo({ state: 'ENDED' }) }))).toBeNull();
    // Reached 1등 공개 by a jump with bingo still on: one tap ends it and starts the reveal.
    expect(nextAction(ctx('빙고 1등 공개', { bingo: bingo({ state: 'RUNNING' }) }))!.label).toBe('빙고 종료 · 순위 발표');
  });

  it('1등 공개: (drumroll) → 2등 → 1등 → 카드 → 랜덤 5명 → 상품 → done', async () => {
    const winner = { rank: 1, n: 7, name: '지훈', grid: Array.from({ length: 25 }, (_, i) => ({ name: i < 10 ? `p${i}` : null })) };
    const at = (o: Record<string, unknown>, e: Partial<EventSummary> = {}) =>
      nextAction(ctx('빙고 1등 공개', { bingo: bingo({ winners: [winner], ...o }), event: event(e) }));
    expect(at({ state: 'ENDED' })!.label).toMatch(/순위 발표/);
    expect(at({ state: 'REVEAL', revealStep: 0 })!.wait).toMatch(/두구두구/);
    expect(at({ state: 'REVEAL', revealStep: 1 })!.label).toBe('2등 공개');
    expect(at({ state: 'REVEAL', revealStep: 2 })!.label).toBe('1등 공개');
    // No 1·2·3등 together screen (수정사항): from 1등 straight to the card.
    expect(at({ state: 'REVEAL', revealStep: 3 })!.label).toBe('1등 카드 띄우기 · 지훈');
    expect(at({ state: 'REVEAL', revealStep: 4 }, { bingoSpotlight: 7 })!.label).toBe('랜덤 5명 확인');
    const prize = ctx('빙고 1등 공개', { bingo: bingo({ state: 'REVEAL', revealStep: 4, winners: [winner] }), event: event({ bingoSpotlight: 7, bingoCheck: [0, 1, 2, 3, 4] }) });
    const p = nextAction(prize)!;
    expect(p.label).toBe('1등 상품 공개');
    await p.run!();
    expect(prize.send).toHaveBeenLastCalledWith('bingo', 'projector:prize', { open: true });
    expect(at({ state: 'REVEAL', revealStep: 4 }, { bingoSpotlight: null, bingoPrize: true })).toBeNull();
  });
});

describe('다음 ▶ in the 스톤 steps', () => {
  const stones = (o: Record<string, unknown>) =>
    ({ state: 'RUNNING', pending: null, played: 6, total: 6, revealStep: 0, teams: [{ id: 't1', name: '토르' }, { id: 't2', name: '헐크' }], tiedGroups: [], activeTiebreak: null, ...o }) as never;

  it('메인 보드: (reached by a jump) 준비 → 시작 → done (the rounds take over)', () => {
    expect(nextAction(ctx('어벤추수 땡스게임 메인 보드', { stones: stones({ state: 'SETUP' }) }))!.label).toMatch(/스톤 게임 준비/);
    expect(nextAction(ctx('어벤추수 땡스게임 메인 보드', { stones: stones({ state: 'LOBBY' }) }))!.label).toBe('스톤 게임 시작');
    expect(nextAction(ctx('어벤추수 땡스게임 메인 보드', { stones: stones({ played: 0 }) }))).toBeNull();
  });

  it('최종 집계: 종료 → 1위 결정전 (wait for the order) → done', () => {
    const final = (o: Record<string, unknown>) => nextAction(ctx('최종 집계 · 타이브레이커', { stones: stones(o) }));
    expect(final({ pending: { number: 6 } })!.wait).toMatch(/스톤을 먼저/);
    expect(final({})!.label).toMatch(/게임 종료/);
    expect(final({ state: 'ENDED', tiedGroups: [['t1', 't2']] })!.label).toBe('1위 결정전 · 감사 스톤 · 토르 · 헐크');
    expect(final({ state: 'ENDED', activeTiebreak: { teams: [] } })!.wait).toMatch(/결과 확정/);
    expect(final({ state: 'ENDED' })).toBeNull();
  });

  it('최종 시상: 발표 → (drumroll) → 2위 → 2위 상금 → 1위 → 1위 상금 → 함께 → done', async () => {
    const podium = (o: Record<string, unknown>, e: Partial<EventSummary> = {}) =>
      nextAction(ctx('최종 시상', { stones: stones(o), event: event(e) }));
    expect(podium({ state: 'ENDED' })!.label).toMatch(/순위 발표/);
    expect(podium({ state: 'REVEAL', revealStep: 0 })!.wait).toMatch(/두구두구/);
    expect(podium({ state: 'REVEAL', revealStep: 1 })!.label).toBe('2위 공개');
    expect(podium({ state: 'REVEAL', revealStep: 2 })!.label).toBe('2위 상금 공개');
    expect(podium({ state: 'REVEAL', revealStep: 2 }, { podiumPrize: 2 })!.label).toBe('1위 공개');
    expect(podium({ state: 'REVEAL', revealStep: 3 }, { podiumPrize: 2 })!.label).toBe('1위 상금 공개');
    expect(podium({ state: 'REVEAL', revealStep: 3 }, { podiumPrize: 3 })!.label).toMatch(/모두 함께/);
    expect(podium({ state: 'REVEAL', revealStep: 4 })).toBeNull();

    const c = ctx('최종 시상', { stones: stones({ state: 'REVEAL', revealStep: 3 }) });
    await nextAction(c)!.run!();
    expect(c.send).toHaveBeenCalledWith('stones', 'projector:podiumPrize', { step: 3 });
  });
});

describe('다음 ▶ on a video step', () => {
  it('has no tap of its own: entering started it, so ▶ moves on (even after ◀ back onto it)', () => {
    const c = cue('MC 등장 영상 · 타이틀');
    expect(nextAction(ctx(c.title, { event: event({ slide: { cueId: c.id, title: c.title, body: '', media: c.media, layout: '', transition: 'zoom', playing: false, startedAt: 0 } }) }))).toBeNull();
  });
});

describe('◀ 이전 mirrors 다음 ▶ inside a step', () => {
  const winner = { rank: 1, n: 7, name: '지훈', grid: [] };
  const at = (o: Record<string, unknown>, e: Partial<EventSummary> = {}) =>
    prevAction(ctx('빙고 1등 공개', { bingo: bingo({ winners: [winner], ...o }), event: event(e) }));

  it('빙고 1등 공개: 상품 → 5명 → 카드 → 1등 → 2등, then (3등 = where entering left it) the step before', () => {
    expect(at({ state: 'REVEAL', revealStep: 4 }, { bingoPrize: true })!.label).toBe('1등 상품 닫기');
    expect(at({ state: 'REVEAL', revealStep: 4 }, { bingoCheck: [1] })!.label).toBe('랜덤 5명 지우기');
    expect(at({ state: 'REVEAL', revealStep: 4 }, { bingoSpotlight: 7 })!.label).toBe('카드 내리기');
    expect(at({ state: 'REVEAL', revealStep: 3 })!.label).toBe('1등 공개 취소');
    expect(at({ state: 'REVEAL', revealStep: 2 })!.label).toBe('2등 공개 취소');
    expect(at({ state: 'REVEAL', revealStep: 1 })).toBeNull();
    expect(at({ state: 'REVEAL', revealStep: 0 })).toBeNull();
    expect(at({ state: 'ENDED' })).toBeNull();
  });

  it('마감 안내: 빙고 종료 is taken back (bingo runs again)', async () => {
    const c = ctx('빙고 마감 안내', { bingo: bingo({ state: 'ENDED' }) });
    const u = prevAction(c)!;
    expect(u.label).toMatch(/빙고 종료 취소/);
    await u.run();
    expect(c.send).toHaveBeenCalledWith('bingo', 'master:back', undefined);
    expect(prevAction(ctx('빙고 마감 안내', { bingo: bingo({ state: 'RUNNING' }) }))).toBeNull();
  });

  it('최종 집계 / 시상: 결정전, 게임 종료 and each podium place step back', () => {
    const st = (o: Record<string, unknown>) => ({ state: 'ENDED', revealStep: 0, teams: [], ...o }) as never;
    expect(prevAction(ctx('최종 집계 · 타이브레이커', { stones: st({ activeTiebreak: {} }) }))!.label).toBe('결정전 취소');
    expect(prevAction(ctx('최종 집계 · 타이브레이커', { stones: st({ canUndoTiebreak: true }) }))!.label).toBe('결정전 결과 되돌리기');
    expect(prevAction(ctx('최종 집계 · 타이브레이커', { stones: st({}) }))!.label).toBe('게임 종료 취소');
    expect(prevAction(ctx('최종 시상', { stones: st({ state: 'REVEAL', revealStep: 3 }) }))!.label).toBe('1위 공개 취소');
    expect(prevAction(ctx('최종 시상', { stones: st({ state: 'REVEAL', revealStep: 3 }), event: event({ podiumPrize: 3 }) }))!.label).toBe('1위 상금 닫기');
    expect(prevAction(ctx('최종 시상', { stones: st({ state: 'REVEAL', revealStep: 2 }), event: event({ podiumPrize: 2 }) }))!.label).toBe('2위 상금 닫기');
    expect(prevAction(ctx('최종 시상', { stones: st({}) }))).toBeNull();
  });
});

describe('▶ into a step does its first visible beat; ◀ at its start takes it back', () => {
  const stones = (o: Record<string, unknown>) =>
    ({ state: 'RUNNING', pending: null, played: 0, total: 6, revealStep: 0, teams: [], tiedGroups: [], activeTiebreak: null, ...o }) as never;
  const into = (title: string, o: Partial<AutoContext>) => enterAction(cue(title), ctx(title, o));

  it('빙고 QR: traits are set as the step opens, so phones can join at once', async () => {
    const c = ctx('빙고 QR 안내', { bingo: bingo({ state: 'SETUP' }) });
    const e = enterAction(cue('빙고 QR 안내'), c)!;
    await e.run();
    expect(c.send).toHaveBeenCalledWith('bingo', 'master:setTraits', expect.objectContaining({ texts: expect.any(Array) }));
    expect(into('빙고 QR 안내', { bingo: bingo({ state: 'LOBBY' }) })).toBeNull();
  });

  it('영상: the video starts as the step opens', async () => {
    const c = ctx('MC 등장 영상 · 타이틀', {});
    await enterAction(cue('MC 등장 영상 · 타이틀'), c)!.run();
    expect(c.startCue).toHaveBeenCalled();
  });

  it('빙고 1등 공개: entering ends bingo (and any ⏱) and starts the drumroll; ◀ undoes both', async () => {
    const c = ctx('빙고 1등 공개', { bingo: bingo({ state: 'RUNNING' }), event: event({ projectorTimer: { label: 'x', totalMs: 1, endsAt: 0 } }) });
    await enterAction(cue('빙고 1등 공개'), c)!.run();
    expect(c.setTimer).toHaveBeenCalledWith(null);
    expect(c.send.mock.calls.map((x) => x[1])).toEqual(['master:end', 'master:reveal']);

    const back = ctx('빙고 1등 공개', { bingo: bingo({ state: 'REVEAL', revealStep: 1 }) });
    await leaveBackAction(cue('빙고 1등 공개'), back)!();
    expect(back.send.mock.calls.map((x) => x[1])).toEqual(['master:back', 'master:back']);
  });

  it('메인 보드: entering sets up and starts 스톤 (no waiting screen); ◀ before any pick resets it', async () => {
    const c = ctx('어벤추수 땡스게임 메인 보드', { stones: stones({ state: 'SETUP' }) });
    await enterAction(cue('어벤추수 땡스게임 메인 보드'), c)!.run();
    expect(c.send.mock.calls.map((x) => x[1])).toEqual(['master:setup', 'master:start']);
    const back = ctx('어벤추수 땡스게임 메인 보드', { stones: stones({}) });
    await leaveBackAction(cue('어벤추수 땡스게임 메인 보드'), back)!();
    expect(back.send).toHaveBeenCalledWith('stones', 'game:reset', undefined);
    expect(leaveBackAction(cue('어벤추수 땡스게임 메인 보드'), ctx('x', { stones: stones({ played: 1 }) }))).toBeNull();
  });

  it('최종 시상: entering starts the drumroll (only once the 1위 is decided); ◀ at 3위 leaves the reveal', async () => {
    expect(into('최종 시상', { stones: stones({ state: 'ENDED', tiedGroups: [['a', 'b']] }) })).toBeNull();
    const c = ctx('최종 시상', { stones: stones({ state: 'ENDED' }) });
    await enterAction(cue('최종 시상'), c)!.run();
    expect(c.send).toHaveBeenCalledWith('stones', 'master:reveal', { step: 0 });
    expect(prevAction(ctx('최종 시상', { stones: stones({ state: 'REVEAL', revealStep: 1 }) }))).toBeNull();
    const back = ctx('최종 시상', { stones: stones({ state: 'REVEAL', revealStep: 1 }) });
    await leaveBackAction(cue('최종 시상'), back)!();
    expect(back.send).toHaveBeenCalledWith('stones', 'master:back', undefined);
  });

  it('slides with nothing to do have no entry beat', () => {
    expect(into('게임 방식 · 우승 조건', {})).toBeNull();
    expect(into('감사합니다', {})).toBeNull();
  });
});
