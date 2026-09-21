/**
 * The board, as geometry (spec §7.1).
 *
 * Stations are computed from `stationXY`, never hand-placed, so the same markup
 * fills a 1280×720 projector and a phone with no breakpoints. Font sizes are in
 * viewBox units, which is what makes "readable at 10 m" (req §16) a property of
 * the geometry rather than something to re-tune per venue.
 */
import { useEffect, useState } from 'react';
import { nodeXY, isOnBoard, CENTER } from '../shared/board';
import { isMiniGameStation } from '../shared/constants';
import type { BoardView } from '../project';

const PAD = 9;
const SPAN = 100 - PAD * 2;
const xy = (i: number): [number, number] => {
  const [ux, uy] = nodeXY(i);
  return [PAD + ux * SPAN, PAD + uy * SPAN];
};

/** The 4 corner 밭 are bigger: 참(0), 모(5), 뒷모(10), 모동(15) (req §6). */
const isCorner = (i: number) => i % 5 === 0;
/** The inner diagonal 밭 (excluding centre 방). */
const DIAGONAL_NODES = [21, 22, 24, 25, 26, 27, 28, 29];

export function BoardSvg({ view }: { view: BoardView }) {
  const onBoard = view.teams.flatMap((t) =>
    t.mal.filter((m) => isOnBoard(m.progress)).map((m) => ({ ...m, team: t })),
  );

  // Up to two 말 can share a 밭; a fixed offset is enough (spec §7.1).
  const atNode = new Map<number, typeof onBoard>();
  for (const m of onBoard) {
    const list = atNode.get(m.progress) ?? [];
    list.push(m);
    atNode.set(m.progress, list);
  }
  // Stable position per 말 id, so a move slides (CSS transition) not teleports.
  const placed = new Map<string, { x: number; y: number; team: (typeof onBoard)[number]['team'] }>();
  for (const [node, mal] of atNode) {
    const [x, y] = xy(node);
    mal.forEach((m, k) => {
      const dx = mal.length > 1 ? (k === 0 ? -2.2 : 2.2) : 0;
      placed.set(m.id, { x: x + dx, y, team: m.team });
    });
  }

  return (
    <svg viewBox="0 0 100 100" className="board" role="img" aria-label="윷놀이 판">
      <defs>
        <filter id="malShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0.5" stdDeviation="0.7" floodOpacity="0.5" />
        </filter>
      </defs>
      <rect x="0" y="0" width="100" height="100" className="board__bg" rx="4" />

      {/* the two diagonals (지름길): 모(5)↔모동(15) and 뒷모(10)↔참(0), crossing at 방. */}
      {([[0, 10], [5, 15]] as const).map(([a, b]) => {
        const [ax, ay] = xy(a);
        const [bx, by] = xy(b);
        return <path key={`x${a}`} d={`M${ax.toFixed(2)},${ay.toFixed(2)} L${bx.toFixed(2)},${by.toFixed(2)}`} className="board__cross" />;
      })}
      {/* the square outer ring */}
      <path
        d={Array.from({ length: 20 }, (_, i) => {
          const [x, y] = xy(i);
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
        }).join(' ') + ' Z'}
        className="board__ring"
      />

      {/* inner diagonal 밭 */}
      {DIAGONAL_NODES.map((n) => {
        const [x, y] = xy(n);
        return <circle key={n} cx={x} cy={y} r={2.4} className="board__station board__station--diag" />;
      })}

      {/* centre 방 — a big double-ring 밭 */}
      {(() => {
        const [x, y] = xy(CENTER);
        return (
          <g>
            <circle cx={x} cy={y} r={5.6} className="board__bat board__bat--big" />
            <circle cx={x} cy={y} r={3.4} className="board__bat-inner" />
            <text x={x} y={y + 1.5} className="board__label board__center-label">방</text>
          </g>
        );
      })()}

      {/* outer 밭 (0=참, 5=모, 10=뒷모, 15=모동 are big corners) */}
      {Array.from({ length: 20 }, (_, i) => {
        const [x, y] = xy(i);
        const mini = isMiniGameStation(i);
        const big = isCorner(i);
        return (
          <g key={i}>
            {big ? (
              <>
                <circle cx={x} cy={y} r={5.4} className="board__bat board__bat--big" />
                <circle cx={x} cy={y} r={3.2} className="board__bat-inner" />
              </>
            ) : (
              <circle cx={x} cy={y} r={mini ? 3.6 : 2.6} className={`board__station${mini ? ' board__station--mini' : ''}`} />
            )}
            {mini ? <text x={x} y={y + 1.35} className="board__star" aria-hidden="true">★</text> : null}
            {i === 0 ? <text x={x - 6} y={y - 5} className="board__label board__label--cham">참</text> : null}
          </g>
        );
      })}

      {/* 말 — one stable node per id, so a move slides (CSS transition) */}
      {onBoard.map((m) => {
        const pos = placed.get(m.id)!;
        const isTurn = view.turnTeamId === m.team.id;
        return (
          <g
            key={m.id}
            className={`board__malwrap${isTurn ? ' is-turn' : ''}`}
            style={{ transform: `translate(${pos.x.toFixed(2)}px, ${pos.y.toFixed(2)}px)` }}
          >
            {/* inner group so the entrance pop (scale) doesn't fight the wrapper's
                position transform, nor the is-turn stroke pulse on the circle */}
            <g className="board__malin">
              <circle r={3.4} fill={m.team.color} className="board__mal" filter="url(#malShadow)" />
              <text y={1.2} className="board__malnum">{view.teams.indexOf(m.team) + 1}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/** 대기 and 집 live off the ring, in per-team trays. */
export function HomeTray({ view }: { view: BoardView }) {
  return (
    <ul className="trays">
      {view.teams.map((t, i) => {
        const waiting = t.mal.filter((m) => m.progress === 0).length;
        const home = t.mal.filter((m) => m.progress === 20).length;
        return (
          <li key={t.id} className="tray">
            <span className="tray__dot" style={{ background: t.color }}>{i + 1}</span>
            <span className="tray__name">{t.name}</span>
            <span className="tray__counts">
              대기 {waiting} · 집 <b>{home}</b>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function Standings({ view }: { view: BoardView }) {
  return (
    <ol className="standings">
      {view.standings.map((s) => (
        <li key={s.teamId} className="standings__row">
          <span className="standings__rank">{s.rank}</span>
          <span className="standings__name">{s.teamName}</span>
          <span className="standings__detail">
            집 {s.malHome} · {s.totalProgress}칸
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Counts down **locally** so the server no longer has to rebroadcast state every
 * second just to move the clock (that 1 Hz full re-render was the projector lag).
 * `ms` is the authoritative remaining at the last real update; the component ticks
 * down from it and resets whenever a new `ms`/`paused` arrives (pause/resume/
 * extend/expiry all push a fresh value).
 */
export function Clock({ ms, paused }: { ms: number; paused: boolean }) {
  const [remaining, setRemaining] = useState(ms);
  useEffect(() => setRemaining(ms), [ms]);
  useEffect(() => {
    if (paused) return undefined;
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1000)), 1000);
    return () => clearInterval(t);
  }, [paused, ms]);
  const s = Math.max(0, Math.floor(remaining / 1000));
  return (
    <span className={`clock${paused ? ' clock--paused' : ''}`}>
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
      {paused ? ' ⏸' : ''}
    </span>
  );
}
