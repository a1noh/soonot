/**
 * Number/nickname → playerId. bingo/req.md §7.0, §7.2; spec §4.4.
 *
 * Both lookups are O(1) off maps maintained incrementally on JOIN, so a fill
 * costs the same at 300 players as at 3. Nothing here scans the roster.
 */
import type { Room } from '../shared/types';
import { normalizeNickname } from '../shared/hangul';

export type Resolved =
  | { k: 'hit'; playerId: string }
  | { k: 'ambiguous'; playerIds: readonly string[] }
  | { k: 'miss' };

/** A query of only digits is a player number; anything else is a name. */
function asNumber(q: string): number | null {
  const t = q.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number.parseInt(t, 10);
  return n > 0 ? n : null;
}

export function resolve(room: Room, query: string): Resolved {
  const num = asNumber(query);
  if (num !== null) {
    const id = room.byNumber.get(num);
    return id ? { k: 'hit', playerId: id } : { k: 'miss' };
  }

  const ids = room.nameIndex.get(normalizeNickname(query));
  if (!ids || ids.length === 0) return { k: 'miss' };
  if (ids.length === 1) return { k: 'hit', playerId: ids[0]! };
  return { k: 'ambiguous', playerIds: ids };
}
