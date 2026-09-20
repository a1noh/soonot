/**
 * The reducer. bingo/spec.md §4.3.
 *
 * Pure: no I/O, no Date.now(), no socket awareness. `now` is an argument, so
 * every rule is testable with a literal state and a literal action.
 */
import { BASE_ALLOWED, EngineError, MAX_REVEAL_STEP, type RoomState } from '@soonot/master';
import { CELLS, MAX_PLAYERS } from '../shared/constants';
import { normalizeNickname } from '../shared/hangul';
import type { Player, Room, Trait } from '../shared/types';
import type { Action, ActionType } from './actions';
import type { BingoEmit } from './emits';
import { newlyCompleted } from './bingo';
import { resolve } from './resolve';
import { makePermutation } from './shuffle';

/**
 * The module's own whitelist. The host unions this with BASE_ALLOWED and
 * enforces the result (master spec §5); every RoomState is listed because the
 * contract wants a total record, not a partial one.
 */
export const ALLOWED: Readonly<Record<RoomState, readonly ActionType[]>> = {
  SETUP: ['SET_TRAITS'],
  LOBBY: ['JOIN', 'REJOIN', 'DISCONNECT'],
  RUNNING: ['JOIN', 'REJOIN', 'DISCONNECT', 'FILL', 'FILL_PICK', 'CLEAR'],
  ENDED: ['REJOIN', 'DISCONNECT'],
  REVEAL: ['REJOIN', 'DISCONNECT'],
};

export function create(eventId: string, now: number): Room {
  return {
    eventId,
    state: 'SETUP',
    traits: [],
    players: new Map(),
    byNumber: new Map(),
    nameIndex: new Map(),
    nextNumber: 1,
    bingoEvents: [],
    seq: 0,
    startedAt: null,
    endedAt: null,
    revealStep: 0,
    createdAt: now,
  };
}

type Out = { state: Room; emits: BingoEmit[] };

function rosterSnapshot(room: Room) {
  return [...room.players.values()].map((p) => ({
    n: p.number,
    id: p.id,
    name: p.nickname,
    conn: p.connected,
  }));
}

/** Replace one player, sharing every other structure. */
function withPlayer(room: Room, p: Player): Room {
  const players = new Map(room.players);
  players.set(p.id, p);
  return { ...room, players };
}

function requirePlayer(room: Room, id: string): Player {
  const p = room.players.get(id);
  if (!p) throw new EngineError('NO_SUCH_PLAYER');
  return p;
}

function checkCell(i: number): void {
  if (!Number.isInteger(i) || i < 0 || i >= CELLS) {
    throw new EngineError('BAD_CELL');
  }
}

/**
 * Commit a resolved fill. Shared by FILL and FILL_PICK so the validation in
 * req §7.2 exists exactly once — FILL_PICK re-validates because the candidate
 * list the client holds may be stale and a client id is never trusted.
 */
function commitFill(
  room: Room,
  actor: Player,
  cellIndex: number,
  targetId: string,
  now: number,
): Out {
  if (targetId === actor.id) {
    return {
      state: room,
      emits: [
        { to: 'player', playerId: actor.id, ev: 'cell:result', data: { cellIndex, ok: false, reason: 'SELF' } },
      ],
    };
  }
  if (actor.usedPlayerIds.has(targetId)) {
    return {
      state: room,
      emits: [
        { to: 'player', playerId: actor.id, ev: 'cell:result', data: { cellIndex, ok: false, reason: 'REUSED' } },
      ],
    };
  }
  const target = room.players.get(targetId);
  if (!target) {
    return {
      state: room,
      emits: [
        { to: 'player', playerId: actor.id, ev: 'cell:result', data: { cellIndex, ok: false, reason: 'NO_SUCH_PERSON' } },
      ],
    };
  }

  const fills = [...actor.fills];
  const filledAt = [...actor.filledAt];
  fills[cellIndex] = targetId;
  filledAt[cellIndex] = now;
  const usedPlayerIds = new Set(actor.usedPlayerIds);
  usedPlayerIds.add(targetId);

  let next: Player = { ...actor, fills, filledAt, usedPlayerIds };

  const emits: BingoEmit[] = [
    {
      to: 'player',
      playerId: actor.id,
      ev: 'cell:result',
      data: { cellIndex, ok: true, target: { number: target.number, nickname: target.nickname } },
    },
  ];

  const fresh = newlyCompleted(next, cellIndex);
  let seq = room.seq;
  const events = [...room.bingoEvents];

  for (const lineId of fresh) {
    const completedLines = [...next.completedLines, lineId];
    seq += 1;
    next = {
      ...next,
      completedLines,
      firstBingoAt: next.firstBingoAt ?? now,
      firstBingoSeq: next.firstBingoSeq ?? seq,
    };
    events.push({
      playerId: next.id,
      lineId,
      at: now,
      seq,
      lineCount: completedLines.length,
    });
    emits.push({
      to: 'room',
      ev: 'bingo:announced',
      data: { number: next.number, nickname: next.nickname, lineCount: completedLines.length, at: now },
    });
  }

  const state: Room = { ...withPlayer(room, next), seq, bingoEvents: events };
  return { state, emits };
}

