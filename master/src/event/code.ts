/**
 * Event codes (req §4.1).
 *
 * Four characters, `A-Z` minus `I` and `O`. One code for the whole event, in
 * every surface's URL — because at 100+ people the failure mode is social, and
 * two codes doubles it (req §6).
 *
 * `I`/`O` are out because they are read aloud off a slide and typed on phone
 * keyboards, where they collide with `1` and `0`. Both games' specs had already
 * chosen this alphabet independently; it is written once here.
 */

import { randomInt } from 'node:crypto';

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, no O
export const CODE_LENGTH = 4;

export function generateCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

export function isValidCode(v: unknown): v is string {
  if (typeof v !== 'string' || v.length !== CODE_LENGTH) return false;
  for (const ch of v) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}

/**
 * Attendees type the code into a phone, so accept lower case and stray spaces.
 *
 * Nothing else is repaired. A code containing `0`, `1`, `I` or `O` is rejected
 * rather than guessed at: remapping a typo would silently resolve it to a
 * *different valid code*, and the excluded characters exist to keep that
 * confusion out of the alphabet in the first place, not to be decoded back in.
 */
export function normalizeCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}
