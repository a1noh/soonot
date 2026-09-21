/**
 * 교회 사람 빙고 — the player's card, served at `/` (bingo spec §7, req §11).
 *
 * A phone opens this link, types a nickname, and gets a number and an 81-cell
 * card once the master starts. Filling a cell means naming a real person by
 * number or nickname; the server decides legality and this screen shows only
 * what it sent back (spec §7.4). Card privacy is structural: the socket only
 * ever delivers this player's own projection (spec §7.6).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CELLS, GRID } from '@soonot/bingo/src/shared/constants.js';
import { LINES } from '@soonot/bingo/src/shared/lines.js';
import { search, type Person } from './search.js';
import { usePlayer, type PlayerApi } from './usePlayer.js';
import '../shared/tokens.css';
import './player.css';

/** Client-side elapsed clock — bingo sends no ticks (spec §7.5). */
function Elapsed({ startedAt, offset }: { startedAt: number | null; offset: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (startedAt === null) return undefined;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (startedAt === null) return null;
  const s = Math.max(0, Math.floor((Date.now() + offset - startedAt) / 1000));
  return (
    <span className="hdr__clock">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

function JoinForm({ api }: { api: PlayerApi }) {
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <main className="screen screen--center">
      <form
        className="join"
        onSubmit={async (e) => {
          e.preventDefault();
          const name = nickname.trim();
          if (!name) return;
          setBusy(true);
          const res = await api.join(name);
          setBusy(false);
          if (!res.ok) setErr(res.error ?? '입장하지 못했어요');
        }}
      >
        <h1 className="join__title">교회 사람 빙고</h1>
        <p className="join__sub">{api.summary?.title ?? 'SOONOT'}</p>
        <label className="field">
          <span className="field__label">닉네임</span>
          <input
            className="field__input"
            value={nickname}
            autoFocus
            maxLength={20}
            placeholder="예) 민수"
            onChange={(e) => {
              setErr(null);
              setNickname(e.currentTarget.value);
            }}
          />
        </label>
        {err ? <p className="field__error" role="alert">{err}</p> : null}
        <button className="btn btn--primary btn--big" type="submit" disabled={busy || !nickname.trim()}>
          입장하기
        </button>
        <p className="join__hint">닉네임이 같아도 괜찮아요. 번호로 구분돼요.</p>
      </form>
    </main>
  );
}

/** The 참여 코드 gate — shown when the visitor arrived without a valid code in the
 *  URL. Scanning the projector QR (`/{code}`) skips straight past this. */
function CodeGate({ api }: { api: PlayerApi }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <main className="screen screen--center">
      <form
        className="join"
        onSubmit={(e) => {
          e.preventDefault();
          const c = code.trim();
          if (!c) return;
          if (!api.submitCode(c)) setErr('코드가 맞지 않아요');
        }}
      >
        <h1 className="join__title">교회 사람 빙고</h1>
        <p className="join__sub">{api.summary?.title ?? 'SOONOT'}</p>
        <label className="field">
          <span className="field__label">참여 코드</span>
          <input
            className="field__input field__input--code"
            value={code}
            autoFocus
            maxLength={8}
            autoCapitalize="characters"
            placeholder="예) MLMK"
            onChange={(e) => {
              setErr(null);
              setCode(e.currentTarget.value.toUpperCase());
            }}
          />
        </label>
        {err ? <p className="field__error" role="alert">{err}</p> : null}
        <button className="btn btn--primary btn--big" type="submit" disabled={!code.trim()}>
          입장
        </button>
        <p className="join__hint">화면(프로젝터)에 표시된 참여 코드를 입력하거나 QR을 스캔하세요.</p>
      </form>
    </main>
  );
}

function Waiting({ title, line, sub }: { title: string; line: string; sub?: string }) {
  return (
    <main className="screen screen--center">
      <div className="wait">
        <h1 className="wait__title">{title}</h1>
        <p className="wait__line">{line}</p>
        {sub ? <p className="wait__sub">{sub}</p> : null}
      </div>
    </main>
  );
}

function filledCount(fills: readonly (string | null)[]): number {
  let n = 0;
  for (const f of fills) if (f != null) n++;
  return n;
}

/** The set of cell indices in a fully completed line, for highlighting. */
function completedCells(completedLines: readonly string[]): Set<number> {
  const out = new Set<number>();
  for (const line of LINES) if (completedLines.includes(line.id)) for (const c of line.cells) out.add(c);
  return out;
}

function CellSheet({
  api,
  cellIndex,
  onClose,
}: {
  api: PlayerApi;
  cellIndex: number;
  onClose(): void;
}) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    api.clearCellError(cellIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellIndex]);

  const trait = api.traits[api.permutation[cellIndex] ?? -1] ?? '';
  const filled = api.fills[cellIndex] != null;
  const usedIds = useMemo(() => new Set(api.fills.filter((f): f is string => f != null)), [api.fills]);
  const myNumber = api.me?.number ?? null;

  const results = useMemo(() => search(api.roster, q).slice(0, 30), [api.roster, q]);

  if (filled) {
    const person = api.rosterById.get(api.fills[cellIndex] as string);
    return (
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <p className="sheet__trait">{trait}</p>
          <p className="sheet__filledby">
            {person ? `${person.name} #${person.n}` : '채워짐'} 님으로 채웠어요
          </p>
          <button
            className="btn btn--danger btn--big"
            onClick={() => {
              api.clear(cellIndex);
              onClose();
            }}
          >
            비우기
          </button>
          <button className="btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <p className="sheet__trait">{trait}</p>
        <p className="sheet__ask">이 특징에 맞는 사람을 찾아보세요</p>
        <input
          ref={inputRef}
          className="field__input"
          value={q}
          placeholder="번호, 이름, 또는 초성 (ㅁㅅ)"
          onChange={(e) => setQ(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q.trim()) {
              api.fill(cellIndex, q.trim());
              onClose();
            }
          }}
        />
        <ul className="results">
          {results.length === 0 && q.trim() ? <li className="results__empty">검색 결과가 없어요</li> : null}
          {results.map((p: Person) => {
            const isSelf = p.n === myNumber;
            const isUsed = usedIds.has(p.id);
            return (
              <li key={p.id}>
                <button
                  className="results__row"
                  disabled={isSelf || isUsed}
                  onClick={() => {
                    api.fill(cellIndex, String(p.n));
                    onClose();
                  }}
                >
                  <span className="results__name">{p.name}</span>
                  <span className="results__num">#{p.n}</span>
                  {isSelf ? <span className="results__tag">나</span> : null}
                  {isUsed && !isSelf ? <span className="results__tag">사용함</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <button className="btn" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}

function Picker({ api }: { api: PlayerApi }) {
  const c = api.candidates;
  if (!c) return null;
  return (
    <div className="sheet-backdrop" onClick={api.dismissCandidates}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <p className="sheet__ask">여러 명이에요. 누구인가요?</p>
        <ul className="results">
          {c.list.map((cand) => (
            <li key={cand.playerId}>
              <button className="results__row" onClick={() => api.pick(c.cellIndex, cand.playerId)}>
                <span className="results__name">{cand.nickname}</span>
                <span className="results__num">#{cand.number}</span>
              </button>
            </li>
          ))}
        </ul>
        <button className="btn" onClick={api.dismissCandidates}>취소</button>
      </div>
    </div>
  );
}

function CardScreen({ api }: { api: PlayerApi }) {
  const [openCell, setOpenCell] = useState<number | null>(null);
  const done = completedCells(api.completedLines);
  const filled = filledCount(api.fills);
  const running = api.phase === 'running';

  return (
    <main className="screen">
      <header className="hdr">
        <div className="hdr__id">
          <span className="hdr__num">#{api.me?.number ?? '—'}</span>
          <Elapsed startedAt={api.startedAt} offset={api.clockOffset} />
        </div>
        <div className="hdr__stats">
          <span>{filled}/{CELLS}칸</span>
          <span className={api.completedLines.length ? 'is-bingo' : ''}>빙고 {api.completedLines.length}줄</span>
          {!api.connected ? <span className="hdr__off">오프라인</span> : null}
        </div>
      </header>

      {api.phase === 'ended' ? (
        <p className="banner banner--ended">게임이 끝났어요! 결과를 기다려주세요.</p>
      ) : null}
      {api.phase === 'reveal' ? (
        <p className="banner banner--reveal">📊 순위 발표 중 — 큰 화면을 봐주세요</p>
      ) : null}

      <div className="grid" style={{ gridTemplateColumns: `repeat(${GRID}, 1fr)` }}>
        {api.permutation.map((traitId, i) => {
          const fillVal = api.fills[i];
          const isFilled = fillVal != null;
          const fb = api.cells.get(i);
          const state = fb?.error ? 'error' : fb?.pending !== undefined ? 'pending' : isFilled ? 'filled' : 'empty';
          return (
            <button
              key={i}
              className={`cell${done.has(i) ? ' cell--line' : ''}`}
              data-state={state}
              disabled={!running}
              onClick={() => running && setOpenCell(i)}
              title={api.traits[traitId] ?? ''}
            >
              <span className="cell__text">{api.traits[traitId] ?? ''}</span>
              {isFilled ? <span className="cell__mark" aria-hidden="true">{STAMPS[i % STAMPS.length]}</span> : null}
            </button>
          );
        })}
      </div>

      {openCell !== null ? <CellSheet api={api} cellIndex={openCell} onClose={() => setOpenCell(null)} /> : null}
      <Picker api={api} />
      {api.bingoFlash ? (
        // My own bingo starts with "빙고!" → a full-screen confetti party;
        // someone else's is a gentler floating pill.
        api.bingoFlash.startsWith('빙고') ? (
          <Celebration text={api.bingoFlash} />
        ) : (
          <div className="flash" role="status">{api.bingoFlash}</div>
        )
      ) : null}
      <ReactionBar api={api} />
    </main>
  );
}

/** Cute stamps dropped on a filled cell — varied by position so the card looks playful. */
const STAMPS = ['💖', '⭐', '🌸', '✨', '🍀', '🧸'];
const CONFETTI_COLORS = ['#ffc2dd', '#d9c4ff', '#b6f0d6', '#ffe6a3', '#bfe3ff', '#ffd2b8'];

/** A full-screen confetti + bouncing headline when the player gets a bingo. */
function Celebration({ text }: { text: string }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        left: (i * 37) % 100,
        jitter: ((i * 53) % 10) - 5,
        delay: ((i * 7) % 10) / 20,
        dur: 2.2 + (((i * 13) % 16) / 10),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [],
  );
  return (
    <div className="celebrate" role="status">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti"
          style={{
            left: `${Math.max(0, Math.min(100, p.left + p.jitter))}%`,
            background: p.color,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
      <div className="celebrate__text">{text}</div>
    </div>
  );
}

const REACTIONS = ['❤️', '👏', '🎉', '😂', '🔥', '👍'];

/** Tap an emoji → it floats up on the projector (Kahoot-style). */
function ReactionBar({ api }: { api: PlayerApi }) {
  // 도배 guard: a short cooldown after every tap, plus a rolling budget that
  // trips a longer lockout when someone hammers. (The host also rate-limits, but
  // stopping the spam on the phone is friendlier — the buttons visibly wait.)
  const COOLDOWN_MS = 1200; // between individual taps
  const BUDGET = 5; // taps allowed…
  const WINDOW_MS = 10_000; // …within this rolling window
  const LOCKOUT_MS = 6000; // before a longer timeout kicks in

  const [cooling, setCooling] = useState(false);
  const [locked, setLocked] = useState(false);
  const taps = useRef<number[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);

  const send = (e: string) => {
    if (cooling || locked) return;
    api.react(e);

    setCooling(true);
    timers.current.push(window.setTimeout(() => setCooling(false), COOLDOWN_MS));

    const now = Date.now();
    const recent = taps.current.filter((t) => now - t < WINDOW_MS);
    recent.push(now);
    taps.current = recent;
    if (recent.length >= BUDGET) {
      taps.current = [];
      setLocked(true);
      timers.current.push(window.setTimeout(() => setLocked(false), LOCKOUT_MS));
    }
  };

  const disabled = cooling || locked;
  return (
    <div className={`reactbar${disabled ? ' reactbar--wait' : ''}`}>
      {REACTIONS.map((e) => (
        <button
          key={e}
          className="reactbar__btn"
          aria-label={`${e} 보내기`}
          disabled={disabled}
          onClick={() => send(e)}
        >
          {e}
        </button>
      ))}
      {locked ? <span className="reactbar__hint">잠시 후에 다시 눌러주세요</span> : null}
    </div>
  );
}

export function App() {
  const api = usePlayer();
  switch (api.phase) {
    case 'connecting':
      return <Waiting title="교회 사람 빙고" line="연결 중…" />;
    case 'no-event':
      return <Waiting title="교회 사람 빙고" line="아직 열린 행사가 없어요" sub="잠시 후 다시 시도해주세요" />;
    case 'need-code':
      return <CodeGate api={api} />;
    case 'setup-wait':
      return <Waiting title={api.summary?.title ?? 'SOONOT'} line="곧 시작해요" sub="준비 중입니다" />;
    case 'need-join':
      return <JoinForm api={api} />;
    case 'lobby':
      return (
        <Waiting
          title={api.summary?.title ?? 'SOONOT'}
          line={`입장 완료! 당신은 #${api.me?.number ?? '—'}`}
          sub={`${api.counts.playerCount}명 참가 중 · 시작을 기다려주세요`}
        />
      );
    default:
      return <CardScreen api={api} />;
  }
}

