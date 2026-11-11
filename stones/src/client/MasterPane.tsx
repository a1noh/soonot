/**
 * 스톤's console body — the contents GamePane slots in.
 *
 * Teams take turns "choosing" a stone. Whatever they tap, the next game in the
 * order set here opens — the room never sees that order. Every team plays it;
 * the master ticks the winning team(s), and each gets that stone.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DEFAULT_GAMES, DEFAULT_STONES, DEFAULT_TEAMS, DEFAULT_TIEBREAK, MAX_STONES, MAX_TEAMS, MIN_TEAMS } from '../shared/constants';
import { playersLabel } from '../shared/labels';
import type { StonesView } from '../project';
import { Gem } from './Gem';

export interface StonesMasterPaneProps {
  view: StonesView | null;
  send(ev: string, payload?: Record<string, unknown>): Promise<unknown>;
}

export function StonesMasterPane({ view, send }: StonesMasterPaneProps) {
  const [editing, setEditing] = useState(false);
  const [winners, setWinners] = useState<Set<string>>(new Set());

  // A fresh pick starts with nobody ticked.
  const pendingKey = view?.pending ? `${view.pending.stoneId}:${view.played}` : null;
  useEffect(() => setWinners(new Set()), [pendingKey]);

  // After 순위 발표 the podium holds on 두구두구 (step 0); auto-advance to 3rd once.
  const drumRef = useRef(false);
  useEffect(() => {
    if (view?.state !== 'REVEAL') {
      drumRef.current = false;
      return undefined;
    }
    if (view.revealStep !== 0 || drumRef.current) return undefined;
    drumRef.current = true;
    const t = setTimeout(() => void send('master:reveal', { step: 1 }), 2500);
    return () => clearTimeout(t);
  }, [view?.state, view?.revealStep, send]);

  if (!view) return <p className="pane__hint">불러오는 중…</p>;
  if (view.state === 'SETUP' || (view.state === 'LOBBY' && editing)) {
    return (
      <SetupForm
        initial={view.state === 'LOBBY' ? view : null}
        onCancel={view.state === 'LOBBY' ? () => setEditing(false) : undefined}
        onSubmit={async (payload) => {
          await send('master:setup', payload);
          setEditing(false);
        }}
      />
    );
  }

  const chooser = view.teams.find((t) => t.id === view.turnTeamId) ?? null;
  const pending = view.pending;
  const playingCount = view.teams.filter((t) => t.playing).length;
  const allPlayed = view.played >= view.total;

  return (
    <div className="stn">
      {view.state === 'LOBBY' ? (
        <div className="stn__lobby">
          <p className="stn__lede">
            참가 팀 {playingCount}개 · 스톤 {view.stones.length}개 · 게임 {view.games?.length ?? 0}개. 시작하면 맨 위 팀부터 스톤을 골라요.
          </p>
          <div className="stn__row">
            <button type="button" className="btn btn--primary" onClick={() => void send('master:start')}>
              게임 시작
            </button>
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              설정 수정
            </button>
          </div>
        </div>
      ) : null}

      {view.state === 'RUNNING' && chooser ? (
        <div className="stn__turn" style={{ '--team': chooser.color } as CSSProperties}>
          <span className="stn__round">
            스톤 {Math.min(view.played + 1, view.total)}/{view.total}
          </span>
          <strong className="stn__teamname">{chooser.name}</strong>
          <span className="stn__turnlabel">{pending ? '이 고른 스톤' : '이 스톤을 골라요'}</span>
        </div>
      ) : null}

      {view.state === 'RUNNING' && !pending && view.nextGame ? (
        <p className="stn__secret">
          <span className="stn__secretlabel">다음에 열릴 게임 · 화면엔 안 보여요</span>
          <strong>
            {view.played + 1}. {view.nextGame.name}
          </strong>
          <span className="stn__players">{playersLabel(view.nextGame.players)}</span>
        </p>
      ) : null}

      {view.state === 'RUNNING' && pending ? (
        <section className="stn__mission" aria-label="진행 중인 게임">
          <header className="stn__missionhead">
            <Gem color={view.stones.find((s) => s.id === pending.stoneId)?.color ?? '#888888'} size={36} />
            <h3>
              {pending.number}. {pending.game.name}
            </h3>
            <span className="stn__players">{playersLabel(pending.game.players)}</span>
          </header>
          <p className="stn__missiontext">{pending.game.instructions || '설명이 비어 있어요.'}</p>

          <fieldset className="stn__winners">
            <legend>이긴 팀 (여러 팀 가능)</legend>
            {view.teams.map((t) => (
              <label key={t.id} className="stn-setup__chip" style={{ '--team': t.color } as CSSProperties}>
                <input
                  type="checkbox"
                  checked={winners.has(t.id)}
                  onChange={(e) => {
                    const next = new Set(winners);
                    if (e.currentTarget.checked) next.add(t.id);
                    else next.delete(t.id);
                    setWinners(next);
                  }}
                />
                <span>{t.name}</span>
              </label>
            ))}
          </fieldset>

          <div className="stn__judge">
            <button
              type="button"
              className={`btn ${winners.size > 0 ? 'stn__ok' : ''}`}
              onClick={() => {
                if (winners.size === 0 && !confirm('아무 팀도 이 스톤을 얻지 못한 걸로 할까요?')) return;
                void send('master:resolve', { winners: view.teams.filter((t) => winners.has(t.id)).map((t) => t.id) });
              }}
            >
              {winners.size > 0 ? `${winners.size}팀에게 스톤 주기` : '이긴 팀 없음'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => void send('master:cancel')}>
              선택 취소
            </button>
          </div>
        </section>
      ) : null}

      {view.state === 'RUNNING' && !pending && !allPlayed ? (
        <div className="stn__stones" role="group" aria-label={`${chooser?.name ?? ''} 팀이 고를 스톤`}>
          {view.stones.map((s) => (
            <button
              key={s.id}
              type="button"
              className="stn__stone"
              disabled={s.claimed !== null}
              onClick={() => void send('master:pick', { stone: s.id })}
            >
              <Gem color={s.color} size={30} dim={s.claimed !== null} />
              <span className="stn__stonename">{s.name}</span>
              {s.claimed ? <span className="stn__stonetag">완료</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {view.state === 'RUNNING' && allPlayed ? (
        <p className="stn__done">스톤을 모두 썼어요. 게임 종료를 누르고 순위를 발표하세요.</p>
      ) : null}

      <section className="stn__teams" aria-label="참가 팀">
        <h3 className="stn__h">참가 팀 · 스톤을 고르는 차례에 들어가요</h3>
        <ul>
          {view.teams.map((t) => (
            <li
              key={t.id}
              className={`stn__team${t.playing ? '' : ' is-out'}${t.id === view.turnTeamId && view.state === 'RUNNING' ? ' is-turn' : ''}`}
            >
              <label className="stn__teamtoggle">
                <input
                  type="checkbox"
                  checked={t.playing}
                  disabled={
                    view.state === 'ENDED' ||
                    view.state === 'REVEAL' ||
                    (t.playing && playingCount <= (view.state === 'LOBBY' ? MIN_TEAMS : 1)) ||
                    view.pending?.chooserId === t.id
                  }
                  onChange={(e) => void send('master:playing', { team: t.id, playing: e.currentTarget.checked })}
                />
                <span className="stn__swatch" style={{ background: t.color }} aria-hidden="true" />
                <span className="stn__tname">{t.name}</span>
              </label>
              <span className="stn__held" aria-label={`스톤 ${t.stoneIds.length}개`}>
                {view.stones.map((s) => (
                  <Gem key={s.id} color={s.color} size={16} dim={!t.stoneIds.includes(s.id)} />
                ))}
                <span className="stn__count">{t.stoneIds.length}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {view.state === 'ENDED' && view.activeTiebreak ? (
        <TiebreakPanel view={view} send={send} />
      ) : null}

      {view.state === 'ENDED' && !view.activeTiebreak && (view.tiedGroups?.length ?? 0) > 0 ? (
        <section className="stn__ties" aria-label="동점">
          {view.tiedGroups!.map((g) => {
            const place = view.standings.find((s) => s.teamId === g[0])?.rank ?? 0;
            const names = g.map((id) => view.teams.find((t) => t.id === id)?.name ?? id).join(' · ');
            return (
              <div key={g.join()} className="stn__tie">
                <span className="stn__tieplace">공동 {place}위</span>
                <span className="stn__tienames">{names}</span>
                <button
                  type="button"
                  className={`btn ${place <= 3 ? 'btn--primary' : ''}`}
                  onClick={() => void send('master:tiebreak:start', { teamIds: g })}
                >
                  동점 결정전 · {view.tiebreak?.name ?? '엔드게임'}
                </button>
              </div>
            );
          })}
        </section>
      ) : null}

      {view.state === 'ENDED' || view.state === 'REVEAL' ? (
        <div className="rankbox">
          <p className="rankbox__head">
            순위 {view.state === 'REVEAL' ? `· 발표 ${view.revealStep}/4` : '· 발표 대기'}
            <span className="rankbox__hint">화면엔 3위 → 2위 → 1위 순서로 공개돼요</span>
          </p>
          <ol className="rankbox__list">
            {view.standings.map((s, i) => {
              const shown = view.state === 'REVEAL' && (view.revealStep >= 4 || (i < 3 && view.revealStep >= 3 - i));
              return (
                <li key={s.teamId} className={`rankbox__row${shown ? ' is-shown' : ''}`}>
                  <span className="rankbox__rank">{s.rank}</span>
                  <span className="rankbox__name">{s.teamName}</span>
                  {view.tiedGroups?.some((g) => g.includes(s.teamId)) ? <span className="stn__tiechip">동점</span> : null}
                  <span className="rankbox__detail">스톤 {s.stoneIds.length}개</span>
                  {shown ? <span className="rankbox__live">화면 공개</span> : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      <div className="stn__controls">
        {view.state === 'RUNNING' ? (
          <>
            <button type="button" className="btn" disabled={!!pending || allPlayed} onClick={() => void send('master:skip')}>
              건너뛰기
            </button>
            <button type="button" className="btn" disabled={!view.canUndo || !!pending} onClick={() => void send('master:undo')}>
              되돌리기
            </button>
            <button
              type="button"
              className={`btn ${allPlayed ? 'btn--primary' : 'btn--danger'}`}
              onClick={() => {
                if (allPlayed || confirm('스톤 게임을 끝내고 순위를 정할까요?')) void send('master:end');
              }}
            >
              게임 종료
            </button>
          </>
        ) : null}
        {view.state === 'ENDED' ? (
          <>
            <button type="button" className="btn" disabled={!!view.activeTiebreak} onClick={() => void send('master:resumeFromEnded')}>
              다시 이어하기
            </button>
            {view.canUndoTiebreak ? (
              <button type="button" className="btn" onClick={() => void send('master:undo')}>
                결정전 되돌리기
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--primary"
              disabled={!!view.activeTiebreak}
              onClick={() => {
                const topTie = (view.tiedGroups ?? []).some((g) => (view.standings.find((s) => s.teamId === g[0])?.rank ?? 99) <= 3);
                if (topTie && !confirm('3위 안에 동점이 남아 있어요. 그대로 공동 순위로 발표할까요?')) return;
                void send('master:reveal', { step: 0 });
              }}
            >
              순위 발표
            </button>
          </>
        ) : null}
        {view.state === 'REVEAL' && view.revealStep < 4 ? (
          <button type="button" className="btn btn--primary" onClick={() => void send('master:reveal', { step: view.revealStep + 1 })}>
            다음 ({view.revealStep + 1}/4)
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The open 결정전: the game card, then tap the teams in finishing order. */
function TiebreakPanel({ view, send }: StonesMasterPaneProps & { view: StonesView }) {
  const tb = view.activeTiebreak!;
  const [order, setOrder] = useState<string[]>([]);
  const key = tb.teams.map((t) => t.id).join();
  useEffect(() => setOrder([]), [key]);
  return (
    <section className="stn__mission stn__mission--tiebreak" aria-label="동점 결정전">
      <header className="stn__missionhead">
        <h3>동점 결정전 · {tb.game.name}</h3>
        <span className="stn__players">{playersLabel(tb.game.players)}</span>
      </header>
      <p className="stn__missiontext">{tb.game.instructions}</p>
      <fieldset className="stn__winners">
        <legend>들어온 순서대로 누르세요 (1등부터)</legend>
        {tb.teams.map((t) => {
          const at = order.indexOf(t.id);
          return (
            <button
              key={t.id}
              type="button"
              className={`stn__orderbtn${at >= 0 ? ' is-set' : ''}`}
              style={{ '--team': t.color } as CSSProperties}
              aria-pressed={at >= 0}
              onClick={() => setOrder(at >= 0 ? order.filter((id) => id !== t.id) : [...order, t.id])}
            >
              <span className="stn__ordernum">{at >= 0 ? `${at + 1}` : '–'}</span>
              {t.name}
            </button>
          );
        })}
      </fieldset>
      <div className="stn__judge">
        <button
          type="button"
          className="btn stn__ok"
          disabled={order.length !== tb.teams.length}
          onClick={() => void send('master:tiebreak:resolve', { order })}
        >
          결과 확정
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => void send('master:tiebreak:cancel')}>
          취소
        </button>
      </div>
    </section>
  );
}

