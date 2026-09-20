/**
 * Session tokens (spec §4.1).
 *
 * No session store, no database row: the cookie **is** the session.
 *
 *     value   = base64url(payload) + '.' + base64url(HMAC-SHA256(secret, payload))
 *     payload = { v: 1, iat, exp }      // no user id — there is one user (req §3.1)
 *
 * Stateless verification is what makes req §12 work: a server restart mid-event
 * does not sign the master out, and a reconnect carries the cookie
 * automatically, so "re-enter the passcode after a crash" stops being a step.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'soonot_master';
export const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours (req §3.2)

export interface SessionPayload {
  readonly v: 1;
  readonly iat: number;
  readonly exp: number;
}

/**
 * Where the signing secret lives. Rotating it invalidates **every** outstanding
 * token at once, which is exactly what `모든 기기에서 로그아웃` means (req §3.4).
 *
 * Milestone 6 backs this with the `host_config` table; until then it is
 * in-memory, which is honest — a restart signs everyone out, and the spec says
 * that should not happen, so the persistent store is not optional later.
 */
export interface SecretStore {
  get(): string;
  rotate(): string;
}

export function createMemorySecretStore(initial?: string): SecretStore {
  let secret = initial ?? randomBytes(32).toString('base64url');
  return {
    get: () => secret,
    rotate: () => {
      secret = randomBytes(32).toString('base64url');
      return secret;
    },
  };
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

export interface Sessions {
  issue(now: number, ttlMs?: number): string;
  verify(token: string | undefined | null, now: number): SessionPayload | null;
  rotate(): void;
}

export function createSessions(store: SecretStore): Sessions {
  return {
    issue(now, ttlMs = DEFAULT_TTL_MS) {
      const payload: SessionPayload = { v: 1, iat: now, exp: now + ttlMs };
      const body = b64url(JSON.stringify(payload));
      return `${body}.${sign(body, store.get())}`;
    },

    verify(token, now) {
      if (!token) return null;
      const dot = token.indexOf('.');
      if (dot <= 0) return null;

      const body = token.slice(0, dot);
      const mac = token.slice(dot + 1);
      const expected = sign(body, store.get());

      // Constant-time compare, and only then parse. Length must match first —
      // timingSafeEqual throws on a length mismatch.
      const a = Buffer.from(mac);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

      let payload: SessionPayload;
      try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
      } catch {
        return null;
      }

      if (payload.v !== 1) return null;
      if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
      return payload;
    },

    rotate() {
      store.rotate();
    },
  };
}

export interface CookieOptions {
  /** `Secure` is set when the deployment terminates TLS (spec §4.1). */
  secure: boolean;
  maxAgeMs?: number;
}

export function sessionCookie(token: string, opts: CookieOptions): string {
  const bits = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${Math.floor((opts.maxAgeMs ?? DEFAULT_TTL_MS) / 1000)}`,
  ];
  if (opts.secure) bits.push('Secure');
  return bits.join('; ');
}

export function clearedCookie(opts: CookieOptions): string {
  const bits = [`${COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (opts.secure) bits.push('Secure');
  return bits.join('; ');
}
