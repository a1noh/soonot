/**
 * The board, as geometry (spec §7.1).
 *
 * Stations are computed from `stationXY`, never hand-placed, so the same markup
 * fills a 1280×720 projector and a phone with no breakpoints. Font sizes are in
 * viewBox units, which is what makes "readable at 10 m" (req §16) a property of
 * the geometry rather than something to re-tune per venue.
 */
import { stationXY } from '../shared/board';
import { STATION_COUNT } from '../shared/constants';
import type { BoardView } from '../project';

const PAD = 9;
const SPAN = 100 - PAD * 2;
const xy = (i: number): [number, number] => {
  const [ux, uy] = stationXY(i);
  return [PAD + ux * SPAN, PAD + uy * SPAN];
};

/** Corners are bigger — 참 and the three turning stations (req §6). */
const isCorner = (i: number) => i % 5 === 0;

export function BoardSvg({ view }: { view: BoardView }) {
  const onBoard = view.teams.flatMap((t) =>
    t.mal
      .filter((m) => m.progress > 0 && m.progress < 20)
      .map((m) => ({ ...m, team: t })),
  );

  // Up to two 말 can share a station; a fixed offset is enough (spec §7.1).
  const atStation = new Map<number, typeof onBoard>();
  for (const m of onBoard) {
    const list = atStation.get(m.progress) ?? [];
    list.push(m);
    atStation.set(m.progress, list);
  }

  return (
    <svg viewBox="0 0 100 100" className="board" role="img" aria-label="윷놀이 판">
      <rect x="0" y="0" width="100" height="100" className="board__bg" />
      {/* the ring */}
      <path
        d={Array.from({ length: STATION_COUNT }, (_, i) => {
          const [x, y] = xy(i);
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
        }).join(' ') + ' Z'}
        className="board__ring"
      />
      {Array.from({ length: STATION_COUNT }, (_, i) => {
        const [x, y] = xy(i);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={isCorner(i) ? 4.4 : 2.9} className="board__station" />
            {i === 0 ? (
              <text x={x} y={y + 8.5} className="board__label">참</text>
            ) : null}
          </g>
        );
      })}

      {[...atStation.entries()].map(([progress, mal]) =>
        mal.map((m, k) => {
          const [x, y] = xy(progress % STATION_COUNT);
          const dx = mal.length > 1 ? (k === 0 ? -2.1 : 2.1) : 0;
          return (
            <g key={m.id}>
              <circle cx={x + dx} cy={y} r={3.1} fill={m.team.color} className="board__mal" />
              {/* colour is never the only signal (req §16) */}
              <text x={x + dx} y={y + 1.2} className="board__malnum">
                {view.teams.indexOf(m.team) + 1}
              </text>
            </g>
          );
        }),
      )}
    </svg>
  );
}

/** 대기 and 집 live off the ring, in per-team trays. */
export function HomeTray({ view }: { view: BoardView }) {
  return (
    <ul className="trays">
      {view.teams.map((t, i) => {
        const waiting = t.mal.filter((m) => m.progress === 0).length;
        const home = t.mal.filter((m) => m.progress >= 20).length;
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

export function Clock({ ms, paused }: { ms: number; paused: boolean }) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return (
    <span className={`clock${paused ? ' clock--paused' : ''}`}>
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
      {paused ? ' ⏸' : ''}
    </span>
  );
}
