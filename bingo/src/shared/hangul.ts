/**
 * Hangul handling. bingo/req.md §7.1 and §12.
 *
 * Owned here and used by BOTH the engine (for `nicknameKey`) and the client
 * (for search), so the two can never disagree about what 민수 is.
 */

const SYL_BASE = 0xac00;
const SYL_LAST = 0xd7a3;
const CHOSEONG_SPAN = 588; // 21 jungseong × 28 jongseong

/** The 19 lead consonants, in Unicode order. */
const CHOSEONG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
] as const;

const CHOSEONG_SET = new Set<string>(CHOSEONG);

/**
 * Normalize a nickname for comparison and indexing. req §7.1.
 *
 * NFC first: iOS and Android keyboards disagree about whether 민수 is composed
 * syllables or decomposed jamo, and without this the same name typed on two
 * phones does not match.
 */
export function normalizeNickname(input: string): string {
  return input.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Is this a precomposed Hangul syllable? */
export function isSyllable(cp: number): boolean {
  return cp >= SYL_BASE && cp <= SYL_LAST;
}

/**
 * Extract the lead-consonant string: 민수 → 'ㅁㅅ'.
 *
 * Computed once per roster entry at insert and cached (req §12) — re-deriving
 * it per keystroke over 300 entries is the one place a phone could feel slow.
 * Non-syllable characters are passed through, so 'a민수' → 'aㅁㅅ'.
 */
export function choseongOf(text: string): string {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    out += isSyllable(cp)
      ? CHOSEONG[Math.floor((cp - SYL_BASE) / CHOSEONG_SPAN)]!
      : ch;
  }
  return out;
}

/** Is every character of `q` a lead consonant? Then it is a 초성 query. */
export function isChoseongQuery(q: string): boolean {
  if (q.length === 0) return false;
  for (const ch of q) if (!CHOSEONG_SET.has(ch)) return false;
  return true;
}
