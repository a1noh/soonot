/**
 * 스톤 on the projector.
 *
 * Idle: the stones orbit slowly, each turning on its own axis. Picked: the ring
 * falls back and the chosen stone comes forward with its mission. Resolved: on
 * 성공 the stone flies into the team's row in the rankings; on 실패 it cracks
 * and fades. The rankings column is always on screen and reorders in place.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { StonesView } from '@soonot/stones/src/project.js';
import { Gem } from '@soonot/stones/src/client/Gem.js';
import './stones.css';

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Burst = { seq: number; stoneId: string; teamId: string; success: boolean; dx: number; dy: number };

export function StonesStage({ view }: { view: StonesView }) {
  const turn = view.teams.find((t) => t.id === view.turnTeamId) ?? null;
  const pending = view.pending ? view.stones.find((s) => s.id === view.pending!.stoneId) ?? null : null;
  const pendingTeam = view.pending ? view.teams.find((t) => t.id === view.pending!.teamId) ?? null : null;

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
    const to = slotRefs.current.get(`${r.teamId}:${r.stoneId}`)?.getBoundingClientRect();
    const dx = from && to ? to.left + to.width / 2 - (from.left + from.width / 2) : 0;
    const dy = from && to ? to.top + to.height / 2 - (from.top + from.height / 2) : 0;
    setBurst({ ...r, dx, dy });
  }, [view.lastResult]);

  const burstStone = burst ? view.stones.find((s) => s.id === burst.stoneId) ?? null : null;
  const burstTeam = burst ? view.teams.find((t) => t.id === burst.teamId) ?? null : null;
  const focus = pending ? 'picked' : burst ? 'result' : 'idle';
  const n = view.stones.length;

  return (
    <main className={`stage stage--stones is-${focus}`}>
      <div className="stars" aria-hidden="true" />
      <section className="stn-main">
        <header className="stn-head">
          <h1 className="stn-head__title">스톤</h1>
          {view.state === 'RUNNING' && turn ? (
            <p className="stn-head__turn" style={{ '--team': turn.color } as CSSProperties}>
              <span className="stn-head__round">{view.round}라운드</span>
              <strong>{turn.name}</strong> 차례
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
                className={`orbit__slot${pending?.id === s.id ? ' is-chosen' : ''}`}
                style={{ '--i': i, '--glow': s.color } as CSSProperties}
              >
                <div className="orbit__upright">
                  <div className="orbit__bob" style={{ animationDelay: `${-i * 0.7}s` }}>
                    <Gem color={s.color} size={120} className="orbit__gem" />
                  </div>
                  <span className="orbit__name">{s.name}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="orbit-center" ref={centerRef}>
            {focus === 'idle' && view.state === 'RUNNING' && turn ? (
              <p className="orbit-center__prompt">
                <strong style={{ '--team': turn.color } as CSSProperties}>{turn.name}</strong>
                <span>도전할 스톤을 골라요</span>
              </p>
            ) : null}
          </div>

          {pending && pendingTeam ? (
            <div className="mission" key={pending.id} style={{ '--glow': pending.color } as CSSProperties}>
              <div className="mission__gem">
                <Gem color={pending.color} size={240} />
              </div>
              <div className="mission__card">
                <p className="mission__who">
                  <span style={{ background: pendingTeam.color }} className="mission__dot" />
                  {pendingTeam.name} 도전
                </p>
                <h2 className="mission__name">{pending.name}</h2>
                <p className="mission__text">{pending.mission || '미션을 준비 중이에요.'}</p>
              </div>
            </div>
          ) : null}

          {burst && burstStone && burstTeam ? (
            <div
              key={burst.seq}
              className={`burst ${burst.success ? 'burst--win' : 'burst--lose'}`}
              style={{ '--glow': burstStone.color, '--dx': `${burst.dx}px`, '--dy': `${burst.dy}px` } as CSSProperties}
              onAnimationEnd={(e) => {
                if (e.target === e.currentTarget) setBurst(null);
              }}
            >
              <div className="burst__gem">
                <Gem color={burstStone.color} size={220} />
              </div>
              <p className="burst__label">
                {burst.success ? (
                  <>
                    <strong>{burstTeam.name}</strong> {burstStone.name} 획득
                  </>
                ) : (
                  <>
                    <strong>{burstTeam.name}</strong> 아쉽게 실패
                  </>
                )}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <Rankings
        view={view}
        slotRefs={slotRefs.current}
        arriving={burst?.success ? `${burst.teamId}:${burst.stoneId}` : null}
      />
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
  /** The slot a winning stone is flying into: stays dark until it lands. */
  arriving: string | null;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const prev = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const rows = Array.from(list.children) as HTMLElement[];
    const next = new Map<string, number>();
    for (const row of rows) {
      const id = row.dataset.id!;
      const top = row.getBoundingClientRect().top;
      next.set(id, top);
      const before = prev.current.get(id);
      if (before !== undefined && before !== top && typeof row.animate === 'function' && !reducedMotion()) {
        row.animate(
          [{ transform: `translateY(${before - top}px)` }, { transform: 'translateY(0)' }],
          { duration: 600, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        );
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
          const team = byId.get(s.teamId);
          const isTurn = view.state === 'RUNNING' && s.teamId === view.turnTeamId;
          return (
            <li
              key={s.teamId}
              data-id={s.teamId}
              className={`ranks__row${isTurn ? ' is-turn' : ''}${team?.playing ? '' : ' is-out'}`}
              style={{ '--team': s.color } as CSSProperties}
            >
              <span className="ranks__place">{s.rank}</span>
              <span className="ranks__name">{s.teamName}</span>
              <span className="ranks__count">{s.stoneIds.length}</span>
              <span className="ranks__slots">
                {view.stones.map((st) => {
                  const has = s.stoneIds.includes(st.id) && arriving !== `${s.teamId}:${st.id}`;
                  return (
                    <span
                      key={st.id}
                      className={`ranks__slot${has ? ' is-held' : ''}`}
                      style={{ '--glow': st.color } as CSSProperties}
                      ref={(el) => {
                        const key = `${s.teamId}:${st.id}`;
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
