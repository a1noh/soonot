/**
 * Sign-in rate limiting (req §8, spec §4.2).
 *
 * 5 attempts per IP per minute, then a 15-minute lockout. The threat model is
 * not a botnet — it is that a 4-character event code is guessable and is handed
 * to a hundred people, so the passcode must not be brute-forceable by anyone
 * holding one. Failures return one generic message and are never distinguished.
 */

export const MAX_ATTEMPTS = 5;
export const WINDOW_MS = 60_000;
export const LOCKOUT_MS = 15 * 60_000;

interface Bucket {
  attempts: number[];
  lockedUntil: number;
}

export interface AttemptLimiter {
  check(key: string, now: number): { ok: true } | { ok: false; retryAfterMs: number };
  fail(key: string, now: number): void;
  succeed(key: string): void;
  size(): number;
}

export function createAttemptLimiter(): AttemptLimiter {
  const buckets = new Map<string, Bucket>();

  function prune(bucket: Bucket, now: number): void {
    bucket.attempts = bucket.attempts.filter((t) => now - t < WINDOW_MS);
  }

  return {
    check(key, now) {
      const bucket = buckets.get(key);
      if (!bucket) return { ok: true };
      if (bucket.lockedUntil > now) {
        return { ok: false, retryAfterMs: bucket.lockedUntil - now };
      }
      prune(bucket, now);
      if (bucket.attempts.length >= MAX_ATTEMPTS) {
        bucket.lockedUntil = now + LOCKOUT_MS;
        return { ok: false, retryAfterMs: LOCKOUT_MS };
      }
      return { ok: true };
    },

    fail(key, now) {
      const bucket = buckets.get(key) ?? { attempts: [], lockedUntil: 0 };
      prune(bucket, now);
      bucket.attempts.push(now);
      if (bucket.attempts.length >= MAX_ATTEMPTS) bucket.lockedUntil = now + LOCKOUT_MS;
      buckets.set(key, bucket);
    },

    succeed(key) {
      // A correct passcode clears the record. The operator who fat-fingered it
      // four times while a room waits must not then be locked out by their own
      // success.
      buckets.delete(key);
    },

    size: () => buckets.size,
  };
}
