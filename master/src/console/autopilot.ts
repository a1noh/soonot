/**
 * The remote's 다음 ▶, like slide animations: inside a step it performs that
 * step's next action (start the video, start bingo, the 5분 timer, end bingo,
 * each reveal, the 1등 card, the 랜덤 5명, the prize …), and only when the step
 * has nothing left does it move to the next step. One button — or → / a
 * presenter clicker — runs the whole 대본.
 *
 * Pure: everything is derived from the games' state, so a tap on the game's own
 * buttons, a reload or a second console all agree on what comes next.
 */
import type { MasterView } from '@soonot/bingo/src/project.js';
import type { StonesView } from '@soonot/stones/src/project.js';
import { DEFAULT_BINGO_TRAITS } from '@soonot/bingo/src/shared/traits.js';
import {
  DEFAULT_GAMES,
  DEFAULT_PRIZES,
  DEFAULT_STONES,
  DEFAULT_TEAMS,
  DEFAULT_TIEBREAK,
  DEFAULT_TITLE,
} from '@soonot/stones/src/shared/constants.js';
import type { EventSummary } from '../event/event.js';
import { isVideo, type AutoKind, type Cue } from '../event/show.js';
import type { GameId } from '../shared/lifecycle.js';
import { drawCheck } from './BingoPane.js';

export type { AutoKind };
/** Set on the 대본's cues; lists saved before the field existed are matched by title. */
export const AUTO_LABEL: Record<AutoKind, string> = {
  'bingo-open': '빙고 시작',
  'bingo-last-call': '빙고 마감 안내 → 종료',
  'bingo-reveal': '빙고 순위 발표 · 1등 확인',
  'stones-start': '스톤 준비 · 시작',
  'stones-rounds': '스톤 라운드 (게임이 진행)',
  'stones-final': '스톤 종료 · 1위 결정전',
  'stones-podium': '스톤 순위 발표',
};
const BY_TITLE: Record<string, AutoKind> = {
  '빙고 QR 안내': 'bingo-open',
  '빙고 마감 안내': 'bingo-last-call',
  '빙고 종료 카운트다운': 'bingo-last-call', // lists saved on 2026-11-24
  '빙고 5분 마지막 기회': 'bingo-last-call', // lists saved before 2026-11-24
  '빙고 1등 공개': 'bingo-reveal',
  '어벤추수 땡스게임 메인 보드': 'stones-start',
  '스톤 게임 · 1–6라운드': 'stones-rounds',
  '최종 집계 · 타이브레이커': 'stones-final',
  '최종 시상': 'stones-podium',
};
export function autoOf(cue: Cue | null | undefined): AutoKind | null {
  if (!cue) return null;
  return (cue.auto as AutoKind | null) ?? BY_TITLE[cue.title] ?? null;
}

/** The plan of a step, for the little checklist under the title. */
export const AUTO_PLAN: Record<AutoKind, readonly string[]> = {
  'bingo-open': ['빙고 준비', '빙고 게임 시작'],
  'bingo-last-call': ['빙고 종료'],
  'bingo-reveal': ['순위 발표', '2등', '1등', '1·2·3등 함께', '1등 카드', '랜덤 5명', '1등 상품'],
  'stones-start': ['스톤 준비', '스톤 게임 시작'],
  'stones-rounds': ['1라운드', '2라운드', '3라운드', '4라운드', '5라운드', '6라운드'],
  'stones-final': ['스톤 게임 종료', '1위 결정전'],
  'stones-podium': ['순위 발표', '2위', '2위 상금', '1위', '1위 상금', '모두 함께'],
};

export interface Action {
  /** What 다음 ▶ will do, e.g. "빙고 게임 시작 (12명)". */
  label: string;
  /** Which entry of AUTO_PLAN it is (for the checklist). */
  plan?: string;
  /** Do it. Absent: nothing to press yet (see `wait`). */
  run?: () => Promise<unknown>;
  /** Shown instead when the step is waiting on something (players, a drumroll, a 결정전). */
  wait?: string;
  /** A secondary way past this action (e.g. 타이머 없이 바로 종료). */
  skip?: { label: string; run: () => Promise<unknown> };
}

export interface AutoContext {
  cue: Cue;
  event: EventSummary;
  bingo: MasterView | null;
  stones: StonesView | null;
  send(gameId: GameId, ev: string, payload?: Record<string, unknown>): Promise<unknown>;
  setTimer(seconds: number | null, label?: string): Promise<void>;
  startCue(): Promise<void>;
}

const STONES_SETUP = {
  teams: DEFAULT_TEAMS.map((name) => ({ name, playing: true })),
  stones: DEFAULT_STONES.map((name) => ({ name })),
  games: DEFAULT_GAMES.map((g) => ({ ...g })),
  tiebreak: { ...DEFAULT_TIEBREAK },
  title: DEFAULT_TITLE,
  prizes: { ...DEFAULT_PRIZES },
};

