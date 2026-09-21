/**
 * The projector switcher — `/p` (master spec §9).
 *
 * One screen at the front of the room. It shows whichever game the master pointed
 * the projector at (an explicit channel, or `'auto'` following activity with a
 * hold), a reveal seizes it via `projectorLock`, and a **standby** stage fills
 * the gaps so the room is never staring at "loading". Read-only by construction.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import type { EventSummary } from '../event/event.js';
import type { GameId } from '../shared/lifecycle.js';
import { podiumAt, type RankEntry } from '../shared/rank.js';
import type { BoardView } from '@soonot/yutnori/src/project.js';
import { BoardSvg, Clock, HomeTray, Standings } from '@soonot/yutnori/src/client/BoardSvg.js';
import type { SpectatorView } from '@soonot/bingo/src/project.js';
import { MINI_GAMES } from '@soonot/yutnori/src/shared/minigames.js';
import qrcode from 'qrcode-generator';
import './projector.css';

/** A self-contained SVG QR (no network, CSP-safe) — scan to open the join page. */
function Qr({ text, size = 200 }: { text: string; size?: number }) {
  const { d, n } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) path += `M${c},${r}h1v1h-1z`;
    return { d: path, n: count };
  }, [text]);
  return (
    <svg className="qr" viewBox={`0 0 ${n} ${n}`} width={size} height={size} shapeRendering="crispEdges" aria-label="참여 QR">
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#111" />
    </svg>
  );
}

/** The phone join URL for the QR — the deployed origin + the event code (scanning
 *  lands on /{code}, which passes the join gate automatically). */
