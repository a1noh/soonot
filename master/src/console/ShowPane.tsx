/**
 * 진행 순서 — the console's remote control for the MC script.
 *
 * One step at a time: the step on air, its MC note, and only the buttons that
 * step needs — ▶ 시작 for a video or BGM, its timer, and the controls of the
 * game it runs alongside (빙고 or 스톤). ◀ 이전 / 다음 ▶ (or ← → / a presenter
 * clicker) move through the script. Editing the list lives behind 순서 편집.
 *
 * A slide with no file shows a placeholder title card on the projector, and a
 * BGM with no file says "음원 없음" here so the MC plays it by hand — the show
 * runs tonight even if half the slides are not made yet.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { EventSummary } from '../event/event.js';
import { FOUR_CHOICE } from '../event/quiz.js';
import { MediaRoundPanel, TrackPanel, WordsPanel } from './RoundMedia.js';
import { controlsOf, defaultCues, isVideo, ROUNDS, TIEBREAK_TIMER, trackTitle, TRANSITIONS, type Cue, type Transition } from '../event/show.js';
import { GAME_IDS, type GameId } from '../shared/lifecycle.js';
import { formatLeft, useCountdown } from '../shared/countdown.js';
import { t } from '../shared/i18n.js';
import type { StonesView } from '@soonot/stones/src/project.js';
import type { MasterView } from '@soonot/bingo/src/project.js';
import { AUTO_PLAN, autoOf, enterAction, leaveBackAction, nextAction, prevAction } from './autopilot.js';

export interface ShowPaneProps {
  event: EventSummary;
  /** Is this tab on screen? Keyboard shortcuts only listen while it is. */
  active: boolean;
  saveCues(cues: Cue[]): Promise<void>;
  goCue(id: string): Promise<void>;
  startCue(): Promise<void>;
  clearSlide(): Promise<void>;
  bgm(action: 'play' | 'pause' | 'restart' | 'stop' | null, volume?: number): Promise<void>;
  setTimer(seconds: number | null, label?: string): Promise<void>;
  /** Music for what is on now inside a step (each 스톤 round's track). */
  setMusic?(name: string, url: string): Promise<void>;
  /** ↺ 전체 초기화 — the whole evening back to the start. */
  restartEvent?(): Promise<void>;
  /** The game's console controls for this step, embedded on the steps that need them. */
  renderGame(gameId: GameId, cue: Cue): ReactNode;
  /** For 다음 ▶'s in-step actions: the bingo view and a way to send game actions. */
  game?: { bingo: MasterView | null; send(gameId: GameId, ev: string, payload?: Record<string, unknown>): Promise<unknown> };
  /** The 스톤 game, which drives the round steps (and is rewound by ◀ 이전). */
  stones?: { view: StonesView | null; rewind(round: number): Promise<unknown> };
}

/** What rewinding 스톤 to round N takes back, in words; empty when nothing would change. */
function rewindLoss(view: StonesView | null | undefined, round: number): string[] {
  if (!view || !(view.state === 'RUNNING' || (view.state === 'ENDED' && view.revealStep === 0))) return [];
  if (view.played <= round - 1) return [];
  const out: string[] = [];
  const names = (ids: string[]) => ids.map((id) => view.teams.find((tm) => tm.id === id)?.name ?? id).join(' · ') || '이긴 팀 없음';
  for (let i = round - 1; i < view.played; i++) {
    const game = view.games?.[i];
    const stone = view.stones.find((st) => st.claimed && st.claimed.gameName === game?.name);
    out.push(`${i + 1}라운드 결과 (${stone ? `${stone.name} → ${names(stone.claimed!.winners)}` : game?.name ?? ''})`);
  }
  if (view.pending) out.push(`${view.pending.number}라운드 스톤 선택`);
  if (view.state === 'ENDED') out.push('게임 종료');
  return out;
}

const TRANSITION_LABEL: Record<Transition, string> = { fade: '페이드', zoom: '줌', slide: '밀기', cut: '바로' };

/** 300 → "5분", 20 → "20초", 90 → "1분 30초". */
function secondsLabel(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m && r ? `${m}분 ${r}초` : m ? `${m}분` : `${r}초`;
}

function kindLabel(cue: Cue): string {
  if (cue.kind === 'screen') return `게임 화면 · ${cue.screen ? t(`host.game.${cue.screen}`) : ''}`;
  if (!cue.media) return '슬라이드 · 임시 화면';
  return isVideo(cue.media) ? '영상' : '슬라이드';
}

function cueIcon(cue: Cue): string {
  if (cue.kind === 'screen') return '🎮';
  if (!cue.media) return '📝';
  return isVideo(cue.media) ? '🎬' : '🖼';
}

function newCue(kind: Cue['kind']): Cue {
  return {
    id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    kind,
    title: kind === 'slide' ? '새 슬라이드' : '게임 화면',
    body: '',
    screen: kind === 'screen' ? 'stones' : null,
    media: '',
    bgm: '',
    bgmUrl: '',
    note: '',
    transition: 'fade',
    timer: 0,
    timerLabel: '',
    controls: null,
    auto: null,
    layout: '',
  };
}

interface MediaFile {
  name: string;
  url: string;
  size: number;
}

