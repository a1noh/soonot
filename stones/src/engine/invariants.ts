import type { Room } from '../shared/types';

export class InvariantError extends Error {
  constructor(message: string) {
    super(`invariant violated: ${message}`);
    this.name = 'InvariantError';
  }
}

/** Called after every `apply` in dev and in every test. */
export function assertInvariants(room: Room): void {
  const fail = (m: string): never => {
    throw new InvariantError(m);
  };
  const teamIds = new Set(room.teams.map((t) => t.id));
  const stoneIds = new Set(room.stones.map((s) => s.id));
  if (new Set(room.teams.map((t) => t.name)).size !== room.teams.length) fail('duplicate team name');

  const seen = new Set<string>();
  for (const w of room.wins) {
    if (!teamIds.has(w.teamId)) fail(`win for unknown team ${w.teamId}`);
    if (!stoneIds.has(w.stoneId)) fail(`win for unknown stone ${w.stoneId}`);
    const key = `${w.teamId}:${w.stoneId}`;
    if (seen.has(key)) fail(`team ${w.teamId} holds ${w.stoneId} twice`);
    seen.add(key);
  }

  if (room.state === 'RUNNING') {
    const turn = room.teams.find((t) => t.id === room.turnTeamId);
    if (!turn) fail('turn points at no team');
    if (!turn!.playing) fail(`turn points at ${turn!.id}, which is not playing`);
    if (room.round < 1) fail('round < 1 while running');
  }
  if (room.pending) {
    if (room.state !== 'RUNNING') fail('pick pending outside RUNNING');
    if (room.pending.teamId !== room.turnTeamId) fail('pending pick is not the current team');
    if (seen.has(`${room.pending.teamId}:${room.pending.stoneId}`)) fail('pending pick on a held stone');
  }
  const successes = room.history.filter((h) => h.kind === 'resolve' && h.success).length;
  if (successes !== room.wins.length) fail(`history has ${successes} successes but ${room.wins.length} wins`);
}
