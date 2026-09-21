/**
 * The bingo player's single `/b` socket, and the local mirror of what it sends.
 *
 * `room:state` (the per-viewer projection) is the source of truth for this
 * player's own card; the granular unicast/room events keep the roster and the
 * fill feedback current between projections. The client never decides whether a
 * fill is legal (spec §7.4) — it shows what the server sent.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { PlayerView } from '@soonot/bingo/src/project.js';
import { CELLS } from '@soonot/bingo/src/shared/constants.js';
import type { EventSummary } from '../event/event.js';
import { makePerson, type Person } from './search.js';

const STORAGE_KEY = 'soonot:bingo:playerId';

export type Phase =
  | 'connecting'
  | 'no-event'
  | 'need-code'
  | 'setup-wait'
  | 'need-join'
  | 'lobby'
  | 'running'
  | 'ended'
  | 'reveal';

/**
 * The 참여 코드 carried in the URL, if any. Scanning the projector's QR lands on
 * `/{code}`, which passes the join gate automatically. The bare `/b` (or `/`)
 * entry has no code, so those visitors must type it.
 */
function urlCode(): string | null {
  if (typeof window === 'undefined') return null;
  const seg = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (!seg || seg.toLowerCase() === 'b') return null;
  return seg;
}

export interface Candidate {
  number: number;
  nickname: string;
  playerId: string;
}

export interface CellFeedback {
  /** A fill/clear is optimistically applied: a targetId, a raw query, or null (clear). */
  pending?: string | null;
  /** The last server rejection reason for this cell, if any. */
  error?: string;
}

const REASON_KO: Record<string, string> = {
  SELF: '자기 자신은 넣을 수 없어요',
  REUSED: '이미 다른 칸에 넣은 사람이에요',
  NO_SUCH_PERSON: '그런 사람이 없어요',
  CELL_TAKEN: '이미 채워진 칸이에요',
};

const EMPTY_FILLS: readonly (string | null)[] = [];

export interface PlayerApi {
  connected: boolean;
  phase: Phase;
  summary: EventSummary | null;
  me: { playerId: string; number: number | null } | null;
  traits: readonly string[];
  permutation: readonly number[];
  /** Server truth overlaid with optimistic pending fills. */
  fills: readonly (string | null)[];
  completedLines: readonly string[];
  roster: readonly Person[];
  rosterById: ReadonlyMap<string, Person>;
  counts: { playerCount: number; connectedCount: number; bingoCount: number };
  startedAt: number | null;
  endedAt: number | null;
  revealStep: number;
  /** Add to Date.now() to approximate the server clock (spec §7.5). */
  clockOffset: number;
  cells: ReadonlyMap<number, CellFeedback>;
  candidates: { cellIndex: number; list: Candidate[] } | null;
  bingoFlash: string | null;
  error: string | null;
  /** Did this visitor's 참여 코드 (URL or typed) match the event? */
  codeOk: boolean;
  /** Try a typed 참여 코드; returns true (and unlocks the join screen) if it matches. */
  submitCode(code: string): boolean;
  join(nickname: string): Promise<{ ok: boolean; error?: string }>;
  fill(cellIndex: number, query: string): void;
  pick(cellIndex: number, targetId: string): void;
  clear(cellIndex: number): void;
  clearCellError(cellIndex: number): void;
  dismissCandidates(): void;
  /** Fling an emoji onto the projector (Kahoot-style). */
  react(emoji: string): void;
}