function useMediaFiles(): [MediaFile[], () => void] {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const load = () => {
    void fetch('/master/media', { credentials: 'include' })
      .then((r) => r.json())
      .then((b: { ok: boolean; files?: MediaFile[] }) => setFiles(b.files ?? []))
      .catch(() => {});
  };
  useEffect(load, []);
  return [files, load];
}

/** Upload one file to /media with progress. Resolves to its URL. */
function upload(file: File, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/master/media?name=${encodeURIComponent(file.name)}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as { ok: boolean; url?: string; message?: string };
        if (body.ok && body.url) resolve(body.url);
        else reject(new Error(body.message ?? '올리지 못했어요'));
      } catch {
        reject(new Error('올리지 못했어요'));
      }
    };
    xhr.onerror = () => reject(new Error('올리지 못했어요 (연결 확인)'));
    xhr.send(file);
  });
}

export function ShowPane(props: ShowPaneProps) {
  const { event, saveCues } = props;
  const cues = event.cues ?? [];
  const [mode, setMode] = useState<'remote' | 'edit'>('remote');
  const [editing, setEditing] = useState<string | null>(null);

  const save = (list: Cue[]) => saveCues(list).catch(() => {});

  if (mode === 'edit') {
    return (
      <EditList
        cues={cues}
        liveCue={event.liveCue}
        editing={editing}
        setEditing={setEditing}
        save={save}
        goCue={props.goCue}
        onDone={() => {
          setEditing(null);
          setMode('remote');
        }}
      />
    );
  }
  return (
    <Remote
      {...props}
      cues={cues}
      onEdit={(id) => {
        setEditing(id);
        setMode('edit');
      }}
    />
  );
}

/* ---- the remote ---------------------------------------------------------- */

