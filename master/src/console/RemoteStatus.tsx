/**
 * What the 진행 순서 remote shows of a game: status, never a second set of
 * "do the next thing" buttons — 다음 ▶ is the one way forward. The only taps here
 * are the room's choices (the 결정전 finishing order); full controls stay in
 * each game's own tab for emergencies.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { addBots, botCount, clearBots, onBotsChange } from './bots.js';
import { drawCheck } from './BingoPane.js';
import type { MasterView } from '@soonot/bingo/src/project.js';
import type { StonesView } from '@soonot/stones/src/project.js';
import { TiebreakPanel } from '@soonot/stones/src/client/MasterPane.js';

const MEDAL = ['🥇', '🥈', '🥉'];

export function BingoStatus({
  view,
  spotlight,
  check,
  prepare,
  send,
}: {
  view: MasterView | null;
  spotlight: number | null;
  check: number[] | null;
  /** 빙고 준비 (traits) — so 🤖 테스트 봇 works even before bingo is open. */
  prepare?: () => Promise<unknown>;
  /** For 카드 보기 / 랜덤 5명 on any of the top 3 (projector ops). */
  send?: (ev: string, payload?: Record<string, unknown>) => Promise<unknown>;
}) {
  if (!view) return <p className="rs__hint">불러오는 중…</p>;
  const shown = view.winners.find((w) => w.n === spotlight) ?? null;
  const calling = check && shown ? check.map((i) => shown.grid[i]).filter((c) => c?.name) : null;
  const act = (ev: string, payload: Record<string, unknown>) => void send?.(ev, payload).catch(() => {});
  return (
    <div className="rs">
      <div className="rs__stats">
        <span className="rs__stat">
          <b>{view.connectedCount}</b>명 접속
        </span>
        <span className="rs__stat">
          <b>{view.playerCount}</b>명 참가
        </span>
        <span className={`rs__stat${view.bingoCount ? ' is-hot' : ''}`}>
          빙고 <b>{view.bingoCount}</b>
        </span>
      </div>

      {calling && calling.length ? (
        <div className="rs__call">
          <p className="rs__callhead">🎤 불러서 확인할 5명 · {shown?.name}의 카드</p>
          <ol>
            {calling.map((c, i) => (
              <li key={i}>
                <b>{c!.name}</b> <span>{(c as { trait?: string }).trait}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {view.state === 'SETUP' || view.state === 'LOBBY' || view.state === 'RUNNING' ? (
        <BotsBar prepare={view.state === 'SETUP' ? prepare : undefined} />
      ) : null}

      {view.state === 'SETUP' ? <p className="rs__hint">다음 ▶ 으로 특징 25개를 넣고 입장을 열어요.</p> : null}
      {view.state === 'LOBBY' ? <p className="rs__hint">QR로 들어오는 중이에요. 2명 이상이면 다음 ▶ 으로 시작해요.</p> : null}

      {view.state === 'RUNNING' ? (
        view.leaders.length ? (
          <ol className="rs__list">
            {view.leaders.slice(0, 5).map((l, i) => (
              <li key={l.n}>
                <span className="rs__rank">{i + 1}</span>
                <span className="rs__name">
                  {l.name} <small>#{l.n}</small>
                </span>
                <span className="rs__val">{l.lines}줄</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rs__hint">아직 빙고가 없어요.</p>
        )
      ) : null}

      {(view.state === 'ENDED' || view.state === 'REVEAL') && view.winners.length ? (
        <ol className="rs__list">
          {view.winners.slice(0, 3).map((w) => (
            <li key={w.n} className={`rs__winner${spotlight === w.n ? ' is-live' : ''}`}>
              <span className="rs__rank">{MEDAL[w.rank - 1] ?? w.rank}</span>
              <span className="rs__name">
                {w.name} <small>#{w.n}</small>
                <span className="rs__val">
                  {w.lines}줄 · {w.points}점
                </span>
              </span>
              {send ? (
                <span className="rs__cardbtns">
                  {spotlight === w.n ? (
                    <>
                      <button type="button" className="btn btn--sm" disabled={w.matched.length === 0} onClick={() => act('projector:check', { cells: drawCheck(w.grid) })}>
                        🎲 {check ? '다시 뽑기' : '랜덤 5명'}
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => act('projector:spotlight', { n: null })}>
                        카드 내리기
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn--sm rs__show" onClick={() => act('projector:spotlight', { n: w.n })}>
                      📺 카드 보기
                    </button>
                  )}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

    </div>
  );
}

export function StonesStatus({ view, send }: { view: StonesView | null; send(ev: string, payload?: Record<string, unknown>): Promise<unknown> }) {
  if (!view) return <p className="rs__hint">불러오는 중…</p>;
  if (view.state === 'ENDED' && view.activeTiebreak) return <TiebreakPanel view={view} send={send} />;
  if (view.state === 'SETUP') {
    return <p className="rs__hint">다음 ▶ 으로 기본 설정(팀 6 · 스톤 6 · 게임 6)을 넣어요. 바꾸려면 스톤 탭에서 설정하세요.</p>;
  }
  if (view.state === 'LOBBY') {
    return (
      <div className="rs">
        <div className="rs__teams">
          {view.teams.map((t) => (
            <span key={t.id} className="rs__team" style={{ '--team': t.color } as CSSProperties}>
              {t.name}
            </span>
          ))}
        </div>
        <p className="rs__hint">다음 ▶ 으로 스톤 게임을 시작해요.</p>
      </div>
    );
  }
  const tied = new Set((view.tiedGroups ?? []).flat());
  return (
    <ol className="rs__list">
      {view.standings.map((s) => (
        <li key={s.teamId} style={{ '--team': s.color } as CSSProperties}>
          <span className="rs__rank">{s.rank}</span>
          <span className="rs__name rs__name--team">
            {s.teamName}
            {tied.has(s.teamId) ? <span className="rs__tie">1위 동점</span> : null}
            {view.secretStone?.teamId === s.teamId ? <span className="rs__secret">✨ {view.secretStone.name}</span> : null}
          </span>
          <span className="rs__val">스톤 {s.stoneIds.length}개</span>
        </li>
      ))}
    </ol>
  );
}

/** 🤖 테스트 봇: rehearsal players run from this tab (see bots.ts). */
export function BotsBar({ prepare }: { prepare?: () => Promise<unknown> }) {
  const [n, setN] = useState(botCount());
  const [busy, setBusy] = useState(false);
  useEffect(() => onBotsChange(() => setN(botCount())), []);
  return (
    <div className="rs__bots">
      <button
        type="button"
        className="btn rs__botbtn"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          // Not open yet: 빙고 준비 first, then the bots can join.
          void (prepare ? prepare().then(() => new Promise((r) => window.setTimeout(r, 700))) : Promise.resolve())
            .then(() => addBots(12))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? '🤖 들어오는 중…' : '🤖 테스트 봇 12명 넣기'}
      </button>
      {n > 0 ? (
        <>
          <span className="rs__botn">봇 {n}명 · 빙고가 시작되면 칸을 채워요</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={clearBots}>
            봇 내보내기
          </button>
        </>
      ) : (
        <span className="rs__botn">리허설용 · 휴대폰 없이 빙고를 돌려 봐요</span>
      )}
    </div>
  );
}
