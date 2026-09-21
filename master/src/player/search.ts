/**
 * Client-side roster search (bingo spec §7.2). Runs entirely against the cached
 * roster — a fill never round-trips to the server just to find a name.
 *
 * The 초성 (lead-consonant) string is computed once per person at insert and
 * cached, never re-derived per keystroke, which is the one place a phone could
 * feel slow over 300 people.
 */
import {
  choseongOf,
  isChoseongQuery,
  normalizeNickname,
} from '@soonot/bingo/src/shared/hangul.js';

export interface Person {
  readonly id: string;
  readonly n: number;
  readonly name: string;
  readonly conn: boolean;
  /** Normalized name, for substring matching. */
  readonly key: string;
  /** Cached lead-consonant form, e.g. 민수 → ㅁㅅ. */
  readonly cho: string;
}

export function makePerson(e: { id: string; n: number; name: string; conn: boolean }): Person {
  return {
    id: e.id,
    n: e.n,
    name: e.name,
    conn: e.conn,
    key: normalizeNickname(e.name),
    cho: choseongOf(e.name),
  };
}

/**
 * Three modes (spec §7.2): a pure number is an exact player-number match, an
 * all-초성 query is a prefix match on the cached lead consonants, and anything
 * else is a substring match on the normalized name.
 */
export function search(people: readonly Person[], raw: string): Person[] {
  const q = raw.trim();
  if (q.length === 0) return [];

  if (/^\d+$/.test(q)) {
    const n = Number.parseInt(q, 10);
    return people.filter((p) => p.n === n);
  }

  if (isChoseongQuery(q)) {
    return people.filter((p) => p.cho.startsWith(q));
  }

  const key = normalizeNickname(q);
  return people.filter((p) => p.key.includes(key));
}
