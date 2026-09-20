import { HOME, WAITING } from '../shared/constants';
import type { Room } from '../shared/types';

export class InvariantError extends Error {
  constructor(message: string) {
    super(`invariant violated: ${message}`);
    this.name = 'InvariantError';
  }
}

/** spec §4.5 — called after every `apply` in dev and in every test. */
export function assertInvariants(room: Room): void {
  const fail = (m: string) => {
    throw new InvariantError(m);
  };

  const names = new Set<string>();
  for (const team of room.teams) {
    if (names.has(team.name)) fail(`duplicate team name ${team.name}`);
    names.add(team.name);

    if (team.mal.length !== room.malPerTeam) {
      fail(`team ${team.id} has ${team.mal.length} 말, expected ${room.malPerTeam}`);
    }
    for (const m of team.mal) {
      if (!Number.isInteger(m.progress) || m.progress < WAITING || m.progress > HOME) {
        fail(`말 ${m.id} progress ${m.progress} outside 0..${HOME}`);
      }
    }
    const allHome = team.mal.every((m) => m.progress >= HOME);
    if (allHome && team.finishedAt === null) fail(`team ${team.id} is all home but has no finishedAt`);
    if (!allHome && team.finishedAt !== null) fail(`team ${team.id} has finishedAt but 말 on the board`);
  }

  if (room.throwQueue < 0) fail(`negative throwQueue ${room.throwQueue}`);

  if (room.pendingThrow !== null && room.state !== 'RUNNING') {
    fail(`pendingThrow while ${room.state}`);
  }

  if (room.state === 'RUNNING' && room.teams.length > 0) {
    const everyoneDone = room.teams.every((t) => t.finishedAt !== null);
    if (!everyoneDone) {
      const current = room.teams[room.turnIndex];
      if (!current) fail(`turnIndex ${room.turnIndex} out of range`);
      else if (current.mal.every((m) => m.progress >= HOME)) {
        fail(`turnIndex points at finished team ${current.id}`);
      }
    }
  }

  room.history.forEach((ev, i) => {
    if (ev.seq !== i + 1) fail(`history seq ${ev.seq} at index ${i}, expected ${i + 1}`);
    const prev = room.history[i - 1];
    if (prev && ev.at < prev.at) fail(`history timestamps not monotonic at seq ${ev.seq}`);
  });
}
