/**
 * `guard.spec` (spec §10) — `/p` ignores a valid cookie; a socket's master flag
 * is immutable.
 */

import { describe, expect, it } from 'vitest';
import { createMemorySecretStore, createSessions, COOKIE_NAME } from '../identity/session.js';
import { cookieOf, decideHandshake, NAMESPACES } from '../identity/guard.js';
import {
  LOCKOUT_MS,
  MAX_ATTEMPTS,
  WINDOW_MS,
  createAttemptLimiter,
} from '../identity/ratelimit.js';

const T0 = 1_700_000_000_000;

function withCookie(token: string) {
  return { cookie: `${COOKIE_NAME}=${token}; theme=dark` };
}

describe('the handshake guard', () => {
  it('grants master only on /master, with a valid cookie', () => {
    const s = createSessions(createMemorySecretStore('k'));
    const headers = withCookie(s.issue(T0));

    const d = decideHandshake(s, { namespace: '/master', headers, now: T0 });
    expect(d.master).toBe(true);
    expect(d.reject).toBe(false);
    expect(d.viewer).toEqual({ kind: 'master' });
  });

  it('refuses the /master connection outright without a session', () => {
    const s = createSessions(createMemorySecretStore('k'));
    const d = decideHandshake(s, { namespace: '/master', now: T0 });
    expect(d.master).toBe(false);
    expect(d.reject).toBe(true);
  });

  it('IGNORES a perfectly valid cookie on /p', () => {
    // req §8 — the unattended projector laptop. The master may well have signed
    // in on that very machine earlier; the projector surface still carries no
    // privileged channel.
    const s = createSessions(createMemorySecretStore('k'));
    const headers = withCookie(s.issue(T0));

    const d = decideHandshake(s, { namespace: '/p', headers, now: T0 });
    expect(d.master).toBe(false);
    expect(d.reject).toBe(false);
    expect(d.viewer).toEqual({ kind: 'spectator' });
  });

  it('ignores a valid cookie on /y and /b too', () => {
    const s = createSessions(createMemorySecretStore('k'));
    const headers = withCookie(s.issue(T0));

    expect(decideHandshake(s, { namespace: '/y', headers, now: T0 }).master).toBe(false);
    expect(decideHandshake(s, { namespace: '/b', headers, now: T0 }).master).toBe(false);
  });

  it('gives every non-master namespace a read-only viewer', () => {
    const s = createSessions(createMemorySecretStore('k'));
    for (const ns of NAMESPACES.filter((n) => n !== '/master')) {
      const d = decideHandshake(s, { namespace: ns, now: T0 });
      expect(d.master).toBe(false);
      expect(d.reject).toBe(false);
    }
  });

  it('refuses an expired cookie on /master', () => {
    const s = createSessions(createMemorySecretStore('k'));
    const headers = withCookie(s.issue(T0, 1000));
    expect(decideHandshake(s, { namespace: '/master', headers, now: T0 + 2000 }).reject).toBe(true);
  });

  it('parses the session cookie out of a crowded header', () => {
    expect(cookieOf({ cookie: `a=1; ${COOKIE_NAME}=tok; b=2` })).toBe('tok');
    expect(cookieOf({ cookie: 'a=1' })).toBeUndefined();
    expect(cookieOf({})).toBeUndefined();
    expect(cookieOf(undefined)).toBeUndefined();
  });
});

describe('sign-in rate limiting', () => {
  it('allows five attempts, then locks out for fifteen minutes', () => {
    const l = createAttemptLimiter();
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect(l.check('1.2.3.4', T0).ok).toBe(true);
      l.fail('1.2.3.4', T0);
    }
    const blocked = l.check('1.2.3.4', T0);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterMs).toBe(LOCKOUT_MS);
  });

  it('forgets attempts that age out of the window', () => {
    const l = createAttemptLimiter();
    for (let i = 0; i < MAX_ATTEMPTS - 1; i += 1) l.fail('ip', T0);
    expect(l.check('ip', T0 + WINDOW_MS + 1).ok).toBe(true);
  });

  it('clears the record on a correct passcode', () => {
    // The operator who fat-fingers it four times while a room waits must not
    // then be locked out by their own success.
    const l = createAttemptLimiter();
    for (let i = 0; i < MAX_ATTEMPTS - 1; i += 1) l.fail('ip', T0);
    l.succeed('ip');
    expect(l.size()).toBe(0);
    expect(l.check('ip', T0).ok).toBe(true);
  });

  it('limits per IP, not globally', () => {
    const l = createAttemptLimiter();
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) l.fail('bad', T0);
    expect(l.check('bad', T0).ok).toBe(false);
    expect(l.check('good', T0).ok).toBe(true);
  });
});
