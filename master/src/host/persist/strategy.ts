/**
 * The two persistence strategies (spec §8.2, §8.3).
 *
 * Declared here at milestone 1 because `GameModule` names them; the SQLite
 * implementations land at milestone 6. Two strategies and not one, deliberately:
 * forcing bingo to event-source would mean storing ~8,100 fill events to rebuild
 * three flat arrays, and forcing yutnori to snapshot would create a second
 * source of truth for 말 positions that can disagree with its log after a crash.
 * The host unifies the plumbing and leaves the policy where it belongs.
 */

/**
 * The database handle the host passes to a strategy. Structural on purpose, so
 * `better-sqlite3` is a milestone-6 dependency rather than a milestone-1 one.
 */
export interface HostDb {
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  exec(sql: string): unknown;
}

export interface SnapshotStrategy<S> {
  readonly kind: 'snapshot';
  write(db: HostDb, eventId: string, state: S): void;
  read(db: HostDb, eventId: string): S | null;
  readonly triggers: {
    /** Always true — a lifecycle change is never debounced. */
    readonly onTransition: true;
    /** Event names that force an immediate flush, e.g. `bingo:announced`. */
    readonly onEmits: readonly string[];
    /** Everything else coalesces into one write per window (bingo §14). */
    readonly debounceMs: number;
  };
}

export interface EventLogStrategy<S, A> {
  readonly kind: 'eventlog';
  append(db: HostDb, eventId: string, action: A, at: number): void;
  /** Undo: drop everything at or after `seq` (yutnori spec §4.4). */
  truncate(db: HostDb, eventId: string, seq: number): void;
  replay(db: HostDb, eventId: string): S | null;
}

export type PersistenceStrategy<S, A> = SnapshotStrategy<S> | EventLogStrategy<S, A>;

/**
 * What `dispatch` calls. The host owns the debounce timer and the write order;
 * a module never touches the database directly.
 */
export interface Persistence {
  enqueue(input: {
    gameId: string;
    state: unknown;
    action: { t: string };
    emits: readonly { ev: string }[];
    at: number;
  }): void;
  flush(): void;
}

/**
 * Milestones 1–2 run against this. It records what it was handed so
 * `dispatch.spec` can assert persist-before-broadcast ordering without a
 * database; milestone 6 replaces it with the SQLite implementation.
 */
export function createNullPersistence(): Persistence & {
  readonly writes: { gameId: string; actionType: string; at: number }[];
} {
  const writes: { gameId: string; actionType: string; at: number }[] = [];
  return {
    writes,
    enqueue({ gameId, action, at }) {
      writes.push({ gameId, actionType: action.t, at });
    },
    flush() {
      /* nothing buffered */
    },
  };
}
