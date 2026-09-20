import { describe, it, expect } from 'vitest';
import { createBucket, createBucketRegistry, ACTIONS_PER_SEC, BURST } from '../host/tokenbucket';

describe('token bucket (bingo §16.6)', () => {
  it('allows a burst then throttles', () => {
    const b = createBucket();
    let t = 1000;
    for (let i = 0; i < BURST; i++) expect(b.take(t)).toBe(true);
    expect(b.take(t)).toBe(false);
  });

  it('refills at the configured rate', () => {
    const b = createBucket();
    let t = 1000;
    for (let i = 0; i < BURST; i++) b.take(t);
    expect(b.take(t)).toBe(false);
    t += 1000; // one second → ACTIONS_PER_SEC tokens back
    for (let i = 0; i < ACTIONS_PER_SEC; i++) expect(b.take(t)).toBe(true);
    expect(b.take(t)).toBe(false);
  });

  it('never exceeds the burst ceiling however long it idles', () => {
    const b = createBucket();
    b.take(0);
    let allowed = 0;
    const t = 10 * 60_000; // ten idle minutes
    while (b.take(t)) allowed++;
    expect(allowed).toBe(BURST);
  });

  it('reports a usable retry hint instead of an error', () => {
    const b = createBucket();
    const t = 1000;
    for (let i = 0; i < BURST; i++) b.take(t);
    const wait = b.retryAfterMs(t);
    expect(wait).toBeGreaterThan(0);
    expect(b.take(t + wait)).toBe(true);
  });

  it('a sustained 1 fill / 5s client is never throttled', () => {
    const b = createBucket();
    for (let i = 0; i < 200; i++) expect(b.take(i * 5000)).toBe(true);
  });

  it('buckets are per socket and dropped on disconnect', () => {
    const reg = createBucketRegistry();
    const t = 0;
    for (let i = 0; i < BURST; i++) reg.for('a').take(t);
    expect(reg.for('a').take(t)).toBe(false);
    expect(reg.for('b').take(t)).toBe(true); // independent
    expect(reg.size()).toBe(2);
    reg.drop('a');
    expect(reg.size()).toBe(1);
  });
});
