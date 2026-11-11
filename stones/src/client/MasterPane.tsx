/**
 * 스톤's console body — the contents GamePane slots in.
 *
 * Each turn the master picks a stone for the team whose turn it is, the
 * projector opens its mission, and the master calls 성공 or 실패.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DEFAULT_STONES, DEFAULT_TEAMS, MAX_STONES, MAX_TEAMS, MIN_TEAMS } from '../shared/constants';
import type { StonesView } from '../project';
import { Gem } from './Gem';

export interface StonesMasterPaneProps {
  view: StonesView | null;
  send(ev: string, payload?: Record<string, unknown>): Promise<unknown>;
}

export function StonesMasterPane({ view, send }: StonesMasterPaneProps) {
  const [editing, setEditing] = useState(false);

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

  const turnTeam = view.teams.find((t) => t.id === view.turnTeamId) ?? null;
  const held = new Set(turnTeam?.stoneIds ?? []);
  const pendingStone = view.pending ? view.stones.find((s) => s.id === view.pending!.stoneId) ?? null : null;
  const playingCount = view.teams.filter((t) => t.playing).length;

  return (
    <div className="stn">
      {view.state === 'LOBBY' ? (
        <div className="stn__lobby">
          <p className="stn__lede">
            참가 팀 {playingCount}개 · 스톤 {view.stones.length}개. 시작하면 위 팀부터 차례로 진행해요.
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

      {view.state === 'RUNNING' && turnTeam ? (
        <div className="stn__turn" style={{ '--team': turnTeam.color } as CSSProperties}>
          <span className="stn__round">{view.round}라운드</span>
          <strong className="stn__teamname">{turnTeam.name}</strong>
          <span className="stn__turnlabel">차례</span>
        </div>
      ) : null}

      {view.state === 'RUNNING' && pendingStone ? (
        <section className="stn__mission" aria-label="진행 중인 미션">
          <header className="stn__missionhead">
            <Gem color={pendingStone.color} size={36} />
            <h3>{pendingStone.name}</h3>
          </header>
          <p className="stn__missiontext">{pendingStone.mission || '미션이 비어 있어요.'}</p>
          <div className="stn__judge">
            <button type="button" className="btn stn__ok" onClick={() => void send('master:resolve', { success: true })}>
              성공
            </button>
            <button type="button" className="btn stn__fail" onClick={() => void send('master:resolve', { success: false })}>
              실패
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => void send('master:cancel')}>
              선택 취소
            </button>
          </div>
        </section>
      ) : null}

      {view.state === 'RUNNING' && !pendingStone ? (
        <div className="stn__stones" role="group" aria-label={`${turnTeam?.name ?? ''} 팀이 도전할 스톤`}>
          {view.stones.map((s) => {
            const has = held.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                className="stn__stone"
                disabled={has}
                onClick={() => void send('master:pick', { stone: s.id })}
              >
                <Gem color={s.color} size={30} dim={has} />
                <span className="stn__stonename">{s.name}</span>
                {has ? <span className="stn__stonetag">보유</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <section className="stn__teams" aria-label="참가 팀">
        <h3 className="stn__h">참가 팀</h3>
        <ul>
          {view.teams.map((t) => (
            <li key={t.id} className={`stn__team${t.playing ? '' : ' is-out'}${t.id === view.turnTeamId && view.state === 'RUNNING' ? ' is-turn' : ''}`}>
              <label className="stn__teamtoggle">
                <input
                  type="checkbox"
                  checked={t.playing}
                  disabled={
                    view.state === 'ENDED' ||
                    view.state === 'REVEAL' ||
                    (t.playing && playingCount <= (view.state === 'LOBBY' ? MIN_TEAMS : 1)) ||
                    view.pending?.teamId === t.id
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
            <button type="button" className="btn" disabled={!!view.pending} onClick={() => void send('master:skip')}>
              건너뛰기
            </button>
            <button type="button" className="btn" disabled={!view.canUndo || !!view.pending} onClick={() => void send('master:undo')}>
              되돌리기
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                if (confirm('스톤 게임을 끝내고 순위를 정할까요?')) void send('master:end');
              }}
            >
              게임 종료
            </button>
          </>
        ) : null}
        {view.state === 'ENDED' ? (
          <>
            <button type="button" className="btn" onClick={() => void send('master:resumeFromEnded')}>
              다시 이어하기
            </button>
            <button type="button" className="btn btn--primary" onClick={() => void send('master:reveal', { step: 0 })}>
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

type SetupPayload = {
  teams: { name: string; playing: boolean }[];
  stones: { name: string; mission: string }[];
};

function SetupForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: StonesView | null;
  onSubmit(p: SetupPayload): Promise<void>;
  onCancel?: () => void;
}) {
  const [teamText, setTeamText] = useState(
    initial ? initial.teams.map((t) => t.name).join('\n') : DEFAULT_TEAMS.join('\n'),
  );
  const [sitOut, setSitOut] = useState<Set<string>>(
    () => new Set(initial ? initial.teams.filter((t) => !t.playing).map((t) => t.name) : []),
  );
  const [stoneText, setStoneText] = useState(
    (initial ? initial.stones : DEFAULT_STONES).map((s) => `${s.name} | ${s.mission}`).join('\n'),
  );
  const [busy, setBusy] = useState(false);

  const names = useMemo(
    () => teamText.split('\n').map((l) => l.trim()).filter(Boolean),
    [teamText],
  );
  const stones = useMemo(
    () =>
      stoneText
        .split('\n')
        .map((l) => {
          const [name = '', ...rest] = l.split('|');
          return { name: name.trim(), mission: rest.join('|').trim() };
        })
        .filter((s) => s.name),
    [stoneText],
  );
  const playing = names.filter((n) => !sitOut.has(n));
  const dupes = names.length !== new Set(names).size;
  const problem = dupes
    ? '팀 이름이 겹쳐요.'
    : names.length > MAX_TEAMS
      ? `팀은 ${MAX_TEAMS}개까지예요.`
      : playing.length < MIN_TEAMS
        ? `참가 팀을 ${MIN_TEAMS}개 이상 골라주세요.`
        : stones.length === 0
          ? '스톤을 1개 이상 적어주세요.'
          : stones.length > MAX_STONES
            ? `스톤은 ${MAX_STONES}개까지예요.`
            : null;

  return (
    <form
      className="stn-setup"
      onSubmit={(e) => {
        e.preventDefault();
        if (problem || busy) return;
        setBusy(true);
        void onSubmit({ teams: names.map((name) => ({ name, playing: !sitOut.has(name) })), stones }).finally(() =>
          setBusy(false),
        );
      }}
    >
      <label className="field">
        <span className="field__label">팀 이름 (한 줄에 하나)</span>
        <textarea className="field__input" rows={Math.min(Math.max(names.length + 1, 4), 9)} value={teamText} onChange={(e) => setTeamText(e.currentTarget.value)} />
      </label>

      {names.length > 0 ? (
        <fieldset className="stn-setup__who">
          <legend>이번 게임에 참가할 팀</legend>
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
        <span className="field__label">스톤 | 미션 (한 줄에 하나)</span>
        <textarea className="field__input" rows={Math.min(Math.max(stones.length + 1, 4), 10)} value={stoneText} onChange={(e) => setStoneText(e.currentTarget.value)} />
      </label>

      {problem ? <p className="stn-setup__problem" role="alert">{problem}</p> : null}
      <div className="stn__row">
        <button type="submit" className="btn btn--primary" disabled={!!problem || busy}>
          {initial ? '설정 저장' : `참가 ${playing.length}팀 · 스톤 ${stones.length}개로 준비`}
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
