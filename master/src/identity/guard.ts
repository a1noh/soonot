/**
 * The handshake guard (spec §4.3).
 *
 * Master privilege is decided **once**, when the socket connects, from the
 * session cookie — never in-band. `master:auth` does not exist, which deletes
 * that event, its rate limiter, its error path and its reconnect step from both
 * games at once.
 */

import { parse as parseCookie } from 'cookie';
import type { Viewer } from '../host/module.js';
import type { Sessions } from './session.js';
import { COOKIE_NAME } from './session.js';

export type NamespaceName = '/master' | '/b' | '/y' | '/p';

export const NAMESPACES = ['/master', '/b', '/y', '/p'] as const;

/**
 * `/p` is absent on purpose.
 *
 * The projector surface **ignores the cookie entirely**, so the laptop at the
 * front of the room carries no privileged channel even when the master signed
 * in on that same machine earlier (req §8). This is one line, and it is the
 * single most valuable line in the file.
 */
const COOKIE_IS_READ_ON: ReadonlySet<string> = new Set(['/master']);

export function cookieOf(headers: Record<string, unknown> | undefined): string | undefined {
  const raw = headers?.['cookie'];
  if (typeof raw !== 'string') return undefined;
  try {
    return parseCookie(raw)[COOKIE_NAME];
  } catch {
    return undefined;
  }
}

export interface HandshakeInput {
  namespace: string;
  headers?: Record<string, unknown>;
  now: number;
}

export interface HandshakeDecision {
  master: boolean;
  viewer: Viewer;
  /** `/master` refuses the connection outright rather than accepting it mute. */
  reject: boolean;
}

export function decideHandshake(sessions: Sessions, input: HandshakeInput): HandshakeDecision {
  const { namespace, now } = input;

  const master =
    COOKIE_IS_READ_ON.has(namespace) && sessions.verify(cookieOf(input.headers), now) !== null;

  if (namespace === '/master') {
    return {
      master,
      viewer: { kind: 'master' },
      reject: !master,
    };
  }

  if (namespace === '/b') {
    // Bingo players are not authenticated: `playerId` is a bearer token in
    // localStorage and possession is identity (bingo spec §5.3). The id is
    // adopted at join, so the handshake carries none.
    return { master: false, viewer: { kind: 'player', playerId: '' }, reject: false };
  }

  // `/y` and `/p`: read-only for life, and never promoted. There is no upgrade
  // path, so there is no upgrade bug (req §3.3).
  return { master: false, viewer: { kind: 'spectator' }, reject: false };
}
