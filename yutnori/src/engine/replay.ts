import { WAITING } from '../shared/constants';
import type { Room, RoomSetup, TurnEvent } from '../shared/types';
import { apply } from './apply';

/**
 * spec §4.4 — everything no `TurnEvent` can determine. Deliberately includes the clock
 * and lifecycle fields: they are not derivable from the event log, and pretending
 * otherwise is how a "total" replay quietly loses a paused timer.
 */
export function setupOf(room: Room): RoomSetup {
  return {
    id: room.id,
    eventId: room.eventId,
    state: room.state,
    malPerTeam: room.malPerTeam,
    teams: room.teams.map((t) => ({
      id: t.id,
      name: t.name,
      roster: t.roster,
      color: t.color,
      malIds: t.mal.map((m) => m.id),
    })),
    timeLimitMs: room.timeLimitMs,
    startedAt: room.startedAt,
    pausedAt: room.pausedAt,
    totalPausedMs: room.totalPausedMs,
    endedAt: room.endedAt,
    endReason: room.endReason,
    revealStep: room.revealStep,
    createdAt: room.createdAt,
  };
}

/** A room at the moment `START` was applied: every 말 in 대기, team 1 owed one throw. */
function freshRunning(setup: RoomSetup): Room {
  const t0 = setup.startedAt ?? setup.createdAt;
  return {
    id: setup.id,
    eventId: setup.eventId,
    state: 'RUNNING',
    teams: setup.teams.map((t) => ({
      id: t.id,
      name: t.name,
      roster: t.roster,
      color: t.color,
      mal: t.malIds.map((id) => ({ id, progress: WAITING })),
      finishedAt: null,
      lastProgressAt: t0,
    })),
    malPerTeam: setup.malPerTeam,
    turnIndex: 0,
    throwQueue: 1,
    pendingThrow: null,
    history: [],
    timeLimitMs: setup.timeLimitMs,
    startedAt: setup.startedAt,
    pausedAt: null,
    totalPausedMs: 0,
    endedAt: null,
    endReason: null,
    revealStep: 0,
    createdAt: setup.createdAt,
  };
}

/**
 * spec §4.4, §8.3 — rebuild a room by re-running its decisions through `apply`.
 *
 * The event log stores *decisions* (which roll, which 말); positions, captures and
 * bonuses are recomputed by the same reducer that produced them, so there is exactly
 * one implementation of the rules. Undo and crash recovery are this one function.
 *
 * Replay is deterministic because every event carries its own `at`, which is fed back
 * in as `now` rather than reading the current clock.
 */
export function replay(setup: RoomSetup, events: readonly TurnEvent[]): Room {
  let room = freshRunning(setup);

  for (const ev of events) {
    room = apply(room, { t: 'THROW', roll: ev.roll }, ev.at).state;
    // A single-candidate throw is auto-applied by THROW itself (req §8.1).
    if (room.pendingThrow !== null) {
      room = apply(room, { t: 'MOVE', malId: ev.malId }, ev.at).state;
    }
  }

  // Lifecycle and clock are carried over, not re-derived (see `setupOf`).
  return {
    ...room,
    state: setup.state === 'LOBBY' || setup.state === 'SETUP' ? room.state : setup.state,
    timeLimitMs: setup.timeLimitMs,
    startedAt: setup.startedAt,
    pausedAt: setup.pausedAt,
    totalPausedMs: setup.totalPausedMs,
    endedAt: setup.endedAt,
    endReason: setup.endReason,
    revealStep: setup.revealStep,
  };
}
