/**
 * `session.spec` (spec §10) — sign / verify / expiry / tamper / rotation
 * invalidates all.
 */

import { describe, expect, it } from 'vitest';
import {
  COOKIE_NAME,
  DEFAULT_TTL_MS,
  clearedCookie,
  createMemorySecretStore,
  createSessions,
  sessionCookie,
} from '../identity/session.js';
import { hashPasscode, verifyPasscode } from '../identity/passcode.js';

const T0 = 1_700_000_000_000;

describe('session tokens', () => {
  it('round-trips a freshly issued token', () => {
    const s = createSessions(createMemorySecretStore('secret-a'));
    const token = s.issue(T0);
    expect(s.verify(token, T0 + 1000)).toMatchObject({ v: 1 });
  });

  it('expires after 12 hours', () => {
    const s = createSessions(createMemorySecretStore('secret-a'));
    const token = s.issue(T0);
    expect(s.verify(token, T0 + DEFAULT_TTL_MS - 1)).not.toBeNull();
    expect(s.verify(token, T0 + DEFAULT_TTL_MS + 1)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const s = createSessions(createMemorySecretStore('secret-a'));
    const token = s.issue(T0);
    const [body, mac] = token.split('.') as [string, string];

    const forgedPayload = Buffer.from(
      JSON.stringify({ v: 1, iat: T0, exp: T0 + 10 * DEFAULT_TTL_MS }),
    ).toString('base64url');

    expect(s.verify(`${forgedPayload}.${mac}`, T0)).toBeNull();
    expect(s.verify(`${body}.${mac.slice(0, -1)}x`, T0)).toBeNull();
    expect(s.verify('garbage', T0)).toBeNull();
    expect(s.verify('', T0)).toBeNull();
    expect(s.verify(undefined, T0)).toBeNull();
  });

  it('rejects a token signed with another secret', () => {
    const a = createSessions(createMemorySecretStore('secret-a'));
    const b = createSessions(createMemorySecretStore('secret-b'));
    expect(b.verify(a.issue(T0), T0)).toBeNull();
  });

  it('rotation invalidates every outstanding token at once', () => {
    // req §3.4 — `모든 기기에서 로그아웃`. This is the whole mechanism.
    const s = createSessions(createMemorySecretStore('secret-a'));
    const laptop = s.issue(T0);
    const phone = s.issue(T0 + 5);

    expect(s.verify(laptop, T0 + 10)).not.toBeNull();
    expect(s.verify(phone, T0 + 10)).not.toBeNull();

    s.rotate();

    expect(s.verify(laptop, T0 + 10)).toBeNull();
    expect(s.verify(phone, T0 + 10)).toBeNull();
  });

  it('keeps a second device signed in when the first signs out alone', () => {
    // req §3.4: signing out on one device does not sign out the others — only
    // rotation does that.
    const s = createSessions(createMemorySecretStore('secret-a'));
    const laptop = s.issue(T0);
    const phone = s.issue(T0);
    // A plain sign-out clears the cookie on that browser; no server state moves.
    expect(clearedCookie({ secure: false })).toContain('Max-Age=0');
    expect(s.verify(laptop, T0 + 10)).not.toBeNull();
    expect(s.verify(phone, T0 + 10)).not.toBeNull();
  });

  it('survives a process restart when the secret is configured', () => {
    // Stateless verification is why req §12's "restart does not sign the master
    // out" holds. The secret must outlive the process for that to be true.
    const before = createSessions(createMemorySecretStore('configured-secret'));
    const token = before.issue(T0);
    const after = createSessions(createMemorySecretStore('configured-secret'));
    expect(after.verify(token, T0 + 1000)).not.toBeNull();
  });
});

describe('the session cookie', () => {
  it('is HttpOnly, SameSite=Lax and path-scoped', () => {
    const c = sessionCookie('tok', { secure: false });
    expect(c).toContain(`${COOKIE_NAME}=tok`);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
    expect(c).not.toContain('Secure');
  });

  it('adds Secure when the deployment terminates TLS', () => {
    expect(sessionCookie('tok', { secure: true })).toContain('Secure');
  });
});

describe('the master passcode', () => {
  it('verifies the right passcode and rejects the wrong one', () => {
    const stored = hashPasscode('은혜로운2026');
    expect(verifyPasscode('은혜로운2026', stored)).toBe(true);
    expect(verifyPasscode('은혜로운2025', stored)).toBe(false);
    expect(verifyPasscode('', stored)).toBe(false);
  });

  it('salts, so the same passcode hashes differently every time', () => {
    expect(hashPasscode('same')).not.toBe(hashPasscode('same'));
  });

  it('normalizes Hangul, so a composed and decomposed passcode match', () => {
    // iOS and Android keyboards disagree here (bingo §7.1); the passcode is
    // typed on whichever laptop is to hand.
    const composed = '은혜';
    const decomposed = composed.normalize('NFD');
    expect(composed).not.toBe(decomposed);
    expect(verifyPasscode(decomposed, hashPasscode(composed))).toBe(true);
  });

  it('fails closed on a malformed stored hash rather than throwing', () => {
    // A misconfigured MASTER_PASSCODE_HASH must not crash in front of a room.
    expect(verifyPasscode('x', 'not-a-hash')).toBe(false);
    expect(verifyPasscode('x', 'scrypt$a$b$c$d$e')).toBe(false);
    expect(verifyPasscode('x', '')).toBe(false);
  });
});
