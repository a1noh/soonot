/**
 * 스톤 on the projector.
 *
 * Idle: the stones orbit slowly, each turning in its own light, and the
 * chooser's name sits in the middle. Picked: the ring falls back, the stone
 * comes forward and the game behind it is revealed — who plays and how. The
 * room believes the stone chose the game; the projector only ever learns a
 * game once it is open. Resolved: the stone splits and flies into every
 * winning team's row; with no winner it greys and falls.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { StonesView } from '@soonot/stones/src/project.js';
import { Gem } from '@soonot/stones/src/client/Gem.js';
import { playersLabel } from '@soonot/stones/src/shared/labels.js';
import './stones.css';

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Flight = { teamId: string; dx: number; dy: number };
type Burst = { seq: number; stoneId: string; winners: string[]; flights: Flight[] };

export function StonesStage({ view }: { view: StonesView }) {
  const chooser = view.teams.find((t) => t.id === view.turnTeamId) ?? null;
  const pending = view.pending;
  const pendingStone = pending ? view.stones.find((s) => s.id === pending.stoneId) ?? null : null;
  const pendingTeam = pending ? view.teams.find((t) => t.id === pending.chooserId) ?? null : null;

  const centerRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef(new Map<string, HTMLElement>());
  const [burst, setBurst] = useState<Burst | null>(null);
  // Only animate results that happen while we watch — never replay on (re)connect.
  const seenSeq = useRef<number | null>(view.lastResult?.seq ?? null);

  useEffect(() => {
    const r = view.lastResult;
    if (!r || r.seq === seenSeq.current) return;
    seenSeq.current = r.seq;
    const from = centerRef.current?.getBoundingClientRect();
    const flights = r.winners.map((teamId) => {
      const to = slotRefs.current.get(`${teamId}:${r.stoneId}`)?.getBoundingClientRect();
      return {
        teamId,
        dx: from && to ? to.left + to.width / 2 - (from.left + from.width / 2) : 0,
        dy: from && to ? to.top + to.height / 2 - (from.top + from.height / 2) : 0,
      };
    });
    setBurst({ seq: r.seq, stoneId: r.stoneId, winners: r.winners, flights });
  }, [view.lastResult]);

  const burstStone = burst ? view.stones.find((s) => s.id === burst.stoneId) ?? null : null;
  const teamName = (id: string) => view.teams.find((t) => t.id === id)?.name ?? '';
  const focus = pending ? 'picked' : burst ? 'result' : 'idle';
  const n = view.stones.length;
  const arriving = new Set(burst ? burst.winners.map((w) => `${w}:${burst.stoneId}`) : []);

  return (
    <main className={`stage stage--stones is-${focus}`}>
      <div className="stars" aria-hidden="true" />
      <section className="stn-main">
        <header className="stn-head">
          <h1 className="stn-head__title">스톤</h1>
          {view.state === 'RUNNING' && chooser ? (
            <p className="stn-head__turn" style={{ '--team': chooser.color } as CSSProperties}>
              <span className="stn-head__round">
                {Math.min(view.played + 1, view.total)} / {view.total}
              </span>
              <strong>{chooser.name}</strong> 차례
            </p>
          ) : (
            <p className="stn-head__turn stn-head__turn--wait">곧 시작합니다</p>
          )}
        </header>

        <div className="orbit-wrap">
          <div className="orbit" style={{ '--n': n } as CSSProperties} aria-label="스톤">
            {view.stones.map((s, i) => (
              <div
                key={s.id}
                className={`orbit__slot${pending?.stoneId === s.id ? ' is-chosen' : ''}${s.claimed ? ' is-claimed' : ''}`}
                style={{ '--i': i, '--glow': s.color } as CSSProperties}
              >
                <div className="orbit__upright">
                  <div className="orbit__bob" style={{ animationDelay: `${-i * 0.7}s` }}>
                    <Gem color={s.color} size={120} dim={!!s.claimed} className="orbit__gem" />
                  </div>
                  <span className="orbit__name">{s.name}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="orbit-center" ref={centerRef}>
            {focus === 'idle' && view.state === 'RUNNING' && chooser && view.played < view.total ? (
              <p className="orbit-center__prompt">
                <strong style={{ '--team': chooser.color } as CSSProperties}>{chooser.name}</strong>
                <span>스톤을 하나 고르세요</span>
              </p>
            ) : null}
            {focus === 'idle' && view.state === 'RUNNING' && view.played >= view.total ? (
              <p className="orbit-center__prompt">
                <strong>모든 스톤을 모았어요</strong>
              </p>
            ) : null}
          </div>

          {pending && pendingStone ? (
            <div className="mission" key={`${pending.stoneId}:${pending.number}`} style={{ '--glow': pendingStone.color } as CSSProperties}>
              <div className="mission__gem">
                <Gem color={pendingStone.color} size={240} />
                <span className="mission__stone">{pendingStone.name}</span>
              </div>
              <div className="mission__card">
                <p className="mission__who">
                  {pendingTeam ? <span style={{ background: pendingTeam.color }} className="mission__dot" /> : null}
                  {pending.chooserName} 선택 · 모든 팀이 도전해요
                </p>
                <h2 className="mission__name">{pending.game.name}</h2>
                {pending.game.players ? <p className="mission__players">{playersLabel(pending.game.players)}</p> : null}
                <p className="mission__text">{pending.game.instructions}</p>
              </div>
            </div>
          ) : null}

          {burst && burstStone ? (
            <div
              key={burst.seq}
              className={`burst ${burst.winners.length > 0 ? 'burst--win' : 'burst--lose'}`}
              style={{ '--glow': burstStone.color } as CSSProperties}
              onAnimationEnd={(e) => {
                if (e.target === e.currentTarget) setBurst(null);
              }}
            >
              <div className="burst__gems">
                {burst.flights.length > 0 ? (
                  burst.flights.map((f) => (
                    <div
                      key={f.teamId}
                      className="burst__gem"
                      style={{ '--dx': `${f.dx}px`, '--dy': `${f.dy}px` } as CSSProperties}
                    >
                      <Gem color={burstStone.color} size={220} halo />
                    </div>
                  ))
                ) : (
                  <div className="burst__gem">
                    <Gem color={burstStone.color} size={220} />
                  </div>
                )}
              </div>
              <p className="burst__label">
                {burst.winners.length > 0 ? (
                  <>
                    <strong>{burst.winners.map(teamName).join(' · ')}</strong> {burstStone.name} 획득
                  </>
                ) : (
                  <>아무 팀도 {burstStone.name}을 얻지 못했어요</>
                )}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <Rankings view={view} slotRefs={slotRefs.current} arriving={arriving} />
    </main>
  );
}

/** The always-on standings column. Rows slide to their new place (FLIP). */
function Rankings({
  view,
  slotRefs,
  arriving,
}: {
  view: StonesView;
  slotRefs: Map<string, HTMLElement>;
  /** Slots a stone is flying into: they stay dark until it lands. */
  arriving: ReadonlySet<string>;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const prev = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const next = new Map<string, number>();
    for (const row of Array.from(list.children) as HTMLElement[]) {
      const id = row.dataset.id!;
      const top = row.getBoundingClientRect().top;
      next.set(id, top);
      const before = prev.current.get(id);
      if (before !== undefined && before !== top && typeof row.animate === 'function' && !reducedMotion()) {
        row.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'translateY(0)' }], {
          duration: 600,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        });
      }
    }
    prev.current = next;
  });

  const byId = new Map(view.teams.map((t) => [t.id, t]));
  return (
    <aside className="ranks" aria-label="순위">
      <h2 className="ranks__title">순위</h2>
      <ol className="ranks__list" ref={listRef}>
        {view.standings.map((s) => {
          const isTurn = view.state === 'RUNNING' && s.teamId === view.turnTeamId;
          const count = s.stoneIds.filter((id) => !arriving.has(`${s.teamId}:${id}`)).length;
          return (
            <li
              key={s.teamId}
              data-id={s.teamId}
              className={`ranks__row${isTurn ? ' is-turn' : ''}${byId.get(s.teamId)?.playing ? '' : ' is-out'}`}
              style={{ '--team': s.color } as CSSProperties}
            >
              <span className="ranks__place">{s.rank}</span>
              <span className="ranks__name">{s.teamName}</span>
              <span className="ranks__count">{count}</span>
              <span className="ranks__slots">
                {view.stones.map((st) => {
                  const key = `${s.teamId}:${st.id}`;
                  const has = s.stoneIds.includes(st.id) && !arriving.has(key);
                  return (
                    <span
                      key={st.id}
                      className={`ranks__slot${has ? ' is-held' : ''}`}
                      style={{ '--glow': st.color } as CSSProperties}
                      ref={(el) => {
                        if (el) slotRefs.set(key, el);
                        else slotRefs.delete(key);
                      }}
                    >
                      <Gem color={st.color} size={34} dim={!has} />
                    </span>
                  );
                })}
              </span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
