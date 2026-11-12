/**
 * Autumn leaves, drawn once in SVG for the 추수감사절 bingo: the stamp on a
 * filled cell, the falling leaves of a bingo celebration, and the ornament on
 * the join card. Two shapes (a maple and a plain oval leaf) keep it varied
 * without turning into clip art.
 */
import type { CSSProperties } from 'react';

export type LeafShape = 'maple' | 'oval';

const PATHS: Record<LeafShape, { body: string; veins: string }> = {
  maple: {
    body:
      'M50 4 L57 22 L70 14 L67 34 L88 28 L78 46 L96 52 L76 60 L82 76 L60 70 L54 86 L50 96 L46 86 L40 70 L18 76 L24 60 L4 52 L22 46 L12 28 L33 34 L30 14 L43 22 Z',
    veins: 'M50 96 L50 30 M50 62 L24 48 M50 62 L76 48 M50 74 L30 70 M50 74 L70 70',
  },
  oval: {
    body: 'M50 4 C78 20 86 52 66 80 C60 88 54 92 50 96 C46 92 40 88 34 80 C14 52 22 20 50 4 Z',
    veins: 'M50 96 L50 14 M50 40 L36 30 M50 40 L64 30 M50 58 L32 46 M50 58 L68 46 M50 76 L36 66 M50 76 L64 66',
  },
};

export function Leaf({
  shape = 'maple',
  color,
  vein = 'rgba(255,250,240,0.55)',
  size = 24,
  className,
  style,
}: {
  shape?: LeafShape;
  color: string;
  vein?: string;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  const p = PATHS[shape];
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <path d={p.body} fill={color} />
      <path d={p.veins} fill="none" stroke={vein} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Harvest colours, in the order stamps and falling leaves cycle through them. */
export const LEAF_COLORS = ['#c2541b', '#d99a26', '#962632', '#55703a', '#b3701f'] as const;