function Remote({
  event,
  active,
  cues,
  goCue,
  startCue,
  clearSlide,
  bgm,
  setTimer,
  renderGame,
  stones,
  game,
  setMusic,
  restartEvent,
  onEdit,
}: ShowPaneProps & { cues: Cue[]; onEdit(id: string | null): void }) {
  const liveIdx = cues.findIndex((c) => c.id === event.liveCue);
  const live = liveIdx >= 0 ? cues[liveIdx]! : null;
  const prev = liveIdx > 0 ? cues[liveIdx - 1]! : null;
  const next = liveIdx < 0 ? (cues[0] ?? null) : (cues[liveIdx + 1] ?? null);
  const go = (c: Cue | null) => c && void goCue(c.id).catch(() => {});
  const sv = stones?.view ?? null;
  // The 스톤 game is ONE step: while it runs, the game is the path (no 다음).
  const roundsStep = autoOf(live) === 'stones-rounds';
  const roundsCue = cues.find((c) => autoOf(c) === 'stones-rounds') ?? null;
  const stonesDrive = roundsStep && !!sv && sv.state === 'RUNNING';
  const curRound = sv ? (sv.pending ? sv.pending.number : Math.max(1, Math.min(sv.played + 1, sv.total))) : 1;
  const round = ROUNDS[curRound - 1] ?? null;
  const sendStones = (ev: string, payload?: Record<string, unknown>) => game?.send('stones', ev, payload) ?? Promise.resolve();

  // 다음 ▶ first does this step's next action (start bingo, the timer, each
  // reveal …); only a step with nothing left moves on to the next step.
  const autoCtx = live && game ? { cue: live, event, bingo: game.bingo, stones: sv, send: game.send, setTimer, startCue } : null;
  const action = autoCtx ? nextAction(autoCtx) : null;
  // ◀ mirrors ▶: inside a step it takes back the step's last action first.
  const undo = autoCtx ? prevAction(autoCtx) : null;
  const [busy, setBusy] = useState(false);
  const runAction = (run: () => Promise<unknown>) => {
    setBusy(true);
    void run()
      .catch(() => {})
      // A beat for the new state to arrive, so a double tap never runs a step twice.
      .finally(() => window.setTimeout(() => setBusy(false), 500));
  };
  // Moving into a step does that step's first, visible beat in the same tap
  // (enterAction), so ▶ never needs a second press before the projector moves.
  const gameCtx = game ? { event, bingo: game.bingo, stones: sv, send: game.send, setTimer, startCue } : null;
  const enter = next && gameCtx ? enterAction(next, gameCtx) : null;
  const goInto = (c: Cue) => {
    const e = gameCtx ? enterAction(c, gameCtx) : null;
    runAction(async () => {
      await goCue(c.id);
      if (e) await e.run();
    });
  };
  const advance = () => {
    if (busy) return;
    if (action?.run) return runAction(action.run);
    if (action?.wait) return;
    if (!stonesDrive && next) goInto(next);
  };
  const auto = autoOf(live);
  const plan = auto ? AUTO_PLAN[auto] : null;
  const planAt = plan ? (action?.plan ? plan.indexOf(action.plan) : action ? -1 : plan.length) : -1;

  // ◀ 이전 (or a jump back) onto a round the 스톤 game is already past: ask
  // whether to take the game back too, so the step and the round always match.
  // ◀ 이전 walks the one path backwards — inside the 스톤 step that means one
  // round (or one stone pick) at a time; leaving a game that moved on asks first.
  const [back, setBack] = useState<{ question: string; loss: string[]; doLabel: string; run: () => Promise<unknown>; moveTo?: Cue } | null>(null);
  useEffect(() => setBack(null), [event.liveCue, sv?.played, sv?.pending?.number, sv?.state]);
  const goBack = (c: Cue | null, fromList = false) => {
    if (!c) return;
    const target = cues.indexOf(c);
    // ◀ takes back this step's last action before leaving the step.
    if (!fromList && undo && target === liveIdx - 1) {
      if (!busy) runAction(undo.run);
      return;
    }
    // At a step's starting point, ◀ takes back what entering it did, in the same tap.
    const leave = !fromList && live && gameCtx && target === liveIdx - 1 ? leaveBackAction(live, gameCtx) : null;
    if (leave) {
      if (!busy) runAction(async () => {
        await leave();
        await goCue(c.id);
      });
      return;
    }
    // 최종 집계 before 게임 종료: the last tap was the 6th stone (which moved here),
    // so ◀ takes that result back and returns to the rounds.
    if (!fromList && target === liveIdx - 1 && autoOf(live) === 'stones-final' && sv?.state === 'RUNNING' && !sv.pending && sv.played > 0) {
      return setBack({
        question: `${sv.played}라운드 결과를 되돌릴까요? 스톤이 돌아가고 ${sv.played}라운드를 다시 해요.`,
        loss: rewindLoss(sv, sv.played),
        doLabel: `${sv.played}라운드로 되돌리기`,
        run: () => (stones?.rewind(sv.played) ?? Promise.resolve()).then(() => goCue(c.id)),
        moveTo: c,
      });
    }
    // ◀ inside the 스톤 step: undo the last stone pick, then the last round.
    // (A jump from 전체 순서 means "leave this step" — handled below.)
    if (!fromList && stonesDrive && target === liveIdx - 1 && sv) {
      if (sv.pending) {
        // The first pick was made on the 메인 보드 and moved here: cancelling it goes back there.
        const toBoard = sv.played === 0;
        return setBack({
          question: `${sv.pending.number}라운드 스톤 선택을 취소할까요?`,
          loss: [`${sv.pending.number}라운드 스톤 선택`],
          doLabel: '스톤 선택 취소',
          run: () => sendStones('master:cancel').then(() => (toBoard ? goCue(c.id) : undefined)),
          ...(toBoard ? { moveTo: c } : {}),
        });
      }
      if (sv.played > 0) {
        // Round 1 started on the 메인 보드: taking it back returns there.
        const toBoard = sv.played === 1;
        return setBack({
          question: `${sv.played}라운드 결과를 되돌릴까요? 스톤이 돌아가고 ${sv.played}라운드를 다시 해요.`,
          loss: rewindLoss(sv, sv.played),
          doLabel: `${sv.played}라운드로 되돌리기`,
          run: () => (stones?.rewind(sv.played) ?? Promise.resolve()).then(() => (toBoard ? goCue(c.id) : undefined)),
          ...(toBoard ? { moveTo: c } : {}),
        });
      }
    }
    // Back into the 스톤 step after 게임 종료: reopen the game.
    if (c === roundsCue && sv?.state === 'ENDED' && sv.revealStep === 0) {
      return setBack({
        question: '스톤 게임 종료를 취소하고 라운드로 돌아갈까요?',
        loss: ['게임 종료' + ((sv.tiedGroups?.length ?? 0) || sv.activeTiebreak ? ' · 결정전' : '')],
        doLabel: '게임 다시 이어하기',
        run: () => sendStones('master:resumeFromEnded').then(() => goCue(c.id)),
        moveTo: c,
      });
    }
    // Back before the 스톤 step while the game is under way: offer to start it over.
    if (roundsCue && target < cues.indexOf(roundsCue) && sv && sv.state === 'RUNNING' && (sv.played > 0 || sv.pending)) {
      return setBack({
        question: `${c.title}(으)로 돌아가요. 스톤 게임도 처음(1라운드 전)으로 되돌릴까요?`,
        loss: rewindLoss(sv, 1),
        doLabel: '스톤도 처음으로',
        run: () => (stones?.rewind(1) ?? Promise.resolve()).then(() => goCue(c.id)),
        moveTo: c,
      });
    }
    go(c);
  };
  const goTo = (c: Cue) => (cues.indexOf(c) < liveIdx ? goBack(c, true) : goInto(c));

  // Follow the 스톤 game: a stone given out for this step's round moves on to
  // the next step; a stone picked for another round jumps to that round's step.
  const seen = useRef<{ played: number; pending: number | null } | null>(null);
  useEffect(() => {
    if (!sv || sv.state !== 'RUNNING') {
      seen.current = sv ? { played: sv.played, pending: sv.pending?.number ?? null } : null;
      return;
    }
    const cur = { played: sv.played, pending: sv.pending?.number ?? null };
    const before = seen.current;
    seen.current = cur;
    if (!before) return;
    if (roundsStep && cur.played > before.played && cur.pending === null && cur.played >= sv.total) {
      go(cues[liveIdx + 1] ?? null); // the last stone is given: on to 최종 집계
    } else if (!roundsStep && cur.pending !== null && before.pending === null && roundsCue && cues.indexOf(roundsCue) > liveIdx) {
      go(roundsCue); // a stone was picked (e.g. the 빙고 1등 on the main board): into the rounds
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sv?.played, sv?.pending?.number, sv?.state]);

  // A round's timer never starts by itself: the rules are explained first, then
  // the MC taps ⏱ as play starts (⟲ again for each match / song / photo). A new
  // round only takes down the last round's countdown.
  const openRound = stonesDrive ? (sv?.pending?.number ?? null) : null;
  useEffect(() => {
    if (event.projectorQuiz) void game?.send('stones', 'projector:quiz', { n: null }).catch(() => {});
    if (event.projectorCard) void game?.send('stones', 'projector:card', { off: true }).catch(() => {});
    if (openRound === null) return;
    if (event.projectorTimer) void setTimer(null).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRound]);
  // The 결정전 has its own 20초 (컵 놓기), offered only while one is being played.
  const tiebreakOn = autoOf(live) === 'stones-final' && !!sv?.activeTiebreak;

  // Each round's music, as the game moves from round to round.
  useEffect(() => {
    if (!stonesDrive || !round || !setMusic) return;
    void setMusic(round.bgm, round.bgmUrl).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stonesDrive, curRound]);

  // A presenter clicker sends PageUp/PageDown; a keyboard has the arrows.
  const nav = useRef({ prev, stonesDrive, goBack, advance });
  nav.current = { prev, stonesDrive, goBack, advance };
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        nav.current.advance();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        nav.current.goBack(nav.current.prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const slideIsLive = !!(live && event.slide && event.slide.cueId === live.id);
  const videoWaiting = !!(slideIsLive && isVideo(event.slide!.media) && !event.slide!.playing);
  const videoPlaying = !!(slideIsLive && isVideo(event.slide!.media) && event.slide!.playing);
  const bgmWaiting = !!(event.bgm && event.bgm.url && !event.bgm.playing);
  const controls = live ? controlsOf(live) : null;
  const onAirGame = (event.projectorLock ?? event.projector) as GameId | 'auto';

  return (
    <div className="remote">
      <div className="remote__top">
        <div className="remote__progress" aria-label={`${liveIdx + 1} / ${cues.length}`}>
          <span className="remote__count">
            {live ? liveIdx + 1 : 0}
            <small> / {cues.length}</small>
          </span>
          <span className="remote__bar" aria-hidden="true">
            <span style={{ width: `${cues.length ? ((liveIdx + 1) / cues.length) * 100 : 0}%` }} />
          </span>
        </div>
        <div className="remote__tools">
          {restartEvent ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm remote__restart"
              onClick={() => {
                if (
                  confirm(
                    '전체 초기화할까요?\n\n' +
                      '· 빙고 · 스톤 · 윷놀이 기록이 모두 지워지고 처음(준비)으로 돌아가요\n' +
                      '· 진행 순서가 1번 장면 전으로 돌아가요 (화면·음악·타이머 정리)\n' +
                      '· 참가자 휴대폰은 대기 화면으로 돌아가요\n\n' +
                      '참여 코드·QR, 진행 순서 목록, 올린 파일은 그대로예요.',
                  )
                )
                  void restartEvent().catch(() => {});
              }}
            >
              ↺ 전체 초기화
            </button>
          ) : null}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit(null)}>
            ✎ 순서 편집
          </button>
        </div>
      </div>

      {live ? (
        <section className={`remote__now${stonesDrive ? ' remote__now--round' : ''}`} aria-label="지금 장면">
          <span className="remote__kind">
            {stonesDrive ? '💎 스톤 라운드 · 게임 리모컨' : `${cueIcon(live)} ${kindLabel(live)}`}
          </span>
          <h2 className="remote__title">{live.title}</h2>
          {stonesDrive && round ? (
            <>
              <p className="remote__roundnow">
                지금 <b>{curRound}라운드</b> · {round.name}
                {round.bgm && !round.bgmUrl ? <span className="remote__handsong">🎵 {round.bgm}</span> : null}
              </p>
              <p className="remote__note">{round.note}</p>
            </>
          ) : live.note ? (
            <p className="remote__note">{live.note}</p>
          ) : null}
          {stonesDrive ? <p className="remote__autoline">↻ 스톤을 주면 다음 라운드로 자동으로 넘어가요</p> : null}
          {stonesDrive && round?.extra && sv?.pending?.number === round.n && game ? (
            round.extra === 'words' ? (
              <WordsPanel event={event} send={(p) => game.send('stones', 'projector:card', p)} />
            ) : round.extra === 'track' ? (
              <TrackPanel event={event} send={(p) => game.send('stones', 'projector:card', p)} />
            ) : round.extra === 'songs' || round.extra === 'faces' ? (
              <MediaRoundPanel key={round.extra} dir={round.extra} event={event} send={(p) => game.send('stones', 'projector:card', p)} />
            ) : (
              <RoundExtras
                event={event}
                send={(n) => game.send('stones', 'projector:quiz', { n })}
                reveal={(n, on) => game.send('stones', 'projector:quiz', { n, reveal: on })}
              />
            )
          ) : null}
          {plan ? (
            <ol className="remote__plan" aria-label="이 장면 순서">
              {plan.map((p, i) => (
                <li key={p} className={i < planAt ? 'is-done' : i === planAt ? 'is-now' : ''}>
                  {i < planAt ? '✓ ' : ''}
                  {p}
                </li>
              ))}
            </ol>
          ) : null}
          <p className="remote__screen">
            발표 화면 ·{' '}
            {event.slide
              ? `${event.slide.title}${event.slide.media ? '' : ' (임시 화면)'}`
              : onAirGame === 'auto'
                ? '게임 화면 (자동)'
                : `${t(`host.game.${onAirGame}`)} 게임 화면`}
          </p>
        </section>
      ) : (
        <section className="remote__now remote__now--idle">
          <span className="remote__kind">시작 전</span>
          <h2 className="remote__title">다음 ▶ 을 누르면 1번 장면이 화면에 떠요</h2>
          <p className="remote__note">발표 화면(/p)을 먼저 열고, 그 화면을 한 번 눌러 소리를 켜 두세요.</p>
        </section>
      )}

      {live ? (
        <section className="remote__do" aria-label="이 장면에서 할 일">
          {action?.skip ? (
            <button type="button" className="btn remote__chip" disabled={busy} onClick={() => runAction(action.skip!.run)}>
              ⤼ {action.skip.label}
            </button>
          ) : null}
          {videoPlaying ? (
            <button type="button" className="btn remote__chip" onClick={() => void startCue().catch(() => {})}>
              ⟲ 영상 처음부터
            </button>
          ) : event.slide && event.slide.cueId === live.id && isVideo(event.slide.media) ? (
            <button type="button" className="btn remote__chip" onClick={() => void startCue().catch(() => {})}>
              ▶ 영상 재생
            </button>
          ) : null}
          {stonesDrive && round && round.timer > 0 ? (
            <TimerButton event={event} cue={{ ...live, timer: round.timer, timerLabel: round.timerLabel }} setTimer={setTimer} />
          ) : tiebreakOn ? (
            <TimerButton event={event} cue={{ ...live, ...TIEBREAK_TIMER }} setTimer={setTimer} />
          ) : live.timer > 0 ? (
            <TimerButton event={event} cue={live} setTimer={setTimer} />
          ) : null}
          {live.kind === 'slide' && slideIsLive && controls ? (
            <button type="button" className="btn remote__chip" onClick={() => void clearSlide().catch(() => {})}>
              슬라이드 내리기 · {t(`host.game.${controls}`)} 보드 보기
            </button>
          ) : null}
          {live.kind === 'slide' && !slideIsLive ? (
            <button type="button" className="btn remote__chip" onClick={() => go(live)}>
              슬라이드 다시 띄우기
            </button>
          ) : null}
          {/* Only a real music file gets controls; a BGM that is just a name stays out of the way. */}
          {event.bgm?.url ? <BgmBar event={event} bgm={bgm} /> : null}
        </section>
      ) : null}

      {controls ? (
        <section className={`remote__game remote__game--${controls}`} aria-label={`${t(`host.game.${controls}`)} 조작`}>
          <h3 className="remote__gamehead">
            <span className="remote__gamedot" aria-hidden="true" />
            {t(`host.game.${controls}`)} 조작
          </h3>
          <div className="pane__body">{renderGame(controls, live!)}</div>
        </section>
      ) : null}

      {back ? (
        <section className="remote__back" role="alertdialog" aria-label="스톤 게임도 되돌릴까요?">
          <p className="remote__backq">{back.question}</p>
          <ul className="remote__backloss">
            {back.loss.map((l) => (
              <li key={l}>↶ {l}</li>
            ))}
          </ul>
          <div className="remote__backrow">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                const b = back;
                setBack(null);
                void b.run().catch(() => {});
              }}
            >
              {back.doLabel}
            </button>
            {back.moveTo ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const b = back;
                  setBack(null);
                  go(b.moveTo!);
                }}
              >
                장면만 이동
              </button>
            ) : null}
            <button type="button" className="btn btn--ghost" onClick={() => setBack(null)}>
              취소
            </button>
          </div>
        </section>
      ) : null}

      <nav className={`remote__nav${stonesDrive ? ' remote__nav--solo' : ''}`} aria-label="이전 / 다음 장면">
        <button type="button" className={`btn remote__prev${undo ? ' remote__prev--undo' : ''}`} disabled={!prev && !undo} onClick={() => goBack(prev)}>
          {undo ? `◀ ${undo.label}` : '◀ 이전'}
          <small>{undo ? '이 장면 안에서 한 단계 뒤로' : prev ? prev.title : ''}</small>
        </button>
        {stonesDrive ? null : action ? (
          <button
            type="button"
            className={`btn btn--primary remote__next remote__next--act${action.run ? '' : ' is-waiting'}`}
            disabled={!action.run || busy}
            onClick={advance}
          >
            {action.run ? `▶ ${action.label}` : '⏳ 기다리는 중'}
            <small>{action.run ? '다음 ▶ · 이 장면의 다음 단계' : action.wait}</small>
          </button>
        ) : (
          <button type="button" className="btn btn--primary remote__next" disabled={!next || busy} onClick={advance}>
            {live ? (next ? '다음 장면 ▶' : '마지막 장면') : '▶ 시작하기'}
            {next ? (
              <small>
                {cueIcon(next)} {next.title}
                {enter ? ` · ${enter.label}` : ''}
              </small>
            ) : null}
          </button>
        )}
      </nav>

      <details className="remote__all">
        <summary>전체 순서 · 눌러서 바로 이동</summary>
        <ol>
          {cues.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                className={`remote__row${c.id === event.liveCue ? ' is-live' : ''}${i < liveIdx ? ' is-done' : ''}`}
                onClick={() => goTo(c)}
              >
                <span className="remote__rown">{i + 1}</span>
                <span className="remote__rowicon" aria-hidden="true">
                  {cueIcon(c)}
                </span>
                <span className="remote__rowtitle">{c.title}</span>
                <span className="remote__rowtags">
                  {c.timer ? <span title="타이머">⏱</span> : null}
                  {c.bgm || c.bgmUrl ? <span title={c.bgmUrl ? 'BGM' : 'BGM 음원 없음'}>{c.bgmUrl ? '🎵' : '🔇'}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </details>
      <p className="remote__keys">
        ← → 키나 프레젠터 리모컨으로도 이전 / 다음을 넘길 수 있어요{stonesDrive ? ' (스톤 라운드 중에는 스톤을 주면 넘어가요)' : ''}.
      </p>
    </div>
  );
}