type SetupPayload = {
  teams: { name: string; playing: boolean }[];
  stones: { name: string }[];
  games: { name: string; players: string; instructions: string }[];
  tiebreak: { name: string; players: string; instructions: string };
};

const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);

function SetupForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: StonesView | null;
  onSubmit(p: SetupPayload): Promise<void>;
  onCancel?: () => void;
}) {
  const [teamText, setTeamText] = useState((initial ? initial.teams.map((t) => t.name) : DEFAULT_TEAMS).join('\n'));
  const [sitOut, setSitOut] = useState<Set<string>>(
    () => new Set(initial ? initial.teams.filter((t) => !t.playing).map((t) => t.name) : []),
  );
  const [stoneText, setStoneText] = useState((initial ? initial.stones.map((s) => s.name) : DEFAULT_STONES).join('\n'));
  const [gameText, setGameText] = useState(
    (initial?.games ?? DEFAULT_GAMES).map((g) => `${g.name} | ${g.players} | ${g.instructions}`).join('\n'),
  );
  const tb0 = initial?.tiebreak ?? DEFAULT_TIEBREAK;
  const [tbText, setTbText] = useState(`${tb0.name} | ${tb0.players} | ${tb0.instructions}`);
  const [busy, setBusy] = useState(false);

  const names = useMemo(() => lines(teamText), [teamText]);
  const stones = useMemo(() => lines(stoneText), [stoneText]);
  const games = useMemo(
    () =>
      lines(gameText).map((l) => {
        const [name = '', players = '', ...rest] = l.split('|');
        return { name: name.trim(), players: players.trim(), instructions: rest.join('|').trim() };
      }),
    [gameText],
  );
  const playing = names.filter((n) => !sitOut.has(n));
  const problem =
    names.length !== new Set(names).size
      ? '팀 이름이 겹쳐요.'
      : names.length > MAX_TEAMS
        ? `팀은 ${MAX_TEAMS}개까지예요.`
        : playing.length < MIN_TEAMS
          ? `참가 팀을 ${MIN_TEAMS}개 이상 골라주세요.`
          : stones.length === 0
            ? '스톤을 1개 이상 적어주세요.'
            : stones.length > MAX_STONES
              ? `스톤은 ${MAX_STONES}개까지예요.`
              : games.length === 0
                ? '게임을 1개 이상 적어주세요.'
                : null;
  const mismatch =
    !problem && games.length !== stones.length
      ? `스톤 ${stones.length}개, 게임 ${games.length}개 — ${Math.min(games.length, stones.length)}판만 진행돼요.`
      : null;

  return (
    <form
      className="stn-setup"
      onSubmit={(e) => {
        e.preventDefault();
        if (problem || busy) return;
        setBusy(true);
        void onSubmit({
          teams: names.map((name) => ({ name, playing: !sitOut.has(name) })),
          stones: stones.map((name) => ({ name })),
          games,
          tiebreak: (() => {
            const [name = '', players = '', ...rest] = tbText.split('|');
            return { name: name.trim(), players: players.trim(), instructions: rest.join('|').trim() };
          })(),
        }).finally(() => setBusy(false));
      }}
    >
      <label className="field">
        <span className="field__label">팀 이름 (한 줄에 하나)</span>
        <textarea className="field__input" rows={Math.min(Math.max(names.length + 1, 4), 9)} value={teamText} onChange={(e) => setTeamText(e.currentTarget.value)} />
      </label>

      {names.length > 0 ? (
        <fieldset className="stn-setup__who">
          <legend>스톤을 고르는 차례에 넣을 팀</legend>
          {names.map((n) => (
            <label key={n} className="stn-setup__chip">
              <input
                type="checkbox"
                checked={!sitOut.has(n)}
                onChange={(e) => {
                  const next = new Set(sitOut);
                  if (e.currentTarget.checked) next.delete(n);
                  else next.add(n);
                  setSitOut(next);
                }}
              />
              <span>{n}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <label className="field">
        <span className="field__label">스톤 (한 줄에 하나)</span>
        <textarea className="field__input" rows={Math.min(Math.max(stones.length + 1, 4), 9)} value={stoneText} onChange={(e) => setStoneText(e.currentTarget.value)} />
      </label>

      <label className="field">
        <span className="field__label">게임 순서 · 이름 | 인원 | 설명 (한 줄에 하나)</span>
        <textarea className="field__input stn-setup__games" rows={Math.min(Math.max(games.length + 1, 4), 10)} value={gameText} onChange={(e) => setGameText(e.currentTarget.value)} />
        <span className="stn-setup__hint">
          어떤 스톤을 고르든 이 순서대로 열려요. 팀들에겐 순서가 보이지 않아요. 인원은 “2명”, “모두”처럼 적어요.
        </span>
      </label>

      <label className="field">
        <span className="field__label">동점 결정전 · 이름 | 인원 | 설명</span>
        <textarea className="field__input stn-setup__games" rows={2} value={tbText} onChange={(e) => setTbText(e.currentTarget.value)} />
        <span className="stn-setup__hint">게임이 끝나고 스톤 수가 같은 팀끼리만 해요.</span>
      </label>

      {problem ? <p className="stn-setup__problem" role="alert">{problem}</p> : null}
      {mismatch ? <p className="stn-setup__problem">{mismatch}</p> : null}
      <div className="stn__row">
        <button type="submit" className="btn btn--primary" disabled={!!problem || busy}>
          {initial ? '설정 저장' : `${playing.length}팀 · 스톤 ${stones.length}개로 준비`}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            취소
          </button>
        ) : null}
      </div>
    </form>
  );
}