/** The step's next action, or null when the step is done (다음 goes to the next step). */
export function nextAction(ctx: AutoContext): Action | null {
  const { cue, event } = ctx;

  // A video step: ▶ 시작 is the first thing 다음 does.
  if (event.slide && event.slide.cueId === cue.id && isVideo(event.slide.media) && !event.slide.playing) {
    return { label: '영상 시작', run: ctx.startCue };
  }

  const auto = autoOf(cue);
  if (auto === 'bingo-open' || auto === 'bingo-last-call' || auto === 'bingo-reveal') return bingoAction(auto, ctx);
  if (auto === 'stones-start' || auto === 'stones-rounds' || auto === 'stones-final' || auto === 'stones-podium') return stonesAction(auto, ctx);
  return null;
}

function bingoAction(auto: AutoKind, ctx: AutoContext): Action | null {
  const b = ctx.bingo;
  if (!b) return { label: '', wait: '빙고 불러오는 중…' };
  const send = (ev: string, payload?: Record<string, unknown>) => ctx.send('bingo', ev, payload);

  if (b.state === 'SETUP') {
    return { label: '빙고 준비 (특징 25개)', plan: '빙고 준비', run: () => send('master:setTraits', { texts: [...DEFAULT_BINGO_TRAITS] }) };
  }
  if (b.state === 'LOBBY') {
    if (b.playerCount < 2) {
      return {
        label: '',
        plan: '빙고 게임 시작',
        wait: `참가자를 기다리는 중 (${b.playerCount}명) · QR로 들어와요`,
      };
    }
    return { label: `빙고 게임 시작 (${b.playerCount}명)`, plan: '빙고 게임 시작', run: () => send('master:start') };
  }
  if (auto === 'bingo-open') return null; // RUNNING: the game is on, on to the next step

  if (b.state === 'RUNNING') {
    // Ending bingo also takes down a timer still counting (시간 종료 was called).
    const end = async () => {
      if (ctx.event.projectorTimer) await ctx.setTimer(null);
      return send('master:end');
    };
    // The 마감 안내 is a sign, not a countdown: its timer is only the optional ⏱ chip.
    return { label: '빙고 종료', plan: '빙고 종료', run: end };
  }
  if (auto === 'bingo-last-call') return null; // ENDED / REVEAL: on to the 1등 공개 step

  // bingo-reveal
  if (b.state === 'ENDED') return { label: '순위 발표 (두구두구)', plan: '순위 발표', run: () => send('master:reveal', { step: 0 }) };
  const step = b.revealStep;
  if (step === 0) return { label: '', plan: '순위 발표', wait: '두구두구… 곧 3등이 나와요' };
  if (step === 1) return { label: '2등 공개', plan: '2등', run: () => send('master:reveal', { step: 2 }) };
  if (step === 2) return { label: '1등 공개', plan: '1등', run: () => send('master:reveal', { step: 3 }) };
  if (step === 3) return { label: '1·2·3등 함께 보기', plan: '1·2·3등 함께', run: () => send('master:reveal', { step: 4 }) };
  const first = b.winners.find((w) => w.rank === 1);
  if (!first) return null;
  if (ctx.event.bingoPrize) return null;
  if (ctx.event.bingoSpotlight !== first.n) {
    return { label: `1등 카드 띄우기 · ${first.name}`, plan: '1등 카드', run: () => send('projector:spotlight', { n: first.n }) };
  }
  if (!ctx.event.bingoCheck) {
    return {
      label: '랜덤 5명 확인',
      plan: '랜덤 5명',
      run: () => send('projector:check', { cells: drawCheck(first.grid) }),
      skip: { label: '확인 없이 상품으로', run: () => openPrize(send) },
    };
  }
  return { label: '1등 상품 공개', plan: '1등 상품', run: () => openPrize(send) };
}

/** The prize box lives on the podium, so the card comes down first. */
async function openPrize(send: (ev: string, payload?: Record<string, unknown>) => Promise<unknown>) {
  await send('projector:check', { cells: null });
  await send('projector:spotlight', { n: null });
  await send('projector:prize', { open: true });
}

