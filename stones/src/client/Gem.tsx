/**
 * One stone, drawn in SVG from a single base colour: a rounded, faceted
 * oval cut lit from inside — a white-hot core fading through the colour to a
 * deep rim — with an optional halo. Shared by the console (small, no halo)
 * and the projector (large, glowing).
 */
import { useId } from 'react';

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) =>
    Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))
      .toString(16)
      .padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

// Outer rim and the inner table: two octagons, so the facets fan between them.
const RIM: readonly [number, number][] = [
  [50, 4], [73, 13], [86, 38], [84, 66], [70, 88], [50, 96], [30, 88], [16, 66], [14, 38], [27, 13],
];
const TABLE: readonly [number, number][] = [
  [50, 26], [62, 31], [67, 44], [66, 58], [59, 69], [50, 73], [41, 69], [34, 58], [33, 44], [38, 31],
];
const pts = (p: readonly [number, number][]) => p.map(([x, y]) => `${x},${y}`).join(' ');

export interface GemProps {
  color: string;
  size?: number;
  /** Greyed out: already played for, or not won. */
  dim?: boolean;
  /** Draw the soft light the stone throws around itself. */
  halo?: boolean;
  className?: string;
  title?: string;
}

export function Gem({ color, size = 24, dim = false, halo = false, className, title }: GemProps) {
  const id = useId().replace(/:/g, '');
  const base = dim ? '#4a5060' : color;
  const n = RIM.length;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={halo ? '-30 -30 160 160' : '0 0 100 100'}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <radialGradient id={`${id}core`} cx="46%" cy="40%" r="62%">
          <stop offset="0" stopColor="#ffffff" stopOpacity={dim ? 0.25 : 1} />
          <stop offset="0.16" stopColor={shade(base, 0.6)} />
          <stop offset="0.5" stopColor={base} />
          <stop offset="1" stopColor={shade(base, -0.62)} />
        </radialGradient>
        <radialGradient id={`${id}halo`}>
          <stop offset="0.35" stopColor={base} stopOpacity="0.55" />
          <stop offset="1" stopColor={base} stopOpacity="0" />
        </radialGradient>
      </defs>
      {halo && !dim ? <circle cx="50" cy="50" r="78" fill={`url(#${id}halo)`} /> : null}
      <polygon points={pts(RIM)} fill={`url(#${id}core)`} />
      {/* Facets: alternate light and shade between rim and table. */}
      {RIM.map(([x, y], i) => {
        const [x2, y2] = RIM[(i + 1) % n]!;
        const [tx, ty] = TABLE[i]!;
        const [tx2, ty2] = TABLE[(i + 1) % n]!;
        const lit = i < 3 || i === n - 1;
        return (
          <polygon
            key={i}
            points={`${x},${y} ${x2},${y2} ${tx2},${ty2} ${tx},${ty}`}
            fill={lit ? '#ffffff' : '#000000'}
            opacity={lit ? 0.14 : 0.18 + (i % 2) * 0.06}
          />
        );
      })}
      <polygon points={pts(TABLE)} fill="#ffffff" opacity={dim ? 0.05 : 0.12} />
      <polygon points={pts(RIM)} fill="none" stroke={shade(base, 0.7)} strokeOpacity="0.55" strokeWidth="1.2" />
      {/* Specular glint. */}
      <ellipse cx="38" cy="24" rx="9" ry="4.5" transform="rotate(-28 38 24)" fill="#fff" opacity={dim ? 0.12 : 0.75} />
    </svg>
  );
}
