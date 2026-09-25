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
// Mirror x so the 말 starts at the bottom-LEFT corner and travels to the RIGHT,
// then up the right side and around (counter-clockwise as drawn). Rendering only
// — the engine graph/positions are unchanged.
const xy = (i: number): [number, number] => {
  const [ux, uy] = nodeXY(i);
  return [PAD + (1 - ux) * SPAN, PAD + uy * SPAN];
};

/** Nudge a point `d` viewBox units toward the centre — keeps corner labels on-board. */
const inward = (x: number, y: number, d: number): [number, number] => {
  const dx = 50 - x;
  const dy = 50 - y;
  const len = Math.hypot(dx, dy) || 1;
  return [x + (dx / len) * d, y + (dy / len) * d];
};

/** The 4 corner 밭 are bigger: 참(0), 모(5), 뒷모(10), 모동(15) (req §6). */
const isCorner = (i: number) => i % 5 === 0;
/** The inner diagonal 밭 (excluding centre 방). */
const DIAGONAL_NODES = [21, 22, 24, 25, 26, 27, 28, 29];
/** 지름길 choice 밭: landing exactly here opens the diagonal on the next throw
 *  (모, 뒷모, 방 — see `firstOptions` in board.ts). */
const BRANCH_NODES = new Set([5, 10, CENTER]);

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

      {/* direction arrows — 말 travels this way (starts bottom-left, goes right, then around) */}
      {[2, 7, 12, 17].map((i) => {
        const [ax, ay] = xy(i);
        const [bx, by] = xy(i + 1);
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
        return (
          <path
            key={`arr${i}`}
            d="M-1.8,-1.5 L1.8,0 L-1.8,1.5 Z"
            className="board__arrow"
            transform={`translate(${mx.toFixed(2)},${my.toFixed(2)}) rotate(${ang.toFixed(1)})`}
          />
        );
      })}

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
              <circle cx={x} cy={y} r={2.6} className={`board__station${mini ? ' board__station--mini' : ''}`} />
            )}
            {mini ? <text x={x} y={y + 1.35} className="board__star" aria-hidden="true">★</text> : null}
          </g>
        );
      })}

      {/* orientation labels: 출발/집 at 참, and 갈림길 at the 지름길 choice 밭 (모/뒷모/방) */}
      {(() => {
        const [x0, y0] = xy(0);
        const [x, y] = inward(x0, y0, 8.5);
        return <text x={x} y={y} className="board__glabel board__glabel--start">출발·집</text>;
      })()}
      {[5, 10].map((n) => {
        const [x0, y0] = xy(n);
        const [x, y] = inward(x0, y0, 8.5);
        return <text key={`gl${n}`} x={x} y={y} className="board__glabel">갈림길</text>;
      })}
      {(() => {
        const [cx, cy] = xy(CENTER);
        return <text key="glc" x={cx} y={cy + 8.6} className="board__glabel">갈림길</text>;
      })()}

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

      {/* animated 지름길 prompt — pops up when a 말 rests on a choice 밭 (모/뒷모/방),
          i.e. a diagonal shortcut is available on its next throw. */}
      {[...new Set(onBoard.filter((m) => BRANCH_NODES.has(m.progress)).map((m) => m.progress))].map(
        (node) => {
          const [x0, y0] = xy(node);
          const [x, y] = node === CENTER ? [x0, y0 - 10.5] : inward(x0, y0, 12);
          return (
            <g key={`choice-${node}`} className="board__choice" aria-hidden="true">
              <rect x={x - 11} y={y - 4.4} width={22} height={6.6} rx={3.3} className="board__choicebg" />
              <text x={x} y={y} className="board__choicetxt">지름길!</text>
            </g>
          );
        },
      )}
    </svg>
  );
}

/** 대기 and 집 live off the ring, in per-team trays. The waiting 말 are drawn as
 *  actual pieces (not just a count) and the team whose turn it is is highlighted,
 *  so even on the very first turn — before anything is on the board — the room can
 *  see each team's 말 and whose turn it is. */
export function HomeTray({ view }: { view: BoardView }) {
  return (
    <ul className="trays">
      {view.teams.map((t, i) => {
        const waiting = t.mal.filter((m) => m.progress === 0).length;
        const home = t.mal.filter((m) => m.progress === 20).length;
        const isTurn = view.turnTeamId === t.id;
        return (
          <li key={t.id} className={`tray${isTurn ? ' tray--turn' : ''}`}>
            <span className="tray__dot" style={{ background: t.color }}>{i + 1}</span>
            <span className="tray__name">{t.name}</span>
            {isTurn ? <span className="tray__turn">차례</span> : null}
            <span className="tray__mals" aria-hidden="true">
              {Array.from({ length: waiting }).map((_, k) => (
                <span key={k} className="tray__mal" style={{ background: t.color }} />
              ))}
            </span>
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