const joinUrl = (code?: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/${code ?? 'b'}`;
};

const HOLD_MS = 20_000;
type BingoView = SpectatorView & { standings: RankEntry[] };

/** The always-present festive backdrop — a warm stage, not a flat screen. */
function Stage({ children, kind }: { children: ReactNode; kind?: string }) {
  return (
    <main className={`stage${kind ? ` stage--${kind}` : ''}`}>
      <div className="stage__glow" aria-hidden="true" />
      <div className="stage__grain" aria-hidden="true" />
      {children}
    </main>
  );
}

/** Standby: shown before a game starts, so the room can join and settle in. */
function Standby({ summary, joinable }: { summary: EventSummary | null; joinable: boolean }) {
  return (
    <Stage kind="standby">
      <div className="standby">
        <div className="standby__kicker">교회 한마당</div>
        <h1 className="standby__title">{summary?.title ?? 'SOONOT'}</h1>
        {summary ? (
          <div className="join">
            <Qr text={joinUrl(summary.code)} />
            <div className="join__meta">
              <span className="join__scan">📱 휴대폰으로 스캔</span>
              {summary.code ? (
                <span className="join__code">참여 코드 <b>{summary.code}</b></span>
              ) : null}
            </div>
          </div>
        ) : null}
        <p className="standby__hint">{joinable ? '닉네임을 입력하면 바로 참여!' : '곧 시작합니다…'}</p>
        <div className="standby__pulse" aria-hidden="true"><span /><span /><span /></div>
      </div>
    </Stage>
  );
}

function Podium({ ranked, step, title }: { ranked: readonly RankEntry[]; step: number; title: string }) {
  const shown = podiumAt(ranked, step);
  return (
    <Stage kind="podium">
      <div className="podium">
        <h2 className="podium__title">🏆 {title} 순위 발표</h2>
        {shown.length === 0 ? (
          <p className="podium__hold">두구두구두구…</p>
        ) : (
          <ol className="podium__list">
            {shown.map((e) => (
              <li key={e.id} className={`podium__row${e.medal ? ` medal--${e.medal}` : ''}${e.self ? ' is-self' : ''}`}>
                {e.medal ? <span className="podium__medal">{['🥇', '🥈', '🥉'][e.medal - 1]}</span> : <span className="podium__medal" />}
                <span className="podium__label">{e.label}</span>
                <span className="podium__detail">{e.detail}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Stage>
  );
}

function yutRank(standings: BoardView['standings']): RankEntry[] {
  return standings.map((s) => ({
    id: s.teamId,
    label: s.teamName,
    detail: `${s.malHome}말 집 · ${s.totalProgress}칸`,
  }));
}

function MiniGameStage({ pending, games }: { pending: NonNullable<BoardView['pendingMiniGame']>; games: BoardView['miniGames'] }) {
  const list = games.length > 0 ? games : MINI_GAMES;
  const game = pending.gameId ? list.find((g) => g.id === pending.gameId) : null;
  const [face, setFace] = useState(0);
  useEffect(() => {
    if (game) return undefined;
    const t = setInterval(() => setFace((f) => (f + 1) % list.length), 90);
    return () => clearInterval(t);
  }, [game, list.length]);
  return (
    <Stage kind="minigame">
      <div className="mg">
        <p className="mg__flag">🎡 {pending.teamName} 미니게임!</p>
        {game ? (
          <div className="mg__card">
            <div className="mg__name">{game.name}</div>
            <div className="mg__inst">{game.instruction}</div>
          </div>
        ) : (
          <div className="mg__reel">{list[face % list.length]?.name ?? '…'}</div>
        )}
        <p className="mg__hint">{game ? '성공하면 통과! 실패하면 이동 취소!' : '두구두구두구…'}</p>
      </div>
    </Stage>
  );
}

function YutnoriBoard({ view }: { view: BoardView }) {
  const running = view.state === 'RUNNING';
  const label =
    running && view.turnTeamName
      ? `${view.turnTeamName} 차례`
      : view.state === 'SETUP'
        ? '팀을 준비하고 있어요'
        : view.state === 'LOBBY'
          ? '곧 시작합니다'
          : view.state;
  return (
    <Stage kind="yut">
      <header className="board-head">
        <h1 className="board-head__title">윷놀이 한마당</h1>
        {running ? <Clock ms={view.remainingMs} paused={view.paused} /> : null}
        <strong className="board-head__turn">{label}</strong>
      </header>
      <div className="board-grid">
        <BoardSvg view={view} />
        <aside className="board-side">
          <HomeTray view={view} />
          <h2>순위</h2>
          <Standings view={view} />
        </aside>
      </div>
    </Stage>
  );
}

function BingoScreen({ view, summary, flash }: { view: BingoView; summary: EventSummary | null; flash: string | null }) {
  return (
    <Stage kind="bingo">
      <div className="bingo-stage">
        <div className="bingo-stage__kicker">교회 사람 빙고</div>
        <h1 className="bingo-stage__title">{summary?.title ?? '한마당'}</h1>
        <div className="bstats">
          <Big value={view.connectedCount} label="접속" />
          <Big value={view.playerCount} label="참가" />
          <Big value={view.bingoCount} label="빙고" hot={view.bingoCount > 0} />
        </div>
        <p className="bingo-stage__hint">
          {view.state === 'LOBBY' ? '휴대폰으로 스캔해서 참여하세요' : '특징에 맞는 사람을 찾아 칸을 채우세요'}
        </p>
      </div>
      {flash ? <div className="stage__flash">{flash}</div> : null}
    </Stage>
  );
}

function Big({ value, label, hot }: { value: number; label: string; hot?: boolean }) {
  return (
    <div className={`big${hot ? ' is-hot' : ''}`}>
      <span className="big__val">{value}</span>
      <span className="big__label">{label}</span>
    </div>
  );
}

interface FloatingReaction { id: number; emoji: string; name: string; left: number; drift: number; dur: number; spin: number; }

/** Kahoot-style emojis flung by phones, floating up the stage — with the sender's name. */
function Reactions({ items, onDone }: { items: FloatingReaction[]; onDone(id: number): void }) {
  return (
    <div className="reactions" aria-hidden="true">
      {items.map((r) => (
        <span
          key={r.id}
          className="reaction"
          style={{ left: `${r.left}%`, ['--drift' as string]: `${r.drift}vw`, ['--dur' as string]: `${r.dur}s`, ['--spin' as string]: `${r.spin}deg` }}
          onAnimationEnd={() => onDone(r.id)}
        >
          <span className="reaction__emoji">{r.emoji}</span>
          {r.name ? <span className="reaction__name">{r.name}</span> : null}
        </span>
      ))}
    </div>
  );
}

export function App() {
  const [summary, setSummary] = useState<EventSummary | null>(null);
  const [yView, setYView] = useState<BoardView | null>(null);
  const [bView, setBView] = useState<BingoView | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [autoGame, setAutoGame] = useState<GameId>('yutnori');
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const lastActivity = useRef<Record<GameId, number>>({ yutnori: 0, bingo: 0 });
  const reactId = useRef(0);

  useEffect(() => {
    const socket = io('/p', { reconnectionDelay: 500, reconnectionDelayMax: 5000, randomizationFactor: 0.5 });
    socket.on('reaction', (d: { emoji: string; name?: string }) => {
      const id = reactId.current++;
      setReactions((prev) => [
        ...prev.slice(-60), // cap so a spam burst can't grow unbounded
        // Float up the RIGHT edge only (a narrow band) so the board/podium stays
        // clear — and away from the bottom-left online box. Small drift = a column.
        { id, emoji: d.emoji, name: d.name ?? '', left: 80 + Math.random() * 12, drift: Math.random() * 5 - 2.5, dur: 2.6 + Math.random() * 1.6, spin: Math.random() * 40 - 20 },
      ]);
    });
    const bump = (game: GameId) => {
      const nowT = Date.now();
      lastActivity.current[game] = nowT;
      const other: GameId = game === 'yutnori' ? 'bingo' : 'yutnori';
      setAutoGame((cur) => (cur === game ? cur : nowT - lastActivity.current[other] >= HOLD_MS ? game : cur));
    };
    socket.on('event:summary', (s: EventSummary | null) => setSummary(s));
    socket.on('room:state', (msg: { gameId: GameId; view: unknown }) => {
      if (msg.gameId === 'yutnori') setYView(msg.view as BoardView);
      else if (msg.gameId === 'bingo') setBView(msg.view as BingoView);
      bump(msg.gameId);
    });
    socket.on('board:update', () => bump('yutnori'));
    socket.on('throw:recorded', () => bump('yutnori'));
    socket.on('capture:announced', () => bump('yutnori'));
    socket.on('bingo:announced', (d: { number: number; nickname: string }) => {
      bump('bingo');
      setFlash(`🎉 #${d.number} ${d.nickname} 빙고!`);
      setTimeout(() => setFlash(null), 3000);
    });
    return () => {
      socket.close();
    };
  }, []);

  const active: GameId = useMemo(() => {
    if (summary?.projectorLock) return summary.projectorLock;
    const setting = summary?.projector ?? 'auto';
    return setting === 'auto' ? autoGame : setting;
  }, [summary, autoGame]);

  const removeReaction = (id: number) => setReactions((prev) => prev.filter((r) => r.id !== id));

  const screen = (() => {
    if (!summary) return <Standby summary={null} joinable={false} />;
    if (active === 'yutnori') {
      if (yView?.pendingMiniGame) return <MiniGameStage pending={yView.pendingMiniGame} games={yView.miniGames} />;
      if (yView && (yView.state === 'REVEAL' || yView.state === 'ENDED')) {
        return <Podium ranked={yutRank(yView.standings)} step={yView.state === 'ENDED' ? 0 : yView.revealStep} title="윷놀이" />;
      }
      // The board is always on screen once the game exists — SETUP, LOBBY or
      // RUNNING — exactly like /y. Standby only before any event.
      if (yView) return <YutnoriBoard view={yView} />;
      return <Standby summary={summary} joinable={false} />;
    }
    if (bView && (bView.state === 'REVEAL' || bView.state === 'ENDED')) {
      return <Podium ranked={bView.standings} step={bView.state === 'ENDED' ? 0 : bView.revealStep} title="빙고" />;
    }
    if (bView && (bView.state === 'RUNNING' || bView.state === 'LOBBY')) {
      return <BingoScreen view={bView} summary={summary} flash={flash} />;
    }
    return <Standby summary={summary} joinable={true} />;
  })();

  return (
    <>
      {screen}
      <Reactions items={reactions} onDone={removeReaction} />
      {bView && bView.roster.length > 0 ? <OnlineBox roster={bView.roster} /> : null}
      <FullscreenButton />
    </>
  );
}

/** A persistent bottom-left box of who's connected right now (Kahoot-style). */
function OnlineBox({ roster }: { roster: { n: number; id: string; name: string; conn: boolean }[] }) {
  const online = roster.filter((p) => p.conn);
  return (
    <div className="onlinebox">
      <div className="onlinebox__head">🟢 접속 {online.length}명</div>
      <ul className="onlinebox__list">
        {online.map((p) => (
          <li key={p.id} className="onlinebox__row">
            <span className="onlinebox__name">{p.name}</span>
            <span className="onlinebox__num">#{p.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Toggle the projector into true fullscreen — one tap before the event starts. */
function FullscreenButton() {
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const onChange = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  return (
    <button
      className="fsbtn"
      title={fs ? '전체화면 끄기' : '전체화면'}
      aria-label={fs ? '전체화면 끄기' : '전체화면'}
      onClick={() => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.();
      }}
    >
      <span aria-hidden="true">{fs ? '🡼🡾' : '⛶'}</span>
      <span className="fsbtn__label">{fs ? '전체화면 끄기' : '전체화면'}</span>
    </button>
  );
}