function TimerButton({ event, cue, setTimer }: { event: EventSummary; cue: Cue; setTimer: ShowPaneProps['setTimer'] }) {
  const left = useCountdown(event.projectorTimer, event.serverNow);
  const running = left !== null && left > 0;
  const label = cue.timerLabel || cue.title;
  // It starts by itself; once it has run here, the button repeats it.
  const ranHere = event.projectorTimer?.label === label;
  if (running && ranHere) {
    return (
      <button type="button" className="btn remote__chip remote__timer is-running" onClick={() => void setTimer(null).catch(() => {})}>
        ⏹ 타이머 멈추기 <b>{formatLeft(left!)}</b>
      </button>
    );
  }
  return (
    <button type="button" className="btn remote__chip remote__timer" onClick={() => void setTimer(cue.timer, label).catch(() => {})}>
      {ranHere ? '⟲ 다시' : '⏱'} {secondsLabel(cue.timer)} 타이머 · {label}
    </button>
  );
}

function BgmBar({ event, bgm }: { event: EventSummary; bgm: ShowPaneProps['bgm'] }) {
  const b = event.bgm;
  const [vol, setVol] = useState(b?.volume ?? 0.8);
  useEffect(() => {
    if (b) setVol(b.volume);
  }, [b?.volume]);
  if (!b) return null;
  const act = (a: 'play' | 'pause' | 'restart' | 'stop') => void bgm(a).catch(() => {});
  return (
    <div className={`bgm${b.url ? '' : ' bgm--ph'}`}>
      <span className="bgm__icon">{b.url ? '🎵' : '🔇'}</span>
      <span className="bgm__name">{trackTitle(b.url) ?? b.name}</span>
      {b.url ? (
        <>
          <span className={`chip ${b.playing ? 'show__chip--ok' : ''}`}>{b.playing ? '재생 중' : '대기'}</span>
          <button type="button" className="btn btn--sm" onClick={() => act(b.playing ? 'pause' : 'play')}>
            {b.playing ? '⏸' : '▶'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => act('restart')} title="처음부터">
            ⟲
          </button>
          <label className="bgm__vol">
            <span aria-hidden="true">🔊</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={vol}
              aria-label="음량"
              onChange={(e) => setVol(Number(e.currentTarget.value))}
              onPointerUp={() => void bgm(null, vol).catch(() => {})}
              onKeyUp={() => void bgm(null, vol).catch(() => {})}
            />
          </label>
        </>
      ) : (
        <span className="chip show__chip--ph">음원 없음 · 직접 틀어주세요</span>
      )}
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => act('stop')} title="BGM 끄기">
        ⏹
      </button>
    </div>
  );
}