function stonesAction(auto: AutoKind, ctx: AutoContext): Action | null {
  const s = ctx.stones;
  if (!s) return { label: '', wait: '스톤 불러오는 중…' };
  const send = (ev: string, payload?: Record<string, unknown>) => ctx.send('stones', ev, payload);

  if (s.state === 'SETUP') return { label: '스톤 게임 준비 (기본 설정)', plan: '스톤 준비', run: () => send('master:setup', STONES_SETUP) };
  if (s.state === 'LOBBY') return { label: '스톤 게임 시작', plan: '스톤 게임 시작', run: () => send('master:start') };
  if (auto === 'stones-start') return null; // RUNNING: the rounds take over
  if (auto === 'stones-rounds') {
    // The game is the path here: pick → play → winner. No 다음 while it runs.
    if (s.state !== 'RUNNING' || (!s.pending && s.played >= s.total)) return null;
    const n = s.pending ? s.pending.number : s.played + 1;
    return { label: '', plan: `${n}라운드`, wait: `${n}라운드 진행 중 · 이긴 팀에게 스톤을 주면 다음 라운드로` };
  }

  if (s.state === 'RUNNING') {
    if (s.pending) return { label: '', plan: '스톤 게임 종료', wait: `${s.pending.number}라운드 진행 중 · 이긴 팀에게 스톤을 먼저 주세요` };
    return { label: '스톤 게임 종료 · 최종 집계', plan: '스톤 게임 종료', run: () => send('master:end') };
  }
  if (s.state === 'ENDED') {
    if (s.activeTiebreak) return { label: '', plan: '1위 결정전', wait: '결정전: 들어온 순서대로 팀을 누르고 결과 확정' };
    const tie = s.tiedGroups?.[0];
    if (tie) {
      const names = tie.map((id) => s.teams.find((t) => t.id === id)?.name ?? id).join(' · ');
      return { label: `1위 결정전 · 감사 스톤 · ${names}`, plan: '1위 결정전', run: () => send('master:tiebreak:start', { teamIds: tie }) };
    }
    if (auto === 'stones-final') return null; // decided: on to 최종 시상
    return { label: '순위 발표 (두구두구)', plan: '순위 발표', run: () => send('master:reveal', { step: 0 }) };
  }
  if (auto === 'stones-final') return null;

  // stones-podium, REVEAL
  const step = s.revealStep;
  if (step === 0) return { label: '', plan: '순위 발표', wait: '두구두구… 곧 3위가 나와요' };
  if (step === 1) return { label: '2위 공개', plan: '2위', run: () => send('master:reveal', { step: 2 }) };
  // Each prize is its own beat: the name first, then its prize big under it.
  const prizeUp = (n: 2 | 3) => send('projector:podiumPrize', { step: n });
  if (step === 2 && ctx.event.podiumPrize !== 2) return { label: '2위 상금 공개', plan: '2위 상금', run: () => prizeUp(2) };
  if (step === 2) return { label: '1위 공개', plan: '1위', run: () => send('master:reveal', { step: 3 }) };
  if (step === 3 && ctx.event.podiumPrize !== 3) return { label: '1위 상금 공개', plan: '1위 상금', run: () => prizeUp(3) };
  if (step === 3) return { label: '모두 함께 보기 · 상품', plan: '모두 함께', run: () => send('master:reveal', { step: 4 }) };
  return null;
}


/**
 * ◀ 이전 — the mirror of 다음 ▶: inside a step it takes back the step's last
 * action (a reveal place, the 1등 card, 빙고 종료 …), so the projector always
 * shows what the remote says; only a step back at its start goes to the
 * previous step (null).
 */
export function prevAction(ctx: AutoContext): { label: string; run: () => Promise<unknown> } | null {
  const auto = autoOf(ctx.cue);
  const b = ctx.bingo;
  const s = ctx.stones;
  const bingo = (ev: string, payload?: Record<string, unknown>) => ctx.send('bingo', ev, payload);
  const stones = (ev: string, payload?: Record<string, unknown>) => ctx.send('stones', ev, payload);
  const REVEAL_BACK: Record<number, string> = { 4: '함께 보기 취소', 3: '1등 공개 취소', 2: '2등 공개 취소', 1: '순위 발표 취소', 0: '순위 발표 취소' };

  if (auto === 'bingo-last-call' && b?.state === 'ENDED') {
    return { label: '빙고 종료 취소 · 다시 진행', run: () => bingo('master:back') };
  }
  if (auto === 'bingo-reveal' && b) {
    if (ctx.event.bingoPrize) return { label: '1등 상품 닫기', run: () => bingo('projector:prize', { open: false }) };
    if (ctx.event.bingoCheck) return { label: '랜덤 5명 지우기', run: () => bingo('projector:check', { cells: null }) };
    if (ctx.event.bingoSpotlight !== null) return { label: '카드 내리기', run: () => bingo('projector:spotlight', { n: null }) };
    if (b.state === 'REVEAL') return { label: REVEAL_BACK[b.revealStep] ?? '순위 발표 취소', run: () => bingo('master:back') };
  }
  if (auto === 'stones-final' && s?.state === 'ENDED') {
    if (s.activeTiebreak) return { label: '결정전 취소', run: () => stones('master:tiebreak:cancel') };
    if (s.canUndoTiebreak) return { label: '결정전 결과 되돌리기', run: () => stones('master:undo') };
    return { label: '게임 종료 취소', run: () => stones('master:resumeFromEnded') };
  }
  if (auto === 'stones-podium' && s?.state === 'REVEAL') {
    if ((s.revealStep === 2 || s.revealStep === 3) && ctx.event.podiumPrize === s.revealStep) {
      return { label: `${s.revealStep === 3 ? '1위' : '2위'} 상금 닫기`, run: () => stones('projector:podiumPrize', { step: null }) };
    }
    const label = { 4: '함께 보기 취소', 3: '1위 공개 취소', 2: '2위 공개 취소' }[s.revealStep as 2 | 3 | 4] ?? '순위 발표 취소';
    // Back from 1위 lands on 2위 as it was left: with its prize showing.
    if (s.revealStep === 3) {
      return { label, run: async () => { await stones('master:back'); await stones('projector:podiumPrize', { step: 2 }); } };
    }
    return { label, run: () => stones('master:back') };
  }
  return null;
}
