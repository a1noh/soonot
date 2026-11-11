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

  const claimed = new Set<string>();
  room.claims.forEach((c, i) => {
    if (!stoneIds.has(c.stoneId)) fail(`claim for unknown stone ${c.stoneId}`);
    if (claimed.has(c.stoneId)) fail(`stone ${c.stoneId} played for twice`);
    claimed.add(c.stoneId);
    // Pick N always opens game N: the order is fixed, whatever stone was tapped.
    if (room.games[i]?.id !== c.gameId) fail(`claim ${i} opened ${c.gameId}, expected ${room.games[i]?.id}`);
    for (const w of c.winners) if (!teamIds.has(w)) fail(`winner ${w} is not a team`);
    if (new Set(c.winners).size !== c.winners.length) fail('a team won the same stone twice');
  });
  if (room.claims.length > Math.min(room.stones.length, room.games.length)) fail('more claims than stones or games');

  if (room.state === 'RUNNING') {
    const turn = room.teams.find((t) => t.id === room.turnTeamId);
    if (!turn) fail('turn points at no team');
    if (!turn!.playing) fail(`turn points at ${turn!.id}, which is not playing`);
    if (room.round < 1) fail('round < 1 while running');
  }
  if (room.pending) {
    if (room.state !== 'RUNNING') fail('pick pending outside RUNNING');
    if (room.pending.chooserId !== room.turnTeamId) fail('pending pick is not the current chooser');
    if (claimed.has(room.pending.stoneId)) fail('pending pick on a played stone');
    if (room.games[room.claims.length]?.id !== room.pending.gameId) fail('pending pick opened the wrong game');
  }
  // 결정전: decided groups never overlap, and each is still level on stones.
  const inGroup = new Set<string>();
  const count = (id: string) => room.claims.filter((c) => c.winners.includes(id)).length;
  for (const g of room.tiebreaks) {
    if (g.length < 2) fail('a 결정전 group with fewer than two teams');
    for (const id of g) {
      if (inGroup.has(id)) fail(`team ${id} is in two 결정전 groups`);
      inGroup.add(id);
      if (!teamIds.has(id)) fail(`결정전 team ${id} is not a team`);
    }
    if (new Set(g.map(count)).size !== 1) fail('a 결정전 group is not level on stones');
  }
  if (room.activeTiebreak !== null) {
    if (room.state !== 'ENDED') fail('결정전 open outside ENDED');
    for (const id of room.activeTiebreak) if (inGroup.has(id)) fail(`team ${id} is in an open and a decided 결정전`);
  }
  if (room.tiebreaks.length > 0 && room.state === 'RUNNING') fail('결정전 results kept while running');

  const claimsInHistory = room.history.filter((h) => h.kind === 'claim').length;
  if (claimsInHistory !== room.claims.length) fail(`history has ${claimsInHistory} claims but ${room.claims.length} exist`);
}
