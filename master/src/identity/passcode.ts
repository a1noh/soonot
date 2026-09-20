/**
 * The master passcode (req §3.1, §8).
 *
 * One passcode per deployment, held as a `scrypt` hash in configuration.
 * Never logged, never echoed to a client, never written to the database — there
 * is no `master_passcode` table and no `users` table, because there is exactly
 * one master user and accounts would buy nothing (req §3.1).
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const N = 16_384; // ~100ms on the kind of laptop this runs on
const r = 8;
const p = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;
const PREFIX = 'scrypt';

/** `scrypt$N$r$p$salt$hash`, all base64. Self-describing, so N can rise later. */
export function hashPasscode(passcode: string): string {
  const salt = randomBytes(SALT_LEN);
  const key = scryptSync(passcode.normalize('NFC'), salt, KEY_LEN, { N, r, p });
  return [PREFIX, N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
}

/**
 * Constant-time compare (req §8). Returns false for a malformed hash rather
 * than throwing: a misconfigured `MASTER_PASSCODE_HASH` must fail closed, not
 * crash the process in front of a room.
 */
export function verifyPasscode(passcode: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts as [
    string, string, string, string, string, string,
  ];
  const nCost = Number(nRaw);
  const rCost = Number(rRaw);
  const pCost = Number(pRaw);
  if (!Number.isInteger(nCost) || !Number.isInteger(rCost) || !Number.isInteger(pCost)) {
    return false;
  }

  let expected: Buffer;
  try {
    expected = Buffer.from(hashRaw, 'base64');
    const salt = Buffer.from(saltRaw, 'base64');
    const actual = scryptSync(passcode.normalize('NFC'), salt, expected.length, {
      N: nCost,
      r: rCost,
      p: pCost,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
