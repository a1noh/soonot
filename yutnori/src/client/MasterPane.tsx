/**
 * 윷놀이's console body (req §13.2) — the contents GamePane slots in.
 *
 * The master watches sticks thrown on a stage and taps what they landed on.
 * The app never rolls anything (req §7): randomness does not exist here.
 */
import { useEffect, useState } from 'react';
import { ROLLS, DEFAULT_TIME_LIMIT_MIN, MIN_TEAMS } from '../shared/constants';
import { MINI_GAMES } from '../shared/minigames';
import { nodeLabel, advancementOf } from '../shared/board';
import type { MoveCandidate, Roll } from '../shared/types';
import type { BoardView } from '../project';
import { Clock } from './BoardSvg';

/** '말 2' from a malId like 't1m2' — so the picker says which piece moves. */
function malLabel(malId: string): string {
  const n = malId.split('m').pop();
  return n ? `말 ${n}` : malId;
}

const stationLabel = nodeLabel; // 대기 / 집 / 모 / 뒷모 / 방 / 지름길 / N칸

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

      {view.pendingMiniGame ? <MiniGamePanel view={view} send={send} /> : null}

      {view.state === 'RUNNING' && !view.pending && !view.pendingMiniGame ? (
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

      {view.pending && !view.pendingMiniGame ? (
        <>
          <p className="yut__prompt">
            <b>{view.pending.roll}</b> — {view.turnTeamName} · 어느 말을 움직일까요?
          </p>
          {(() => {
            // Help an operator who doesn't know 윷놀이: mark the move that ends up
            // CLOSEST to 집 (usually the 지름길). Capture/골인 tags still show so they
            // can weigh a catch or a finish against pure speed.
            const cands = view.pending!.candidates;
            const maxAdv = Math.max(...cands.map((c) => advancementOf(c.to)));
            const someFar = cands.some((c) => advancementOf(c.to) < maxAdv); // only hint when it's a real choice
            return (
              <div className="malpicker">
                {cands.map((c: MoveCandidate) => {
                  const fastest = someFar && advancementOf(c.to) === maxAdv;
                  return (
                    <button
                      key={`${c.malId}-${c.to}`}
                      className={`malpicker__key${c.captures.length ? ' is-capture' : ''}${
                        c.finishes ? ' is-finish' : ''
                      }${fastest ? ' is-fast' : ''}`}
                      onClick={() => void send('master:move', { malId: c.malId, to: c.to })}
                    >
                      <strong className="malpicker__mal">{malLabel(c.malId)}</strong>
                      <span className="malpicker__path">
                        <span className="malpicker__from">{stationLabel(c.from)}</span>
                        <span aria-hidden="true">→</span>
                        <span className="malpicker__to">{stationLabel(c.to)}</span>
                      </span>
                      {fastest ? <em className="tag-fast">🏠 집에 더 가까움</em> : null}
                      {c.captures.length ? <em className="tag-capture">잡기 {c.captures.length}</em> : null}
                      {c.finishes ? <em className="tag-finish">골인</em> : null}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </>
      ) : null}

      {view.state === 'ENDED' || view.state === 'REVEAL' ? (
        <div className="rankbox">
          <p className="rankbox__head">
            순위 {view.state === 'REVEAL' ? `· 발표 ${view.revealStep}/4` : '· 발표 대기'}
            <span className="rankbox__hint">화면엔 아래→위 순서로 공개돼요</span>
          </p>
          <ol className="rankbox__list">
            {view.standings.map((s) => {
              // Projector reveals 3rd(step1) → 2nd(step2) → 1st(step3) → all(step4).
              const shown = view.state === 'REVEAL' && (view.revealStep >= 4 || view.revealStep >= 4 - s.rank);
              return (
                <li key={s.teamId} className={`rankbox__row${shown ? ' is-shown' : ''}`}>
                  <span className="rankbox__rank">{s.rank}</span>
                  <span className="rankbox__name">{s.teamName}</span>
                  <span className="rankbox__detail">집 {s.malHome} · {s.totalProgress}칸</span>
                  {shown ? <span className="rankbox__live">화면 공개</span> : null}
                </li>
              );
            })}
          </ol>
        </div>
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

/**
 * The 미니게임 칸 control. When a team lands on one the turn is frozen: the master
 * spins the roulette (a random game), then judges 성공/실패. A fail cancels the move.
 */
function MiniGamePanel({ view, send }: { view: BoardView; send: MasterPaneProps['send'] }) {
  const pending = view.pendingMiniGame!;
  const games = view.miniGames.length > 0 ? view.miniGames : MINI_GAMES;
  const game = pending.gameId ? games.find((g) => g.id === pending.gameId) : null;
  const [spinning, setSpinning] = useState(false);
  const [face, setFace] = useState(0);

  // A short spin animation before the pick lands (cosmetic; the id is recorded).
  useEffect(() => {
    if (!spinning) return undefined;
    const t = setInterval(() => setFace((f) => (f + 1) % games.length), 80);
    return () => clearInterval(t);
  }, [spinning, games.length]);

  function spin() {
    setSpinning(true);
    const idx = Math.floor(Math.random() * games.length);
    setTimeout(() => {
      setSpinning(false);
      void send('master:minigame:spin', { game: games[idx]!.id });
    }, 900);
  }

  return (
    <div className="minigame">
      <p className="minigame__flag">🎡 {pending.teamName} — 미니게임 칸!</p>
      {!game ? (
        <>
          <div className={`minigame__reel${spinning ? ' is-spin' : ''}`}>
            {spinning ? (games[face % games.length]?.name ?? '…') : '룰렛을 돌려주세요'}
          </div>
          <button className="btn btn--primary btn--big" disabled={spinning} onClick={spin}>
            {spinning ? '두구두구…' : '룰렛 돌리기'}
          </button>
        </>
      ) : (
        <>
          <div className="minigame__card">
            <strong className="minigame__name">{game.name}</strong>
            <span className="minigame__inst">{game.instruction}</span>
            {game.seconds ? <Countdown seconds={game.seconds} /> : null}
          </div>
          <div className="minigame__judge">
            <button className="btn btn--primary btn--big" onClick={() => void send('master:minigame:resolve', { success: true })}>
              성공 ✓
            </button>
            <button className="btn btn--danger btn--big" onClick={() => void send('master:minigame:resolve', { success: false })}>
              실패 ✗ (이동 취소)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Countdown({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    const t = setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [seconds]);
  return <span className={`minigame__timer${left === 0 ? ' is-up' : ''}`}>{left}s</span>;
}

function SetupForm({ send }: { send: MasterPaneProps['send'] }) {
  const [raw, setRaw] = useState('청년 1조\n청년 2조\n장년부');
  const [malPerTeam, setMal] = useState<1 | 2>(2);
  const [minutes, setMinutes] = useState(DEFAULT_TIME_LIMIT_MIN);
  const [miniGames, setMiniGames] = useState(true);
  // The 미니게임 데이터베이스, one per line as "이름 | 설명". Prefilled from the pack.
  const [gamesRaw, setGamesRaw] = useState(MINI_GAMES.map((g) => `${g.name} | ${g.instruction}`).join('\n'));
  const teams = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const miniGameSet = gamesRaw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [name, ...rest] = line.split('|');
      return { id: `g${i + 1}`, name: (name ?? '').trim(), instruction: rest.join('|').trim() };
    })
    .filter((g) => g.name);

  return (
    <form
      className="yut-setup"
      onSubmit={(e) => {
        e.preventDefault();
        void send('master:setup', {
          teams: teams.map((name) => ({ name })),
          malPerTeam,
          timeLimitMin: minutes,
          miniGames,
          miniGameSet,
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
      <label className="yut-setup__check">
        <input type="checkbox" checked={miniGames} onChange={(e) => setMiniGames(e.currentTarget.checked)} />
        <span>미니게임 켜기 (칸에 서면 룰렛 → 팀 미니게임)</span>
      </label>
      {miniGames ? (
        <label className="field">
          <span className="field__label">
            미니게임 데이터베이스 — 한 줄에 하나, <b>이름 | 설명</b> ({miniGameSet.length}개)
          </span>
          <textarea
            className="field__input yut-setup__games"
            rows={6}
            value={gamesRaw}
            onChange={(e) => setGamesRaw(e.currentTarget.value)}
            placeholder="제기차기 | 제기를 3번 이상 차기"
          />
        </label>
      ) : null}
      <button className="btn btn--primary" type="submit" disabled={teams.length < MIN_TEAMS}>
        팀 {teams.length}개로 준비 완료
      </button>
    </form>
  );
}
