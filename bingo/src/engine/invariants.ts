/**
 * Called after every apply() in dev and in every test. bingo/spec.md §4.6.
 *
 * The usedPlayerIds check is the one that catches real bugs: the set and the
 * fills array are two representations of the same fact, and CLEAR has to
 * update both.
 */
import type { Room } from '../shared/types';
import { CELLS, MAX_PLAYERS } from '../shared/constants';
import { lineById } from '../shared/lines';

class InvariantError extends Error {
  constructor(msg: string) {
    super(`invariant: ${msg}`);
    this.name = 'InvariantError';
  }
}

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new InvariantError(msg);
}

export function assertInvariants(room: Room): void {
  const carded = room.state === 'RUNNING' || room.state === 'ENDED' || room.state === 'REVEAL';

  must(room.byNumber.size === room.players.size, 'byNumber.size === players.size');
  must(room.nextNumber >= 1, 'nextNumber >= 1');

  const seenNumbers = new Set<number>();
  let indexed = 0;
  for (const ids of room.nameIndex.values()) indexed += ids.length;
  must(indexed === room.players.size, 'nameIndex partitions the player set');

  for (const [id, p] of room.players) {
    must(p.id === id, `player key matches id (${id})`);
    must(p.number >= 1 && p.number <= MAX_PLAYERS, `number in range (${p.number})`);
    must(!seenNumbers.has(p.number), `number unique (${p.number})`);
    seenNumbers.add(p.number);
    must(room.byNumber.get(p.number) === id, `byNumber maps ${p.number} -> ${id}`);
    must(
      (room.nameIndex.get(p.nicknameKey) ?? []).includes(id),
      `nameIndex contains ${id}`,
    );

    must(p.fills.length === CELLS, 'fills length 81');
    must(p.filledAt.length === CELLS, 'filledAt length 81');

    // Cards are assigned lazily at START (req §6), so before RUNNING the
    // permutation is legitimately empty.
    if (carded) {
      must(p.permutation.length === CELLS, 'permutation length 81');
      const seenTrait = new Set(p.permutation);
      must(seenTrait.size === CELLS, 'permutation has no duplicates');
      for (const t of p.permutation) {
        must(Number.isInteger(t) && t >= 0 && t < CELLS, `traitId in range (${t})`);
      }
    } else {
      must(p.permutation.length === 0, 'no card before RUNNING');
    }

    const used = new Set<string>();
    for (let i = 0; i < CELLS; i++) {
      const f = p.fills[i]!;
      const at = p.filledAt[i]!;
      must((f === null) === (at === null), `fills[${i}] and filledAt[${i}] agree`);
      if (f === null) continue;
      must(f !== p.id, `player ${id} did not name themselves`);
      must(room.players.has(f), `fills[${i}] references a live player`);
      must(!used.has(f), `no duplicate person on card ${id} (${f})`);
      used.add(f);
    }
    must(used.size === p.usedPlayerIds.size, `usedPlayerIds size matches fills (${id})`);
    for (const u of used) must(p.usedPlayerIds.has(u), `usedPlayerIds has ${u}`);

    must(
      (p.firstBingoAt !== null) === (p.completedLines.length > 0),
      `firstBingoAt iff completedLines (${id})`,
    );
    must(
      (p.firstBingoAt === null) === (p.firstBingoSeq === null),
      `firstBingoAt and firstBingoSeq agree (${id})`,
    );
    for (const l of p.completedLines) must(lineById(l), `known line id ${l}`);
    must(
      new Set(p.completedLines).size === p.completedLines.length,
      `completedLines has no duplicates (${id})`,
    );
  }

  let prevSeq = -1;
  let prevAt = -1;
  for (const e of room.bingoEvents) {
    must(e.seq > prevSeq, 'bingoEvents seq strictly increasing');
    must(e.at >= prevAt, 'bingoEvents at monotonic');
    must(room.players.has(e.playerId), 'bingo event references a live player');
    prevSeq = e.seq;
    prevAt = e.at;
  }
  must(room.seq >= room.bingoEvents.length, 'seq counted every event');

  if (room.state !== 'SETUP') {
    must(room.traits.length === CELLS, 'exactly 81 traits once past SETUP');
  }
}
