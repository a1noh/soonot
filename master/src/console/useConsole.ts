/**
 * One socket, both games (spec §2).
 *
 * The console holds a single `/master` connection. Every master device sees the
 * same console state (req §3.4), so this hook mirrors the server's event
 * summary rather than keeping any authoritative state of its own.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { EventSummary } from '../event/event.js';
import type { GameId } from '../shared/lifecycle.js';

export type AuthState = 'checking' | 'signed-out' | 'signed-in';

export interface ConsoleApi {
  auth: AuthState;
  connected: boolean;
  event: EventSummary | null;
  /** Each game's projected view, as `project()` returned it for the master. */
  views: Partial<Record<GameId, unknown>>;
  error: string | null;
  signIn(passcode: string): Promise<{ ok: boolean; locked?: boolean }>;
  signOut(everywhere: boolean): Promise<void>;
  createEvent(title: string): Promise<void>;
  setProjector(setting: GameId | 'auto'): Promise<void>;
  enableGame(gameId: GameId, enabled: boolean): Promise<void>;
  /** Reset one game back to SETUP, keeping the event and the other game. */
  resetGame(gameId: GameId): Promise<void>;
  /** Close the current event and return to the create screen. */
  resetEvent(): Promise<void>;
  /** Every game action names its game — both games share `master:start` etc. */
  send(gameId: GameId, ev: string, payload?: Record<string, unknown>): Promise<unknown>;
}

interface Ack {
  ok: boolean;
  error?: { code: string; message: string };
  event?: EventSummary;
}

export function useConsole(): ConsoleApi {
  const [auth, setAuth] = useState<AuthState>('checking');
  const [connected, setConnected] = useState(false);
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [views, setViews] = useState<Partial<Record<GameId, unknown>>>({});
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // req §12: reopening the console restores the session from the cookie with
  // no passcode prompt. This is the whole of that behaviour.
  useEffect(() => {
    let cancelled = false;
    void fetch('/master/session')
      .then((r) => r.json())
      .then((body: { ok: boolean }) => {
        if (!cancelled) setAuth(body.ok ? 'signed-in' : 'signed-out');
      })
      .catch(() => {
        if (!cancelled) setAuth('signed-out');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (auth !== 'signed-in') return undefined;

    const socket = io('/master', {
      withCredentials: true,
      // Jittered backoff: without it 100 clients retry in lockstep forever
      // (bingo §13). The console is one client, but the setting is the host's.
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('event:summary', (summary: EventSummary | null) => setEvent(summary));
    socket.on('room:state', (msg: { gameId: GameId; view: unknown }) => {
      setViews((prev) => ({ ...prev, [msg.gameId]: msg.view }));
    });
    socket.on('error', (err: { message?: string }) => setError(err?.message ?? '문제가 생겼어요'));
    socket.on('connect_error', (err: Error) => {
      // The handshake refused us — the session expired under the open socket.
      if (err.message === 'NOT_MASTER') setAuth('signed-out');
    });

    return () => {
      socket.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [auth]);

  const hostOp = useCallback((ev: string, payload?: unknown) => {
    return new Promise<unknown>((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket) return reject(new Error('not connected'));
      socket.emit(ev, payload ?? {}, (ack: Ack) => {
        if (ack?.ok) return resolve(ack);
        const message = ack?.error?.message ?? '문제가 생겼어요';
        setError(message);
        reject(new Error(message));
      });
    });
  }, []);

  const send = useCallback((gameId: GameId, ev: string, payload?: Record<string, unknown>) => {
    return new Promise<unknown>((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket) return reject(new Error('not connected'));
      socket.emit(ev, { ...payload, gameId }, (ack: Ack) => {
        if (ack?.ok) return resolve(ack);
        const message = ack?.error?.message ?? '문제가 생겼어요';
        setError(message);
        reject(new Error(message));
      });
    });
  }, []);

  const signIn = useCallback(async (passcode: string) => {
    setError(null);
    const res = await fetch('/master/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passcode }),
    });
    if (res.ok) {
      setAuth('signed-in');
      return { ok: true };
    }
    return { ok: false, locked: res.status === 429 };
  }, []);

  const signOut = useCallback(async (everywhere: boolean) => {
    await fetch('/master/signout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ everywhere }),
    });
    socketRef.current?.close();
    setEvent(null);
    setAuth('signed-out');
  }, []);

  return useMemo<ConsoleApi>(
    () => ({
      auth,
      connected,
      event,
      views,
      error,
      signIn,
      signOut,
      createEvent: async (title) => {
        await hostOp('event:create', { title });
      },
      setProjector: async (setting) => {
        await hostOp('projector:set', { setting });
      },
      enableGame: async (gameId, enabled) => {
        await hostOp('game:enable', { gameId, enabled });
      },
      resetGame: async (gameId) => {
        await hostOp('game:reset', { gameId });
      },
      resetEvent: async () => {
        await hostOp('event:reset');
        setEvent(null);
      },
      send,
    }),
    [auth, connected, event, views, error, signIn, signOut, send, hostOp],
  );
}