export function usePlayer(): PlayerApi {
  const [connected, setConnected] = useState(false);
  const [summary, setSummary] = useState<EventSummary | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [joined, setJoined] = useState(false);
  const [number, setNumber] = useState<number | null>(null);
  const [permutation, setPermutation] = useState<readonly number[]>([]);
  const [traits, setTraits] = useState<readonly string[]>([]);
  const [rosterVersion, setRosterVersion] = useState(0);
  const [cells, setCells] = useState<Map<number, CellFeedback>>(new Map());
  const [candidates, setCandidates] = useState<{ cellIndex: number; list: Candidate[] } | null>(null);
  const [bingoFlash, setBingoFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [typedCodeOk, setTypedCodeOk] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const numberRef = useRef<number | null>(null); // read inside socket handlers
  const nicknameRef = useRef<string>(''); // sent with reactions so the projector can name them
  const rosterRef = useRef<Map<string, Person>>(new Map());
  const bingoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bumpRoster = useCallback(() => setRosterVersion((v) => v + 1), []);
  const setNum = useCallback((n: number | null) => {
    numberRef.current = n;
    setNumber(n);
  }, []);
  const noteServerNow = useCallback((data: unknown) => {
    const at = (data as { serverNow?: unknown } | null)?.serverNow;
    if (typeof at === 'number') setClockOffset(at - Date.now());
  }, []);

  useEffect(() => {
    const socket = io('/b', {
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
    });
    socketRef.current = socket;

    const rejoinIfKnown = () => {
      const stored = playerIdRef.current ?? localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      playerIdRef.current = stored;
      socket.emit('room:rejoin', { playerId: stored }, (ack: { ok?: boolean }) => {
        if (ack?.ok) setJoined(true);
        else {
          localStorage.removeItem(STORAGE_KEY);
          playerIdRef.current = null;
          setJoined(false);
        }
      });
    };

    socket.on('connect', () => {
      setConnected(true);
      rejoinIfKnown();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('event:summary', (s: EventSummary | null) => setSummary(s));

    socket.on('room:state', (msg: { gameId: string; view: PlayerView }) => {
      if (msg.gameId !== 'bingo') return;
      const v = msg.view;
      setView(v);
      setTraits(v.traits);
      for (const r of v.roster) rosterRef.current.set(r.id, makePerson(r));
      bumpRoster();
      if (v.me) {
        setNum(v.me.number);
        nicknameRef.current = v.me.nickname;
        if (v.me.permutation.length > 0) setPermutation(v.me.permutation);
        // The authoritative view has arrived; drop optimistic pending markers
        // (errors, which carry no `pending`, are kept until the next attempt).
        setCells((prev) => {
          if (prev.size === 0) return prev;
          let changed = false;
          const next = new Map(prev);
          for (const [i, fb] of prev) {
            if (fb.pending !== undefined) {
              next.delete(i);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
    });

    socket.on('card:assigned', (d: { permutation: number[]; number: number }) => {
      setPermutation(d.permutation);
      setNum(d.number);
      setJoined(true);
    });
    socket.on('card:restore', (d: { permutation: number[] }) => {
      setPermutation(d.permutation);
      setJoined(true);
    });
    socket.on('traits:dict', (d: { traits: string[] }) => setTraits(d.traits));

    socket.on('roster:snapshot', (d: { players: { n: number; id: string; name: string; conn: boolean }[] }) => {
      const map = new Map<string, Person>();
      for (const p of d.players) map.set(p.id, makePerson(p));
      rosterRef.current = map;
      bumpRoster();
    });
    socket.on(
      'roster:delta',
      (d: {
        added: { n: number; id: string; name: string }[];
        removed: string[];
        changed: { id: string; conn: boolean }[];
      }) => {
        const map = rosterRef.current;
        for (const a of d.added) map.set(a.id, makePerson({ ...a, conn: true }));
        for (const id of d.removed) map.delete(id);
        for (const c of d.changed) {
          const cur = map.get(c.id);
          if (cur) map.set(c.id, { ...cur, conn: c.conn });
        }
        bumpRoster();
      },
    );

    socket.on('cell:result', (d: { cellIndex: number; ok: boolean; reason?: string }) => {
      noteServerNow(d);
      setCells((prev) => {
        const next = new Map(prev);
        if (d.ok) next.delete(d.cellIndex);
        else next.set(d.cellIndex, { error: REASON_KO[d.reason ?? ''] ?? '넣을 수 없어요' });
        return next;
      });
    });
    socket.on('cell:candidates', (d: { cellIndex: number; candidates: Candidate[] }) => {
      setCandidates({ cellIndex: d.cellIndex, list: d.candidates });
      setCells((prev) => {
        if (!prev.has(d.cellIndex)) return prev;
        const next = new Map(prev);
        next.delete(d.cellIndex);
        return next;
      });
    });

    socket.on('bingo:announced', (d: { number: number; nickname: string; lineCount: number; serverNow?: number }) => {
      noteServerNow(d);
      const mine = d.number === numberRef.current;
      setBingoFlash(mine ? `빙고! 🎉 ${d.lineCount}줄 완성!` : `#${d.number} ${d.nickname} 님 빙고!`);
      if (bingoTimer.current) clearTimeout(bingoTimer.current);
      bingoTimer.current = setTimeout(() => setBingoFlash(null), mine ? 3500 : 2200);
    });

    socket.on('error', (err: { message?: string }) => setError(err?.message ?? '문제가 생겼어요'));

    return () => {
      socket.close();
      socketRef.current = null;
      if (bingoTimer.current) clearTimeout(bingoTimer.current);
    };
  }, [bumpRoster, setNum, noteServerNow]);

  const join = useCallback((nickname: string) => {
    return new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const socket = socketRef.current;
      if (!socket) return resolve({ ok: false, error: '연결 중이에요' });
      setError(null);
      socket.emit(
        'room:join',
        { nickname },
        (ack: { ok?: boolean; playerId?: string; error?: { message?: string } }) => {
          if (ack?.ok && ack.playerId) {
            localStorage.setItem(STORAGE_KEY, ack.playerId);
            playerIdRef.current = ack.playerId;
            nicknameRef.current = nickname;
            setJoined(true);
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: ack?.error?.message ?? '입장하지 못했어요' });
          }
        },
      );
    });
  }, []);

  const fill = useCallback((cellIndex: number, query: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    setCandidates((c) => (c?.cellIndex === cellIndex ? null : c));
    setCells((prev) => new Map(prev).set(cellIndex, { pending: query }));
    socket.emit('cell:fill', { cellIndex, query }, (ack: { ok?: boolean; error?: { message?: string } }) => {
      if (ack && ack.ok === false && ack.error) {
        setCells((prev) => new Map(prev).set(cellIndex, { error: ack.error!.message ?? '넣을 수 없어요' }));
      }
    });
  }, []);

  const pick = useCallback((cellIndex: number, targetId: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    setCandidates(null);
    setCells((prev) => new Map(prev).set(cellIndex, { pending: targetId }));
    socket.emit('cell:fillResolved', { cellIndex, targetId }, () => {});
  }, []);

  const clear = useCallback((cellIndex: number) => {
    const socket = socketRef.current;
    if (!socket) return;
    setCells((prev) => new Map(prev).set(cellIndex, { pending: null }));
    socket.emit('cell:clear', { cellIndex }, () => {});
  }, []);

  const clearCellError = useCallback((cellIndex: number) => {
    setCells((prev) => {
      if (!prev.has(cellIndex)) return prev;
      const next = new Map(prev);
      next.delete(cellIndex);
      return next;
    });
  }, []);

  const dismissCandidates = useCallback(() => setCandidates(null), []);

  const react = useCallback((emoji: string) => {
    // Guarantee a label: nickname if we have it, else the player's number — so the
    // projector never shows a nameless emoji (covers a tap before `me` lands).
    const name = nicknameRef.current || (numberRef.current ? `#${numberRef.current}` : '');
    socketRef.current?.emit('react', { emoji, name });
  }, []);

  // 참여 코드 gate: the URL code (from a scanned QR) auto-passes; otherwise the
  // visitor must type the code shown on the projector. Compared case-insensitively.
  const codeOk = useMemo(() => {
    if (typedCodeOk) return true;
    if (!summary) return false;
    const u = urlCode();
    return !!u && u.toLowerCase() === summary.code.toLowerCase();
  }, [typedCodeOk, summary]);

  const submitCode = useCallback(
    (code: string) => {
      if (summary && code.trim().toLowerCase() === summary.code.toLowerCase()) {
        setTypedCodeOk(true);
        return true;
      }
      return false;
    },
    [summary],
  );

  const { roster, rosterById } = useMemo(() => {
    const list = [...rosterRef.current.values()].sort((a, b) => a.n - b.n);
    return { roster: list, rosterById: rosterRef.current };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterVersion]);

  const fills = useMemo<readonly (string | null)[]>(() => {
    const base = view?.me?.fills ?? EMPTY_FILLS;
    if (cells.size === 0) return base;
    const out = base.length ? [...base] : new Array<string | null>(CELLS).fill(null);
    for (const [i, fb] of cells) {
      if (fb.pending === null) out[i] = null;
      else if (fb.pending !== undefined) out[i] = fb.pending;
    }
    return out;
  }, [view, cells]);

  const bingoState = summary?.games.bingo.state;
  const phase = useMemo<Phase>(() => {
    if (!connected) return 'connecting';
    if (joined) {
      const s = view?.state ?? bingoState;
      if (s === 'RUNNING') return 'running';
      if (s === 'ENDED') return 'ended';
      if (s === 'REVEAL') return 'reveal';
      return 'lobby';
    }
    if (!summary) return 'no-event';
    if (!codeOk) return 'need-code';
    if (bingoState === 'SETUP') return 'setup-wait';
    return 'need-join';
  }, [connected, joined, view, summary, bingoState, codeOk]);

  return {
    connected,
    phase,
    summary,
    me: joined && playerIdRef.current ? { playerId: playerIdRef.current, number } : null,
    traits,
    permutation,
    fills,
    completedLines: view?.me?.completedLines ?? [],
    roster,
    rosterById,
    counts: {
      playerCount: view?.playerCount ?? 0,
      connectedCount: view?.connectedCount ?? 0,
      bingoCount: view?.bingoCount ?? 0,
    },
    startedAt: view?.startedAt ?? null,
    endedAt: view?.endedAt ?? null,
    revealStep: view?.revealStep ?? 0,
    clockOffset,
    cells,
    candidates,
    bingoFlash,
    error,
    codeOk,
    submitCode,
    join,
    fill,
    pick,
    clear,
    clearCellError,
    dismissCandidates,
    react,
  };
}
