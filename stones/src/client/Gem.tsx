/**
 * One cut gem, drawn in SVG from a single base colour. Shared by the console
 * (small, flat) and the projector (large, glowing).
 */

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) =>
    Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))
      .toString(16)
      .padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

export interface GemProps {
  color: string;
  size?: number;
  /** Greyed out: held already, or not in play. */
  dim?: boolean;
  className?: string;
  title?: string;
}

export function Gem({ color, size = 24, dim = false, className, title }: GemProps) {
  const base = dim ? '#5b6270' : color;
  const light = shade(base, 0.55);
  const mid = shade(base, 0.18);
  const dark = shade(base, -0.38);
  const deep = shade(base, -0.6);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {/* Crown */}
      <polygon points="22,30 38,14 62,14 78,30" fill={light} />
      <polygon points="38,14 50,30 62,14" fill={shade(base, 0.75)} />
      <polygon points="22,30 38,14 50,30" fill={mid} />
      <polygon points="62,14 78,30 50,30" fill={base} />
      {/* Pavilion */}
      <polygon points="22,30 50,30 50,88" fill={base} />
      <polygon points="50,30 78,30 50,88" fill={dark} />
      <polygon points="22,30 36,30 50,88" fill={mid} />
      <polygon points="64,30 78,30 50,88" fill={deep} />
      {/* Girdle line and glint */}
      <polyline points="22,30 78,30" stroke={shade(base, 0.85)} strokeWidth="1.5" fill="none" />
      <polygon points="40,18 46,18 42,26" fill="#fff" opacity={dim ? 0.15 : 0.7} />
    </svg>
  );
}