/* ---- 순서 편집 ------------------------------------------------------------ */

function EditList({
  cues,
  liveCue,
  editing,
  setEditing,
  save,
  goCue,
  onDone,
}: {
  cues: Cue[];
  liveCue: string | null;
  editing: string | null;
  setEditing(id: string | null): void;
  save(list: Cue[]): Promise<void>;
  goCue(id: string): Promise<void>;
  onDone(): void;
}) {
  const [files, reloadFiles] = useMediaFiles();
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= cues.length) return;
    const list = [...cues];
    [list[i], list[j]] = [list[j]!, list[i]!];
    void save(list);
  };
  const add = (kind: Cue['kind']) => {
    const c = newCue(kind);
    void save([...cues, c]).then(() => setEditing(c.id));
  };

  return (
    <div className="show">
      <div className="remote__top">
        <h2 className="show__edithead">✎ 순서 편집</h2>
        <button type="button" className="btn btn--primary btn--sm" onClick={onDone}>
          완료 · 리모컨으로
        </button>
      </div>
      <ol className="show__list">
        {cues.map((cue, i) => (
          <li key={cue.id} className={`cue${cue.id === liveCue ? ' is-live' : ''}`}>
            {editing === cue.id ? (
              <CueEditor
                cue={cue}
                files={files}
                onUploaded={reloadFiles}
                onCancel={() => setEditing(null)}
                onSave={(c) => {
                  setEditing(null);
                  void save(cues.map((x) => (x.id === c.id ? c : x)));
                }}
              />
            ) : (
              <div className="cue__row">
                <span className="cue__n">{i + 1}</span>
                <div className="cue__thumb" aria-hidden="true">
                  {cue.kind === 'slide' && cue.media && !isVideo(cue.media) ? <img src={cue.media} alt="" loading="lazy" /> : <span>{cueIcon(cue)}</span>}
                </div>
                <div className="cue__main">
                  <div className="cue__title">
                    <span className={`cue__kind cue__kind--${cue.kind}`}>{kindLabel(cue)}</span>
                    <strong>{cue.title}</strong>
                    {cue.id === liveCue ? <span className="cue__air">화면 표시 중</span> : null}
                  </div>
                  <div className="cue__meta">
                    {cue.bgm || cue.bgmUrl ? (
                      <span>
                        {cue.bgmUrl ? '🎵' : '🔇'} {cue.bgm || '배경음악'}
                        {cue.bgmUrl ? '' : ' (음원 없음)'}
                      </span>
                    ) : null}
                    {cue.timer ? <span>⏱ {secondsLabel(cue.timer)}</span> : null}
                    {controlsOf(cue) && cue.kind === 'slide' ? <span>🎮 {t(`host.game.${cue.controls}`)} 조작</span> : null}
                  </div>
                </div>
                <div className="cue__tools">
                  <button type="button" className="btn btn--sm" onClick={() => setEditing(cue.id)}>
                    수정
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => void goCue(cue.id).catch(() => {})} title="화면에 띄우기">
                    띄우기
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="위로">
                    ↑
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" disabled={i === cues.length - 1} onClick={() => move(i, 1)} aria-label="아래로">
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    aria-label="지우기"
                    onClick={() => {
                      if (confirm(`"${cue.title}" 장면을 지울까요?`)) void save(cues.filter((x) => x.id !== cue.id));
                    }}
                  >
                    🗑
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="show__add">
        <button type="button" className="btn" onClick={() => add('slide')}>
          + 슬라이드
        </button>
        <button type="button" className="btn" onClick={() => add('screen')}>
          + 게임 화면
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            if (confirm('진행 순서를 대본 기본값으로 되돌릴까요? 고친 내용과 넣은 파일 연결이 사라져요.')) void save(defaultCues());
          }}
        >
          대본 기본값으로
        </button>
      </div>
      <p className="show__hint">
        파일이 없는 슬라이드는 발표 화면에 제목만 있는 <b>임시 화면</b>으로 나와요. 음원이 없는 BGM은 <b>음원 없음</b>으로 표시돼요: 그때는
        직접 틀어주세요. 영상과 BGM은 리모컨의 <b>▶ 시작</b>을 눌러야 재생돼요.
      </p>
    </div>
  );
}

function UrlField({
  label,
  value,
  onChange,
  files,
  accept,
  onUploaded,
  listId,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  files: MediaFile[];
  accept: string;
  onUploaded(): void;
  listId: string;
}) {
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <div className="cue__url">
        <input
          className="field__input"
          value={value}
          list={listId}
          placeholder="비우면 임시 화면 / 음원 없음 · /media/파일 또는 https://…"
          onChange={(e) => onChange(e.currentTarget.value)}
        />
        <datalist id={listId}>
          {files.map((f) => (
            <option key={f.url} value={f.url}>
              {f.name}
            </option>
          ))}
        </datalist>
        <button type="button" className="btn btn--sm" disabled={pct !== null} onClick={() => input.current?.click()}>
          {pct !== null ? `올리는 중 ${pct}%` : '파일 올리기'}
        </button>
        {value ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange('')}>
            비우기
          </button>
        ) : null}
        <input
          ref={input}
          type="file"
          accept={accept}
          hidden
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (!file) return;
            setErr(null);
            setPct(0);
            upload(file, setPct)
              .then((url) => {
                onChange(url);
                onUploaded();
              })
              .catch((x: Error) => setErr(x.message))
              .finally(() => setPct(null));
          }}
        />
      </div>
      {err ? <span className="field__error">{err}</span> : null}
    </label>
  );
}

