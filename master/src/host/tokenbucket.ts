/**
 * Per-socket action rate limiting (bingo §16.6, spec §6.2).
 *
 * A host service, so yutnori is covered for free even though its threat model
 * is one operator tapping a button.
 *
 * The realistic threat is not malice: it is one client stuck in a retry loop
 * against a rejected fill, multiplied by a room full of phones. Excess is
 * therefore **dropped silently** with a retry hint rather than answered with an
 * error — an error reply to a retry-looping client is itself traffic, which is
 * the failure mode being defended against.
 */

export const ACTIONS_PER_SEC = 10;
export const BURST = 20;

export interface Bucket {
  /** Consume one token. False means drop this action. */
  take(now: number): boolean;
  /** Milliseconds until at least one token is available. */
  retryAfterMs(now: number): number;
}

export function createBucket(
  ratePerSec: number = ACTIONS_PER_SEC,
  burst: number = BURST,
): Bucket {
  let tokens = burst;
  let last = -1;

  const refill = (now: number): void => {
    if (last < 0) {
      last = now;
      return;
    }
    const elapsed = Math.max(0, now - last);
    if (elapsed === 0) return;
    tokens = Math.min(burst, tokens + (elapsed * ratePerSec) / 1000);
    last = now;
  };

  return {
    take(now) {
      refill(now);
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
    retryAfterMs(now) {
      refill(now);
      if (tokens >= 1) return 0;
      return Math.ceil(((1 - tokens) / ratePerSec) * 1000);
    },
  };
}

/** One bucket per socket, dropped when the socket goes. */
export function createBucketRegistry(ratePerSec?: number, burst?: number) {
  const buckets = new Map<string, Bucket>();
  return {
    for(socketId: string): Bucket {
      let b = buckets.get(socketId);
      if (!b) buckets.set(socketId, (b = createBucket(ratePerSec, burst)));
      return b;
    },
    drop(socketId: string): void {
      buckets.delete(socketId);
    },
    size: () => buckets.size,
  };
}

export type BucketRegistry = ReturnType<typeof createBucketRegistry>;
