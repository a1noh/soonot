/** '2명' → '각 팀 2명', '모두' → '팀 전원'. Anything else is shown as written. */
export function playersLabel(players: string): string {
  const p = players.trim();
  if (!p) return '';
  if (p === '모두' || p === '전원' || p === '전체') return '팀 전원';
  return /^\d+\s*명$/.test(p) ? `각 팀 ${p.replace(/\s+/g, '')}` : p;
}
