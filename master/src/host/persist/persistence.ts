/**
 * The write-behind layer `dispatch` calls (spec §8).
 *
 * The host owns the debounce timer and the write order; a module never touches
 * the database directly. Which strategy runs is the module's choice — snapshot
 * for bingo, event log for yutnori — and the difference is confined to
 * `flushGame` below.
 */
import type { GameId } from '../../shared/lifecycle.js';
import type { AnyGameModule } from '../module.js';
import type { EventRecord } from '../../event/event.js';
import type { HostDb, Persistence } from './strategy.js';
import { writeEventRow } from './recover.js';

export interface EventRow {
  id: string;
  code: string;
  title: string;
  projector: string;
  bingo_enabled: number;
  yut_enabled: number;
  created_at: number;
  closed_at: number | null;
}

export interface SqlitePersistenceDeps {
  db: HostDb;
  modules: Readonly<Record<GameId, AnyGameModule>>;
  /**
   * The event the writes belong to; null before one is opened.
   *
   * The whole record, not just an id: the `events` row is re-upserted on every
   * flush, so the title, the projector setting and the enable flags persist
   * without threading the database through the socket handlers that change
   * them. It is one cheap upsert at most once per debounce window.
   */
  event(): EventRecord | null;
  now(): number;
  /** Injected so tests can drive the debounce without real timers. */
  schedule?(fn: () => void, ms: number): { cancel(): void };
}

function realSchedule(fn: () => void, ms: number) {
  const t = setTimeout(fn, ms);
  if (typeof t === 'object' && 'unref' in t) t.unref();
  return { cancel: () => clearTimeout(t) };
}

export function createSqlitePersistence(deps: SqlitePersistenceDeps): Persistence & {
  /** Test seam: how many times each game has actually hit the disk. */
  readonly writes: Record<string, number>;
} {
  const { db, modules, event } = deps;
  const schedule = deps.schedule ?? realSchedule;

  const dirty = new Map<GameId, unknown>();
  const timers = new Map<GameId, { cancel(): void }>();
  /** Last persisted lifecycle per game, so a transition is never debounced. */
  const lastLifecycle = new Map<GameId, string>();
  const writes: Record<string, number> = {};
  let disposed = false;

  function flushGame(gameId: GameId, state: unknown): void {
    if (disposed) return;
    const current = event();
    if (current === null) return;
    writeEventRow(db, current);
    const id = current.id;
    const strategy = modules[gameId].persistence;
    if (strategy.kind === 'snapshot') strategy.write(db, id, state);
    else strategy.writeState(db, id, state);
    writes[gameId] = (writes[gameId] ?? 0) + 1;
  }

  function flushNow(gameId: GameId): void {
    timers.get(gameId)?.cancel();
    timers.delete(gameId);
    const state = dirty.get(gameId);
    if (state === undefined) return;
    dirty.delete(gameId);
    flushGame(gameId, state);
  }

  return {
    writes,

    closeEvent(event) {
      if (disposed) return;
      writeEventRow(db, event as EventRecord);
    },

    enqueue({ gameId, state, emits }) {
      const id = gameId as GameId;
      const strategy = modules[id].persistence;
      dirty.set(id, state);

      // A lifecycle change is never debounced (`triggers.onTransition`): it is
      // the one write whose loss would leave a restarted host in the wrong
      // state entirely, not merely a second behind.
      const lifecycle = modules[id].lifecycle(state);
      const moved = lastLifecycle.get(id) !== lifecycle;
      lastLifecycle.set(id, lifecycle);

      if (strategy.kind === 'eventlog') {
        // Append-only and cheap, so never debounced — which also means an
        // undo's truncation can never race a pending append.
        flushNow(id);
        return;
      }

      // Or an emit the strategy named — for bingo, a 빙고, because the podium
      // is computed from those events.
      const urgent = moved || emits.some((e) => strategy.triggers.onEmits.includes(e.ev));
      if (urgent) {
        flushNow(id);
        return;
      }
      if (!timers.has(id)) {
        timers.set(
          id,
          schedule(() => flushNow(id), strategy.triggers.debounceMs),
        );
      }
    },

    flush() {
      for (const gameId of [...dirty.keys()]) flushNow(gameId);
    },

    /**
     * Shutdown. Flush first, then cancel every timer — including ones whose
     * game had already been flushed, which would otherwise fire against a
     * closed database.
     */
    dispose() {
      for (const gameId of [...dirty.keys()]) flushNow(gameId);
      for (const timer of timers.values()) timer.cancel();
      timers.clear();
      disposed = true;
    },
  };
}
