/**
 * 교회 사람 빙고's console body — the contents GamePane slots in for bingo
 * (bingo §11.3). Mirrors YutnoriMasterPane: the host owns the frame, this owns
 * the game-specific controls.
 *
 * The master curates one card's worth of traits (CELLS), starts the game,
 * watches a live dashboard (counts + who's online + top bingos), and drives the
 * shared reveal.
 */
import { useState } from 'react';
import type { MasterView } from '@soonot/bingo/src/project.js';
import { CELLS } from '@soonot/bingo/src/shared/constants.js';
import { STARTER_TRAITS } from '@soonot/bingo/src/shared/traits.js';

export interface BingoPaneProps {
  view: MasterView | null;
  send(ev: string, payload?: Record<string, unknown>): Promise<unknown>;
  /** Which winner's card is currently on /p (their number), from the event summary. */
  spotlight?: number | null;
}

const DEFAULT_TRAITS = STARTER_TRAITS.slice(0, CELLS).map((t) => t.text).join('\n');

export function BingoMasterPane({ view, send, spotlight = null }: BingoPaneProps) {
  if (!view) return <p className="pane__hint">불러오는 중…</p>;

  if (view.state === 'SETUP') return <TraitSetup send={send} />;

  return (
    <div className="bingo">
      <div className="bingo__stats">
        <Stat label="참가" value={`${view.connectedCount}/${view.playerCount}`} />
        <Stat label="빙고" value={String(view.bingoCount)} highlight={view.bingoCount > 0} />
        <Stat label="특징" value={String(view.traitCount)} />
      </div>

      {view.state === 'LOBBY' ? (
        <>
          <p className="bingo__prompt">
            {view.playerCount < 2 ? '참가자를 2명 이상 기다리는 중…' : '모두 준비되면 시작하세요'}
          </p>
          <Online view={view} />
          <button
            className="btn btn--primary btn--big"
            disabled={view.playerCount < 2}
            onClick={() => void send('master:start')}
          >
            게임 시작 ({view.playerCount}명)
          </button>
        </>
      ) : null}

      {view.state === 'RUNNING' ? (
        <>
          <Leaders view={view} />
          <Online view={view} />
          <button className="btn btn--danger" onClick={() => void send('master:end')}>
            게임 종료
          </button>
          <p className="bingo__note">
            종료해도 참가자는 남아 이모지로 윷놀이를 응원할 수 있어요. (내보내려면 “다시 하기”)
          </p>
        </>
      ) : null}

      {view.state === 'ENDED' ? (
        <>
          <RankBox view={view} />
          <button className="btn btn--primary" onClick={() => void send('master:reveal', { step: 0 })}>
            순위 발표
          </button>
          <WinnersPanel winners={view.winners} send={send} spotlight={spotlight} />
        </>
      ) : null}

      {view.state === 'REVEAL' ? (
        <>
          <RankBox view={view} />
          {view.revealStep < 4 ? (
            <button
              className="btn btn--primary"
              onClick={() => void send('master:reveal', { step: view.revealStep + 1 })}
            >
              다음 ({view.revealStep + 1}/4)
            </button>
          ) : (
            <p className="bingo__prompt">발표 완료</p>
          )}
          <p className="bingo__note">
            이대로 두면 참가자는 남아 윷놀이를 응원할 수 있어요. 새 판은 “다시 하기”.
          </p>
          <WinnersPanel winners={view.winners} send={send} spotlight={spotlight} />
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`bingo__stat${highlight ? ' is-hot' : ''}`}>
      <span className="bingo__stat-val">{value}</span>
      <span className="bingo__stat-label">{label}</span>
    </div>
  );
}

/** Who's here right now (req §7): only the CONNECTED players — offline folks (incl.
 *  ghosts recovered from a previous session) are not shown, so the list is always
 *  "who's actually here". A game reset clears them entirely. */
function Online({ view }: { view: MasterView }) {
  const online = view.roster.filter((p) => p.conn).sort((a, b) => a.n - b.n);
  return (
    <details className="online" open>
      <summary className="online__summary">
        접속 <b>{online.length}</b>명
      </summary>
      <ul className="online__list">
        {online.map((p) => (
          <li key={p.id} className="online__row is-on">
            <span className="online__dot" aria-hidden="true" />
            <span className="online__name">{p.name}</span>
            <span className="online__num">#{p.n}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The official ranking on the console during reveal — the operator sees the
 *  whole order (to build suspense) while the projector reveals bottom→top. */
function RankBox({ view }: { view: MasterView }) {
  return (
    <div className="rankbox">
      <p className="rankbox__head">
        순위 {view.state === 'REVEAL' ? `· 발표 ${view.revealStep}/4` : '· 발표 대기'}
        <span className="rankbox__hint">화면엔 3등→1등 순으로 공개돼요</span>
      </p>
      <ol className="rankbox__list">
        {view.standings.map((e, i) => {
          const rank = i + 1;
          const shown = view.state === 'REVEAL' && (view.revealStep >= 4 || view.revealStep >= 4 - rank);
          return (
            <li key={e.id} className={`rankbox__row${shown ? ' is-shown' : ''}${e.self ? ' is-self' : ''}`}>
              <span className="rankbox__rank">{e.medal ? ['🥇', '🥈', '🥉'][e.medal - 1] : rank}</span>
              <span className="rankbox__name">{e.label}</span>
              <span className="rankbox__detail">{e.detail}</span>
              {shown ? <span className="rankbox__live">화면 공개</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Interview tool: each top-3 winner and the people they named per trait. The
 *  operator interviews 1등 (and the named people); on a lie, checks 2등. Each
 *  winner has a “카드 띄우기” button that pushes their whole card to the projector
 *  (/p) so the room sees it during the interview. */
function WinnersPanel({
  winners,
  send,
  spotlight,
}: {
  winners: MasterView['winners'];
  send: BingoPaneProps['send'];
  spotlight: number | null;
}) {
  if (winners.length === 0) return null;
  const show = (n: number | null) => void send('projector:spotlight', { n });
  return (
    <details className="winners" open>
      <summary className="winners__summary">🎤 인터뷰 — 매칭한 사람들</summary>
      {spotlight != null ? (
        <button type="button" className="btn btn--ghost winners__hide" onClick={() => show(null)}>
          🙈 화면에서 카드 숨기기
        </button>
      ) : null}
      {winners.map((w) => {
        const on = spotlight === w.n;
        return (
        <div key={w.n} className={`winners__card${on ? ' is-live' : ''}`}>
          <div className="winners__head">
            <span className="winners__medal">{['🥇', '🥈', '🥉'][w.rank - 1] ?? `${w.rank}등`}</span>
            <b className="winners__name">{w.name} #{String(w.n).padStart(3, '0')}</b>
            <span className="winners__meta">{w.lines}줄 · {w.points}점</span>
            <button
              type="button"
              className={`btn winners__show${on ? ' is-on' : ''}`}
              onClick={() => show(on ? null : w.n)}
            >
              {on ? '📺 화면 표시 중' : '📺 카드 띄우기'}
            </button>
          </div>
          <ul className="winners__list">
            {w.matched.length === 0 ? (
              <li className="winners__empty">채운 칸이 없어요</li>
            ) : (
              w.matched.map((m, i) => (
                <li key={i} className="winners__row">
                  <span className="winners__trait">{m.trait}</span>
                  <span className="winners__who">{m.name} #{m.number}</span>
                </li>
              ))
            )}
          </ul>
        </div>
        );
      })}
    </details>
  );
}

function Leaders({ view }: { view: MasterView }) {
  if (view.leaders.length === 0) {
    return <p className="bingo__prompt">아직 빙고가 없어요</p>;
  }
  return (
    <ol className="bingo__leaders">
      {view.leaders.map((l, i) => (
        <li key={l.n}>
          <span className="bingo__rank">{i + 1}</span>
          <span className="bingo__leader-name">{l.name} <span className="bingo__num">#{l.n}</span></span>
          <span className="bingo__lines">{l.lines}줄</span>
        </li>
      ))}
    </ol>
  );
}

function TraitSetup({ send }: { send: BingoPaneProps['send'] }) {
  const [raw, setRaw] = useState(DEFAULT_TRAITS);
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const ok = lines.length === CELLS;

  return (
    <form
      className="bingo-setup"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) void send('master:setTraits', { texts: lines });
      }}
    >
      <label className="field">
        <span className="field__label">
          특징 목록 (한 줄에 하나, 정확히 {CELLS}개) —{' '}
          <b className={ok ? 'ok' : 'warn'}>{lines.length}/{CELLS}</b>
        </span>
        <textarea
          className="field__input bingo-setup__area"
          rows={10}
          value={raw}
          onChange={(e) => setRaw(e.currentTarget.value)}
        />
      </label>
      <div className="bingo-setup__row">
        <button type="button" className="btn" onClick={() => setRaw(DEFAULT_TRAITS)}>
          기본 {CELLS}개 불러오기
        </button>
        <button className="btn btn--primary" type="submit" disabled={!ok}>
          {CELLS}개로 준비 완료
        </button>
      </div>
    </form>
  );
}