function CueEditor({
  cue,
  files,
  onUploaded,
  onSave,
  onCancel,
}: {
  cue: Cue;
  files: MediaFile[];
  onUploaded(): void;
  onSave(c: Cue): void;
  onCancel(): void;
}) {
  const [c, setC] = useState<Cue>(cue);
  const set = <K extends keyof Cue>(k: K, v: Cue[K]) => setC((p) => ({ ...p, [k]: v }));
  const visual = files.filter((f) => !/\.(mp3|m4a|wav|ogg|aac)$/i.test(f.name));
  const audio = files.filter((f) => /\.(mp3|m4a|wav|ogg|aac|mp4|m4v|webm)$/i.test(f.name));
  return (
    <form
      className="cue__edit"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(c);
      }}
    >
      <div className="cue__editrow">
        <label className="field">
          <span className="field__label">종류</span>
          <select
            className="field__input"
            value={c.kind}
            onChange={(e) => {
              const kind = e.currentTarget.value as Cue['kind'];
              setC((p) => ({ ...p, kind, screen: kind === 'screen' ? (p.screen ?? 'stones') : null }));
            }}
          >
            <option value="slide">슬라이드 (이미지·영상·임시 화면)</option>
            <option value="screen">게임 화면</option>
          </select>
        </label>
        {c.kind === 'screen' ? (
          <label className="field">
            <span className="field__label">어느 게임</span>
            <select className="field__input" value={c.screen ?? 'stones'} onChange={(e) => set('screen', e.currentTarget.value as GameId)}>
              {GAME_IDS.map((g) => (
                <option key={g} value={g}>
                  {t(`host.game.${g}`)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="field">
            <span className="field__label">리모컨에 함께 띄울 게임 조작</span>
            <select
              className="field__input"
              value={c.controls ?? ''}
              onChange={(e) => set('controls', (e.currentTarget.value || null) as GameId | null)}
            >
              <option value="">없음</option>
              {GAME_IDS.map((g) => (
                <option key={g} value={g}>
                  {t(`host.game.${g}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span className="field__label">전환 효과</span>
          <select className="field__input" value={c.transition} onChange={(e) => set('transition', e.currentTarget.value as Transition)}>
            {TRANSITIONS.map((tr) => (
              <option key={tr} value={tr}>
                {TRANSITION_LABEL[tr]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field__label">제목 {c.kind === 'slide' ? '· 임시 화면에 크게 나와요' : '· 리모컨에만 보여요'}</span>
        <input className="field__input" value={c.title} maxLength={80} onChange={(e) => set('title', e.currentTarget.value)} />
      </label>
      {c.kind === 'slide' ? (
        <>
          <label className="field">
            <span className="field__label">부제 · 임시 화면 제목 아래</span>
            <input className="field__input" value={c.body} maxLength={200} onChange={(e) => set('body', e.currentTarget.value)} />
          </label>
          <UrlField
            label="슬라이드 파일 (이미지 또는 영상)"
            value={c.media}
            onChange={(v) => set('media', v)}
            files={visual}
            accept="image/*,video/*"
            onUploaded={onUploaded}
            listId={`media-${c.id}`}
          />
        </>
      ) : null}
      <div className="cue__editrow">
        <label className="field">
          <span className="field__label">타이머 (초, 0 = 없음)</span>
          <input
            className="field__input"
            type="number"
            min={0}
            max={3600}
            value={c.timer}
            onChange={(e) => set('timer', Math.max(0, Math.min(3600, Math.floor(Number(e.currentTarget.value) || 0))))}
          />
        </label>
        <label className="field">
          <span className="field__label">타이머 이름 · 화면에 나와요</span>
          <input className="field__input" value={c.timerLabel} maxLength={40} onChange={(e) => set('timerLabel', e.currentTarget.value)} />
        </label>
      </div>
      <label className="field">
        <span className="field__label">BGM 이름 · MC가 볼 이름 (비우면 지금 음악을 그대로 둬요)</span>
        <input className="field__input" value={c.bgm} maxLength={80} onChange={(e) => set('bgm', e.currentTarget.value)} />
      </label>
      <UrlField
        label="BGM 파일"
        value={c.bgmUrl}
        onChange={(v) => set('bgmUrl', v)}
        files={audio}
        accept="audio/*"
        onUploaded={onUploaded}
        listId={`bgm-${c.id}`}
      />
      <label className="field">
        <span className="field__label">진행 메모 · 리모컨에만 보여요</span>
        <input className="field__input" value={c.note} maxLength={200} onChange={(e) => set('note', e.currentTarget.value)} />
      </label>
      <div className="cue__editactions">
        <button type="submit" className="btn btn--primary">
          저장
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  );
}

/**
 * The round's MC tools inside the remote. 4지선다: put question N over the
 * projector (only 1–4 show there), step through them, take it down; the MC sees
 * the 보기 here. 일심동체: each team's 5 제시어, never on the projector.
 */
function RoundExtras({ event, send, reveal }: { event: EventSummary; send(n: number | null): Promise<unknown>; reveal(n: number, on: boolean): Promise<unknown> }) {
  const on = event.projectorQuiz?.n ?? null;
  const shown = on !== null && !!event.projectorQuiz?.answer;
  const [n, setN] = useState(on ?? 1);
  useEffect(() => {
    if (on !== null) setN(on);
  }, [on]);
  const q = FOUR_CHOICE[n - 1]!;
  const total = FOUR_CHOICE.length;
  const show = (k: number) => void send(k).catch(() => {});
  return (
    <div className="remote__extra" aria-label="4지선다 문제">
      <p className="remote__extrahead">
        ❓ {q.label} ({n} / {total}) {on === n ? <span className="remote__onair">{shown ? '정답 공개 중' : '화면에 질문만'}</span> : null}
      </p>
      <p className="remote__qtext">{q.question}</p>
      <ol className="remote__qchoices">
        {q.choices.map((c, i) => (
          <li key={c} className={q.answer === i + 1 ? 'is-answer' : ''}>
            {i + 1}. {c}
          </li>
        ))}
      </ol>
      <p className="remote__note">정답 (진행자만): {q.answer ? `${q.answer}번 · ${q.choices[q.answer - 1]}` : '미정'}</p>
      <div className="remote__qnav">
        <button type="button" className="btn remote__chip" disabled={n <= 1} onClick={() => (on !== null ? show(n - 1) : setN(n - 1))}>
          ◀ 이전
        </button>
        {on !== n ? (
          <button type="button" className="btn remote__chip remote__chip--go" onClick={() => show(n)}>
            {q.label} 화면에 띄우기
          </button>
        ) : shown ? (
          <button type="button" className="btn remote__chip" onClick={() => void reveal(n, false).catch(() => {})}>
            정답 가리기
          </button>
        ) : (
          <button type="button" className="btn remote__chip remote__chip--go" onClick={() => void reveal(n, true).catch(() => {})}>
            정답 공개 ★
          </button>
        )}
        <button type="button" className="btn remote__chip" disabled={n >= total} onClick={() => (on !== null ? show(n + 1) : setN(n + 1))}>
          다음 ▶
        </button>
      </div>
      {on !== null ? (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void send(null).catch(() => {})}>
          문제 내리기
        </button>
      ) : null}
    </div>
  );
}
