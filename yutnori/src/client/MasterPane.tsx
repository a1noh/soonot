/**
 * 윷놀이's console body (req §13.2) — the contents GamePane slots in.
 *
 * The master watches sticks thrown on a stage and taps what they landed on.
 * The app never rolls anything (req §7): randomness does not exist here.
 */
import { useState } from 'react';
import { ROLLS, DEFAULT_TIME_LIMIT_MIN, MIN_TEAMS } from '../shared/constants';
import type { Roll } from '../shared/types';
import type { BoardView } from '../project';
import { Clock } from './BoardSvg';

export interface MasterPaneProps {
  view: BoardView | null;
  send(ev: string, payload?: Record<string, unknown>): Promise<unknown>;
}

export function YutnoriMasterPane({ view, send }: MasterPaneProps) {
  if (!view) return <p className="pane__hint">불러오는 중…</p>;
  if (view.state === 'SETUP') return <SetupForm send={send} />;

  return (
    <div className="yut">
      <div className="yut__status">
        <Clock ms={view.remainingMs} paused={view.paused} />
        {view.state === 'RUNNING' ? (
          <strong className="yut__turn">{view.turnTeamName} 차례</strong>
        ) : (
          <strong className="yut__turn">{view.state}</strong>
        )}
        {view.throwQueue > 0 ? <span className="yut__owed">던질 횟수 {view.throwQueue}</span> : null}
      </div>

      {view.state === 'LOBBY' ? (
        <button className="btn btn--primary btn--big" onClick={() => void send('master:start')}>
          게임 시작
        </button>
      ) : null}

      {view.state === 'RUNNING' && !view.pending ? (
        <>
          <p className="yut__prompt">윷을 던진 결과를 눌러주세요</p>
          <div className="throwpad">
            {ROLLS.map((r: Roll) => (
              <button
                key={r}
                className="throwpad__key"
                disabled={view.throwQueue === 0}
                onClick={() => void send('master:throw', { roll: r })}
              >
                {r}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {view.pending ? (
        <>
          <p className="yut__prompt">
            <b>{view.pending.roll}</b> — 어느 말을 움직일까요?
          </p>
          <div className="malpicker">
            {view.pending.candidates.map((c) => (
              <button
                key={c.malId}
                className={`malpicker__key${c.captures.length ? ' is-capture' : ''}${
                  c.finishes ? ' is-finish' : ''
                }`}
                onClick={() => void send('master:move', { malId: c.malId })}
              >
                <span className="malpicker__from">{label(c.from)}</span>
                <span aria-hidden="true">→</span>
                <span className="malpicker__to">{label(c.to)}</span>
                {c.captures.length ? <em>잡기 {c.captures.length}</em> : null}
                {c.finishes ? <em>골인</em> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}

      <div className="yut__controls">
        <button className="btn" disabled={!view.canUndo} onClick={() => void send('master:undo')}>
          되돌리기
        </button>
        {view.state === 'RUNNING' ? (
          view.paused ? (
            <button className="btn" onClick={() => void send('master:resume')}>계속</button>
          ) : (
            <button className="btn" onClick={() => void send('master:pause')}>일시정지</button>
          )
        ) : null}
        <button className="btn" onClick={() => void send('master:extend', { minutes: 5 })}>
          +5분
        </button>
        {view.state === 'RUNNING' ? (
          <button className="btn btn--danger" onClick={() => void send('master:end')}>
            게임 종료
          </button>
        ) : null}
        {view.state === 'ENDED' ? (
          <button className="btn btn--primary" onClick={() => void send('master:reveal', { step: 0 })}>
            순위 발표
          </button>
        ) : null}
        {view.state === 'REVEAL' && view.revealStep < 4 ? (
          <button
            className="btn btn--primary"
            onClick={() => void send('master:reveal', { step: view.revealStep + 1 })}
          >
            다음 ({view.revealStep + 1}/4)
          </button>
        ) : null}
      </div>
    </div>
  );
}

function label(progress: number): string {
  if (progress === 0) return '대기';
  if (progress >= 20) return '집';
  return `${progress}칸`;
}

function SetupForm({ send }: { send: MasterPaneProps['send'] }) {
  const [raw, setRaw] = useState('청년 1조\n청년 2조\n장년부');
  const [malPerTeam, setMal] = useState<1 | 2>(2);
  const [minutes, setMinutes] = useState(DEFAULT_TIME_LIMIT_MIN);
  const teams = raw.split('\n').map((l) => l.trim()).filter(Boolean);

  return (
    <form
      className="yut-setup"
      onSubmit={(e) => {
        e.preventDefault();
        void send('master:setup', {
          teams: teams.map((name) => ({ name })),
          malPerTeam,
          timeLimitMin: minutes,
        });
      }}
    >
      <label className="field">
        <span className="field__label">팀 이름 (한 줄에 하나)</span>
        <textarea
          className="field__input"
          rows={4}
          value={raw}
          onChange={(e) => setRaw(e.currentTarget.value)}
        />
      </label>
      <div className="yut-setup__row">
        <label className="field">
          <span className="field__label">팀당 말</span>
          <select
            className="field__input"
            value={malPerTeam}
            onChange={(e) => setMal(Number(e.currentTarget.value) as 1 | 2)}
          >
            <option value={1}>1개</option>
            <option value={2}>2개</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">제한 시간(분)</span>
          <input
            className="field__input"
            type="number"
            min={1}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.currentTarget.value))}
          />
        </label>
      </div>
      <button className="btn btn--primary" type="submit" disabled={teams.length < MIN_TEAMS}>
        팀 {teams.length}개로 준비 완료
      </button>
    </form>
  );
}