/**
 * effective = BASE_ALLOWED[state] ∪ ALLOWED[state].
 *
 * The host enforces this too (master spec §6.1) — it is repeated here only so
 * the engine is total on its own and testable without a host.
 */
function allowedHere(state: RoomState, t: ActionType): boolean {
  return BASE_ALLOWED[state].includes(t) || ALLOWED[state].includes(t);
}

export function apply(room: Room, action: Action, now: number): Out {
  if (!allowedHere(room.state, action.t)) {
    throw new EngineError('NOT_ALLOWED_IN_STATE');
  }

  switch (action.t) {
    case 'SET_TRAITS': {
      if (action.texts.length !== CELLS) throw new EngineError('NEED_81_TRAITS');
      const traits: Trait[] = action.texts.map((text, id) => ({
        id,
        text,
        category: 'custom',
        custom: true,
      }));
      return { state: { ...room, traits, state: 'LOBBY' }, emits: [] };
    }

    case 'JOIN': {
      if (room.players.has(action.playerId)) throw new EngineError('ALREADY_JOINED');
      if (room.players.size >= MAX_PLAYERS) throw new EngineError('ROOM_FULL');

      const nickname = action.nickname.trim();
      if (nickname.length === 0) throw new EngineError('EMPTY_NICKNAME');
      const nicknameKey = normalizeNickname(nickname);

      const number = room.nextNumber;
      const player: Player = {
        id: action.playerId,
        number,
        nickname,
        nicknameKey,
        joinedAt: now,
        lateJoin: room.state === 'RUNNING',
        connected: true,
        // Lazy assignment (req §6): a card only exists once the game is running.
        permutation: room.state === 'RUNNING' ? makePermutation(room.eventId, action.playerId) : [],
        fills: new Array<string | null>(CELLS).fill(null),
        filledAt: new Array<number | null>(CELLS).fill(null),
        usedPlayerIds: new Set(),
        firstBingoAt: null,
        firstBingoSeq: null,
        completedLines: [],
      };

      const players = new Map(room.players).set(player.id, player);
      const byNumber = new Map(room.byNumber).set(number, player.id);
      const nameIndex = new Map(room.nameIndex);
      nameIndex.set(nicknameKey, [...(nameIndex.get(nicknameKey) ?? []), player.id]);

      const state: Room = { ...room, players, byNumber, nameIndex, nextNumber: number + 1 };
      const emits: BingoEmit[] = [
        { to: 'player', playerId: player.id, ev: 'traits:dict', data: { traits: room.traits.map((t) => t.text) } },
        { to: 'player', playerId: player.id, ev: 'roster:snapshot', data: { players: rosterSnapshot(state) } },
        { to: 'room', ev: 'roster:delta', data: { added: [{ n: number, id: player.id, name: player.nickname }], removed: [], changed: [] } },
      ];
      if (room.state === 'RUNNING') {
        emits.push({ to: 'player', playerId: player.id, ev: 'card:assigned', data: { permutation: player.permutation, number } });
      }
      return { state, emits };
    }

    case 'REJOIN': {
      const p = requirePlayer(room, action.playerId);
      const next = { ...p, connected: true };
      const state = withPlayer(room, next);
      return {
        state,
        emits: [
          { to: 'player', playerId: p.id, ev: 'traits:dict', data: { traits: room.traits.map((t) => t.text) } },
          { to: 'player', playerId: p.id, ev: 'roster:snapshot', data: { players: rosterSnapshot(state) } },
          { to: 'player', playerId: p.id, ev: 'card:restore', data: { permutation: next.permutation, fills: next.fills, filledAt: next.filledAt, completedLines: next.completedLines } },
          { to: 'room', ev: 'roster:delta', data: { added: [], removed: [], changed: [{ id: p.id, conn: true }] } },
        ],
      };
    }

    case 'DISCONNECT': {
      const p = requirePlayer(room, action.playerId);
      // Never delete: their fills stand and they stay nameable (req §7.4).
      return {
        state: withPlayer(room, { ...p, connected: false }),
        emits: [{ to: 'room', ev: 'roster:delta', data: { added: [], removed: [], changed: [{ id: p.id, conn: false }] } }],
      };
    }

    case 'START': {
      if (room.traits.length !== CELLS) throw new EngineError('NEED_81_TRAITS');
      if (room.players.size < 2) throw new EngineError('NEED_2_PLAYERS');

      const players = new Map<string, Player>();
      const emits: BingoEmit[] = [];
      for (const [id, p] of room.players) {
        const permutation = makePermutation(room.eventId, id);
        players.set(id, { ...p, permutation });
        emits.push({ to: 'player', playerId: id, ev: 'card:assigned', data: { permutation, number: p.number } });
      }
      return { state: { ...room, players, state: 'RUNNING', startedAt: now }, emits };
    }

    case 'FILL': {
      checkCell(action.cellIndex);
      const actor = requirePlayer(room, action.playerId);
      if (actor.fills[action.cellIndex] !== null) {
        return {
          state: room,
          emits: [{ to: 'player', playerId: actor.id, ev: 'cell:result', data: { cellIndex: action.cellIndex, ok: false, reason: 'CELL_TAKEN' } }],
        };
      }

      const r = resolve(room, action.query);
      if (r.k === 'miss') {
        return {
          state: room,
          emits: [{ to: 'player', playerId: actor.id, ev: 'cell:result', data: { cellIndex: action.cellIndex, ok: false, reason: 'NO_SUCH_PERSON' } }],
        };
      }
      if (r.k === 'ambiguous') {
        // State unchanged — no cell is reserved while the picker is open, so
        // two cells can be in flight at once without interacting.
        return {
          state: room,
          emits: [
            {
              to: 'player',
              playerId: actor.id,
              ev: 'cell:candidates',
              data: {
                cellIndex: action.cellIndex,
                candidates: r.playerIds.map((id) => {
                  const c = room.players.get(id)!;
                  return { number: c.number, nickname: c.nickname, playerId: c.id };
                }),
              },
            },
          ],
        };
      }
      return commitFill(room, actor, action.cellIndex, r.playerId, now);
    }

    case 'FILL_PICK': {
      checkCell(action.cellIndex);
      const actor = requirePlayer(room, action.playerId);
      if (actor.fills[action.cellIndex] !== null) {
        return {
          state: room,
          emits: [{ to: 'player', playerId: actor.id, ev: 'cell:result', data: { cellIndex: action.cellIndex, ok: false, reason: 'CELL_TAKEN' } }],
        };
      }
      return commitFill(room, actor, action.cellIndex, action.targetId, now);
    }

    case 'CLEAR': {
      checkCell(action.cellIndex);
      const actor = requirePlayer(room, action.playerId);
      const was = actor.fills[action.cellIndex];
      // `== null` covers the undefined that noUncheckedIndexedAccess admits;
      // checkCell() already bounded the index, so this is a type hole, not a
      // reachable state.
      if (was == null) return { state: room, emits: [] };

      const fills = [...actor.fills];
      const filledAt = [...actor.filledAt];
      fills[action.cellIndex] = null;
      filledAt[action.cellIndex] = null;
      const usedPlayerIds = new Set(actor.usedPlayerIds);
      usedPlayerIds.delete(was);

      // A bingo, once earned, is permanent (req §7.3) — completedLines,
      // firstBingoAt and firstBingoSeq are deliberately untouched.
      return {
        state: withPlayer(room, { ...actor, fills, filledAt, usedPlayerIds }),
        emits: [{ to: 'player', playerId: actor.id, ev: 'cell:result', data: { cellIndex: action.cellIndex, ok: true } }],
      };
    }

    case 'END':
      return { state: { ...room, state: 'ENDED', endedAt: now }, emits: [] };

    case 'REVEAL': {
      // The same protocol 윷놀이 uses: entering the reveal is step 0, and every
      // step after that advances by exactly one. One shared podium driver
      // (master spec §3.4) cannot serve two games that disagree here.
      if (room.state === 'ENDED') {
        if (action.step !== 0) throw new EngineError('BAD_REVEAL_STEP');
        return { state: { ...room, state: 'REVEAL', revealStep: 0 }, emits: [] };
      }
      if (action.step !== room.revealStep + 1 || action.step > MAX_REVEAL_STEP) {
        throw new EngineError('BAD_REVEAL_STEP');
      }
      return { state: { ...room, revealStep: action.step }, emits: [] };
    }
  }
}
