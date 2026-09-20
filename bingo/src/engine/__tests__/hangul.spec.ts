import { describe, it, expect } from 'vitest';
import { normalizeNickname, choseongOf, isChoseongQuery } from '../../shared/hangul';

describe('hangul', () => {
  it('NFC: composed and decomposed 민수 normalize equal', () => {
    const composed = '민수';
    const decomposed = '민수'.normalize('NFD');
    expect(decomposed).not.toBe(composed); // precondition: they really differ
    expect(normalizeNickname(decomposed)).toBe(normalizeNickname(composed));
  });

  it('trims and collapses whitespace', () => {
    expect(normalizeNickname('  민 \t 수  ')).toBe('민 수');
    expect(normalizeNickname('민수 ')).toBe(normalizeNickname('민수'));
  });

  it('lowercases Latin but leaves Hangul alone', () => {
    expect(normalizeNickname('AuStin')).toBe('austin');
    expect(normalizeNickname('민수')).toBe('민수');
  });

  it('extracts 초성', () => {
    expect(choseongOf('민수')).toBe('ㅁㅅ');
    expect(choseongOf('지은')).toBe('ㅈㅇ');
    expect(choseongOf('빠르게')).toBe('ㅃㄹㄱ');
  });

  it('passes non-syllables through', () => {
    expect(choseongOf('a민수1')).toBe('aㅁㅅ1');
    expect(choseongOf('')).toBe('');
  });

  it('covers the whole syllable block without throwing', () => {
    for (let cp = 0xac00; cp <= 0xd7a3; cp += 97) {
      const out = choseongOf(String.fromCodePoint(cp));
      expect(out).toHaveLength(1);
      expect(out.codePointAt(0)!).toBeGreaterThanOrEqual(0x3131);
    }
  });

  it('recognises a 초성 query', () => {
    expect(isChoseongQuery('ㅁㅅ')).toBe(true);
    expect(isChoseongQuery('민수')).toBe(false);
    expect(isChoseongQuery('')).toBe(false);
  });
});
