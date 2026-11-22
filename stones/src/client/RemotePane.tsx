/**
 * 스톤 inside the 진행 순서 remote — only what a round needs, in the order the
 * MC script runs it.
 *
 * The trick: the room thinks the stone it shouts decides the game. It doesn't —
 * pick N always opens game N. So before a pick the remote shows the master the
 * game that WILL open (secret), who is choosing, and the stones to tap; during
 * the round it shows the game on and the winner ticks. Setup, 게임 종료, 결정전
 * and the podium stay in the full 스톤 console (the remote falls back to it).
 */
import { useEffect, useState, type CSSProperties } from 'react';
import type { StonesView } from '../project';
import { playersLabel } from '../shared/labels';
import { Gem } from './Gem';
import { bingoGuest } from './MasterPane';
import { autoGuest } from './autoGuest';

export interface StonesRemoteProps {
  view: StonesView;
  send(ev: string, payload?: Record<string, unknown>): Promise<unknown>;
  bingoWinner?: string | null;
  /** The round the 진행 순서 step is about (from its title), to catch a mismatch. */
  cueRound?: number | null;
  /** The step is the round's own slide (the game is being played), not its board. */
  cueIsRoundSlide?: boolean;
}

export function StonesRemote({ view, send, bingoWinner = null, cueRound = null, cueIsRoundSlide = false }: StonesRemoteProps) {
  const [winners, setWinners] = useState<Set<string>>(new Set());
  const pendingKey = view.pending ? `${view.pending.stoneId}:${view.played}` : null;
  useEffect(() => setWinners(new Set()), [pendingKey]);
  const act = (ev: string, payload?: Record<string, unknown>) => void send(ev, payload).catch(() => {});

  const pending = view.pending;
  const allPlayed = view.played >= view.total;
  // The round the 스톤 game is on: the game being played, or the next one to open.
  const engineRound = pending ? pending.number : Math.min(view.played + 1, view.total);
  // This step's round just got its stone: the normal moment to press 다음 ▶.
  const roundDone = cueRound !== null && !pending && (allPlayed ? cueRound === view.total : cueRound === engineRound - 1);
  const mismatch =
    cueRound !== null &&
    !allPlayed &&
    !roundDone &&
    cueRound !== engineRound &&
    // A round's board step opens with the previous round still waiting for its winner.
    !(!cueIsRoundSlide && pending && pending.number === cueRound - 1);
  const guest = bingoWinner ? bingoGuest(bingoWinner) : null;

  // 대본: the 빙고 1등 chooses the first stone. Hand them the first choice once,
  // when the game has started and nothing has been picked yet; the master can
  // still tap a team instead (this never runs a second time for the same game).
  useEffect(() => {
    if (view.state !== 'RUNNING') return;
    if (!guest || !autoGuest.pending() || view.played > 0 || view.pending || view.turnIsGuest) return;
    autoGuest.markDone();
    act('master:chooser', { guest });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.state, view.played, view.pending, guest, view.turnIsGuest]);

  return (
    <div className="srm">
      {roundDone ? (
        <p className="srm__ok" role="status">
          ✓ {cueRound}라운드 끝 · {view.lastResult ? '스톤을 줬어요. ' : ''}<b>다음 ▶</b> 으로 넘어가세요
        </p>
      ) : null}
      {mismatch ? (
        <p className="srm__warn" role="status">
          ⚠ 스톤 게임은 지금 <b>{engineRound}라운드</b>예요 (이 장면은 {cueRound}라운드). 이전 단계를 마쳤는지 확인하세요.
        </p>
      ) : null}

      {pending ? (
        <section className="srm__card srm__card--on">
          <header className="srm__head">
            <Gem color={view.stones.find((s) => s.id === pending.stoneId)?.color ?? '#888'} size={30} />
            <div>
              <span className="srm__label">
                {pending.number}라운드 진행 중 · {view.stones.find((s) => s.id === pending.stoneId)?.name}
              </span>
              <strong className="srm__game">
                {pending.game.name}
                <small>{playersLabel(pending.game.players)}</small>
              </strong>
            </div>
          </header>
          <details className="srm__how">
            <summary>게임 방법</summary>
            <p>{pending.game.instructions || '설명이 비어 있어요.'}</p>
          </details>
          <fieldset className="srm__winners">
            <legend>이긴 팀을 누르세요 (여러 팀 가능)</legend>
            {view.teams.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`srm__team${winners.has(t.id) ? ' is-on' : ''}`}
                style={{ '--team': t.color } as CSSProperties}
                aria-pressed={winners.has(t.id)}
                onClick={() => {
                  const next = new Set(winners);
                  if (next.has(t.id)) next.delete(t.id);
                  else next.add(t.id);
                  setWinners(next);
                }}
              >
                {t.name}
                <small>{t.stoneIds.length}개</small>
              </button>
            ))}
          </fieldset>
          <div className="srm__row">
            <button
              type="button"
              className={`btn btn--big srm__give${winners.size ? ' is-ready' : ''}`}
              onClick={() => {
                if (winners.size === 0 && !confirm('아무 팀도 이 스톤을 얻지 못한 걸로 할까요?')) return;
                act('master:resolve', { winners: view.teams.filter((t) => winners.has(t.id)).map((t) => t.id) });
              }}
            >
              {winners.size
                ? `${view.teams.filter((t) => winners.has(t.id)).map((t) => t.name).join(' · ')}에게 스톤 주기`
                : '이긴 팀 없음'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => act('master:cancel')} title="스톤을 다시 고르게 해요">
              스톤 선택 취소
            </button>
          </div>
        </section>
      ) : allPlayed ? (
        <section className="srm__card">
          <p className="srm__done">스톤 {view.total}개를 모두 썼어요. 다음 ▶ (최종 집계)에서 게임 종료를 누르세요.</p>
        </section>
      ) : (
        <section className="srm__card">
          <p className="srm__secret">
            <span className="srm__label">{engineRound}라운드에 열릴 게임 · 비밀</span>
            <strong className="srm__game">
              {view.nextGame?.name ?? '—'}
              {view.nextGame ? <small>{playersLabel(view.nextGame.players)}</small> : null}
            </strong>
            <span className="srm__hint">관객이 어떤 스톤을 골라도 이 게임이 열려요.</span>
          </p>

          {view.lastStone ? (
            (() => {
              const last = view.stones.find((s) => s.claimed === null)!;
              return (
                <button type="button" className="btn btn--big srm__last" onClick={() => act('master:pick', { stone: last.id })}>
                  <Gem color={last.color} size={28} /> 마지막 스톤 열기 · {last.name}
                </button>
              );
            })()
          ) : (
            <>
              <div className="srm__step">
                <span className="srm__num">1</span>
                <div className="srm__stepbody">
                  <span className="srm__steplabel">
                    누가 고르나요? <b>{view.turnTeamName ?? '—'}</b>
                  </span>
                  <div className="srm__chips">
                    {guest ? (
                      <button
                        type="button"
                        className={`srm__chooser srm__chooser--guest${view.turnIsGuest && view.turnTeamName === guest ? ' is-on' : ''}`}
                        onClick={() => act('master:chooser', { guest })}
                      >
                        {guest}
                      </button>
                    ) : null}
                    {view.teams
                      .filter((t) => t.playing)
                      .map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className={`srm__chooser${t.id === view.turnTeamId ? ' is-on' : ''}`}
                          style={{ '--team': t.color } as CSSProperties}
                          onClick={() => act('master:chooser', { team: t.id })}
                        >
                          {t.name}
                        </button>
                      ))}
                  </div>
                  {view.played === 0 && !guest ? <span className="srm__hint">빙고가 끝나면 “빙고 1등”이 여기 생겨요.</span> : null}
                </div>
              </div>
              <div className="srm__step">
                <span className="srm__num">2</span>
                <div className="srm__stepbody">
                  <span className="srm__steplabel">관객이 외친 스톤을 누르세요 → 화면에 게임이 공개돼요</span>
                  <div className="srm__stones">
                    {view.stones.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="srm__stone"
                        disabled={s.claimed !== null}
                        onClick={() => act('master:pick', { stone: s.id })}
                      >
                        <Gem color={s.color} size={30} dim={s.claimed !== null} />
                        <span>{s.name.replace(/\s*스톤$/, '')}</span>
                        {s.claimed ? <small>완료</small> : null}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      <div className="srm__score" aria-label="팀별 스톤">
        {view.teams.map((t) => (
          <span key={t.id} className="srm__scoreitem" style={{ '--team': t.color } as CSSProperties}>
            {t.name} <b>{t.stoneIds.length}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
