import { HOME, BONUS_ROLLS, MIN_TEAMS, MS_PER_MIN, MAX_REVEAL_STEP, TEAM_COLORS, DEFAULT_TIME_LIMIT_MIN, WAITING, isMiniGameStation } from '../shared/constants';
import type { EndReason, MoveCandidate, Roll, Room, RoomState, Team, TurnEvent } from '../shared/types';
import { EngineError, type Action, type Emit } from './actions';
import { candidates } from './candidates';
import { replay, setupOf } from './replay';
import { MINI_GAMES } from '../shared/minigames';

/** spec §4.3 — the req §4 transition table, as data rather than scattered `if`s. */
const ALLOWED: Record<RoomState, Action['t'][]> = {
  SETUP:   ['SETUP'],
  LOBBY:   ['START'],
  RUNNING: ['THROW', 'MOVE', 'UNDO', 'PAUSE', 'RESUME', 'EXTEND', 'END', 'TICK', 'MINIGAME_SPIN', 'MINIGAME_RESOLVE'],
  ENDED:   ['RESUME_FROM_ENDED', 'REVEAL'],
  REVEAL:  ['REVEAL'],
};

export function newRoom(p: { id: string; eventId: string; createdAt: number }): Room {
  return {
    id: p.id,
    eventId: p.eventId,
    state: 'SETUP',
    teams: [],
    malPerTeam: 2,
    miniGames: false,
    miniGameSet: MINI_GAMES,
    turnIndex: 0,
    throwQueue: 0,
    pendingThrow: null,
    pendingMiniGame: null,
    history: [],
    timeLimitMs: DEFAULT_TIME_LIMIT_MIN * MS_PER_MIN,
    startedAt: null,
    pausedAt: null,
    totalPausedMs: 0,
    endedAt: null,
    endReason: null,
    revealStep: 0,
    createdAt: p.createdAt,
  };
}

/** req §10 — server-authoritative, and pure: `now` is an argument, never a read. */
export function remainingMs(room: Room, now: number): number {
  if (room.startedAt === null) return room.timeLimitMs;
  const at = room.pausedAt ?? now;
  const elapsed = at - room.startedAt - room.totalPausedMs;
  return Math.max(0, room.timeLimitMs - elapsed);
}

/**
 * True while the current team is part-way through its turn — a throw is entered and
 * unresolved, or the team has already moved this turn and holds a bonus throw.
 *
 * Derived, not stored: a turn always begins with `throwQueue === 1`, so "throws owed"
 * alone can never distinguish a fresh turn from a bonus chain. This is what req §10's
 * deferred `timeup` actually hinges on, and what the board renders as `마지막 차례`.
 */
export function isMidTurn(room: Room): boolean {
  if (room.pendingThrow !== null) return true;
  if (room.pendingMiniGame !== null) return true;
  const last = room.history[room.history.length - 1];
  const current = room.teams[room.turnIndex];
  return !!last && !!current && last.teamId === current.id;
}

const boardMal = (r: Room) =>
  r.teams.flatMap((t) => t.mal.map((m) => ({ teamId: t.id, malId: m.id, progress: m.progress })));

const isFinished = (t: Team) => t.mal.every((m) => m.progress === HOME);

function nextTeamIndex(r: Room, from: number): number {
  for (let k = 1; k <= r.teams.length; k++) {
    const i = (from + k) % r.teams.length;
    if (!isFinished(r.teams[i]!)) return i;
  }
  return from;
}

function endGame(r: Room, reason: EndReason, now: number): Emit[] {
  r.state = 'ENDED';
  r.endedAt = now;
  r.endReason = reason;
  r.pendingThrow = null;
  return [{ e: 'game:ended', endedAt: now, reason }];
}

/** req §8.2, §8.3 — apply a candidate, resolve captures, grant bonuses, advance the turn. */
function commitMove(r: Room, roll: Roll, cand: MoveCandidate, now: number): Emit[] {
  const events: Emit[] = [];
  const team = r.teams[r.turnIndex]!;
  const mal = team.mal.find((m) => m.id === cand.malId)!;

  mal.progress = cand.to;

  const captures: TurnEvent['captures'] = [];
  const perVictimTeam = new Map<string, number>();
  for (const victimId of cand.captures) {
    for (const t of r.teams) {
      if (t.id === team.id) continue;
      const v = t.mal.find((m) => m.id === victimId);
      if (!v) continue;
      captures.push({ malId: v.id, teamId: t.id, from: v.progress });
      v.progress = WAITING;
      perVictimTeam.set(t.id, (perVictimTeam.get(t.id) ?? 0) + 1);
    }
  }

  // req §8.2 — one bonus for the catch no matter how many 말 were sent home.
  const bonus = (BONUS_ROLLS.includes(roll) ? 1 : 0) + (captures.length > 0 ? 1 : 0);
  r.throwQueue += bonus;

  team.lastProgressAt = now;

  let finishedTeam = false;
  if (isFinished(team) && team.finishedAt === null) {
    team.finishedAt = now;
    finishedTeam = true;
  }

  const ev: TurnEvent = {
    seq: r.history.length + 1,
    teamId: team.id,
    roll,
    malId: mal.id,
    from: cand.from,
    to: cand.to,
    captures,
    bonusGranted: bonus,
    finishedTeam,
    at: now,
  };
  r.history.push(ev);
  r.pendingThrow = null;

  for (const [victimTeam, count] of perVictimTeam) {
    events.push({ e: 'capture:announced', byTeam: team.id, victimTeam, station: cand.to, count });
  }
  events.push({ e: 'board:update', mal: boardMal(r), lastMove: ev });
  if (finishedTeam) {
    events.push({
      e: 'team:finished',
      teamId: team.id,
      teamName: team.name,
      at: now,
      rankAmongFinishers: r.teams.filter((t) => t.finishedAt !== null).length,
    });
  }

  // 미니게임 칸: freeze the turn until the master judges the challenge. The bonus
  // (if any) is already on the queue and will be honoured on success, forfeited on
  // fail. A finishing move never triggers one (`to` is 집, not a station).
  if (r.miniGames && isMiniGameStation(cand.to) && cand.to > WAITING && cand.to < HOME && !finishedTeam) {
    r.pendingMiniGame = { teamId: team.id, malId: mal.id, station: cand.to, gameId: null };
    events.push({ e: 'minigame:triggered', teamId: team.id, teamName: team.name, station: cand.to });
    return events;
  }

  events.push(...advanceAfterMove(r, now));
  return events;
}

/** The tail of a completed move: honour bonuses, pass the turn, or end the game. */
function advanceAfterMove(r: Room, now: number): Emit[] {
  const events: Emit[] = [];
  const team = r.teams[r.turnIndex]!;
  // A team with nothing left to move cannot spend a bonus throw. The turn ends.
  if (isFinished(team)) r.throwQueue = 0;

  if (r.teams.every((t) => t.finishedAt !== null)) {
    events.push(...endGame(r, 'allFinished', now));
  } else if (r.throwQueue === 0) {
    r.turnIndex = nextTeamIndex(r, r.turnIndex);
    r.throwQueue = 1;
    const next = r.teams[r.turnIndex]!;
    events.push({ e: 'turn:changed', teamId: next.id, teamName: next.name });
  }

  return events;
}

/** Undo a move's board effects from its recorded `TurnEvent` — the fail path. */
function revertMove(r: Room, ev: TurnEvent): void {
  const team = r.teams.find((t) => t.id === ev.teamId)!;
  const mal = team.mal.find((m) => m.id === ev.malId)!;
  mal.progress = ev.from;
  for (const cap of ev.captures) {
    const victim = r.teams.find((t) => t.id === cap.teamId)?.mal.find((m) => m.id === cap.malId);
    if (victim) victim.progress = cap.from;
  }
  if (ev.finishedTeam) team.finishedAt = null;
}

/**
 * Resolve the frozen mini-game. Success keeps the move and continues the turn;
 * fail cancels the advancement (말 back, captures restored, bonus forfeited) and
 * passes the turn. The outcome is stamped on the TurnEvent so replay reproduces it.
 * This never calls `replay`, so it is safe to call *from* replay.
 */
function resolveMiniGame(r: Room, success: boolean, now: number): Emit[] {
  const ev = r.history[r.history.length - 1]!;
  const gameId = r.pendingMiniGame?.gameId ?? '';
  ev.miniGame = { gameId, success };
  r.pendingMiniGame = null;

  if (success) {
    const events: Emit[] = [{ e: 'minigame:resolved', success: true }];
    events.push(...advanceAfterMove(r, now));
    return events;
  }

  revertMove(r, ev);
  r.throwQueue = 0; // forfeit any bonus this move granted
  const events: Emit[] = [
    { e: 'minigame:resolved', success: false },
    { e: 'board:update', mal: boardMal(r), lastMove: ev },
  ];
  r.turnIndex = nextTeamIndex(r, r.turnIndex);
  r.throwQueue = 1;
  const next = r.teams[r.turnIndex]!;
  events.push({ e: 'turn:changed', teamId: next.id, teamName: next.name });
  return events;
}

/**
 * spec §4.3 — the reducer. Pure: no I/O, no `Date.now()`, no socket awareness.
 * Time is an argument. Randomness does not exist (req §7).
 */
export function apply(state: Room, action: Action, now: number): { state: Room; events: Emit[] } {
  if (!ALLOWED[state.state].includes(action.t)) {
    throw new EngineError('ILLEGAL_ACTION', `${action.t} not allowed while ${state.state}`);
  }

  const r: Room = structuredClone(state);
  const events: Emit[] = [];

  switch (action.t) {
    case 'SETUP': {
      if (action.teams.length < MIN_TEAMS) throw new EngineError('TOO_FEW_TEAMS');
      const names = action.teams.map((t) => t.name.trim());
      if (names.some((n) => n.length === 0)) throw new EngineError('DUPLICATE_TEAM_NAME', 'empty team name');
      if (new Set(names).size !== names.length) throw new EngineError('DUPLICATE_TEAM_NAME');
      if (action.malPerTeam !== 1 && action.malPerTeam !== 2) throw new EngineError('BAD_MAL_COUNT');
      if (!Number.isFinite(action.timeLimitMin) || action.timeLimitMin < 1) throw new EngineError('BAD_TIME_LIMIT');

      r.malPerTeam = action.malPerTeam;
      r.miniGames = action.miniGames ?? false;
      r.miniGameSet = action.miniGameSet && action.miniGameSet.length > 0 ? action.miniGameSet : MINI_GAMES;
      r.timeLimitMs = Math.round(action.timeLimitMin * MS_PER_MIN);
      r.teams = action.teams.map((t, i) => {
        const id = `t${i + 1}`;
        return {
          id,
          name: names[i]!,
          roster: t.roster ?? null,
          color: TEAM_COLORS[i % TEAM_COLORS.length]!,
          mal: Array.from({ length: action.malPerTeam }, (_, j) => ({ id: `${id}m${j + 1}`, progress: WAITING })),
          finishedAt: null,
          lastProgressAt: now,
        };
      });
      r.state = 'LOBBY';
      break;
    }

    case 'START': {
      r.state = 'RUNNING';
      r.startedAt = now;
      r.turnIndex = 0;
      r.throwQueue = 1;
      for (const t of r.teams) t.lastProgressAt = now;
      const first = r.teams[0]!;
      events.push({ e: 'board:update', mal: boardMal(r), lastMove: null });
      events.push({ e: 'turn:changed', teamId: first.id, teamName: first.name });
      break;
    }

    case 'THROW': {
      if (r.pendingMiniGame !== null) throw new EngineError('MINIGAME_PENDING');
      if (r.pendingThrow !== null) throw new EngineError('THROW_PENDING');
      if (r.throwQueue <= 0) throw new EngineError('NO_THROW_OWED');

      r.throwQueue -= 1;
      const team = r.teams[r.turnIndex]!;
      const cands = candidates(r, team.id, action.roll);
      // Unreachable while the turn pointer is maintained: overshoot-goes-home (req §6)
      // guarantees a candidate for every unfinished 말.
      if (cands.length === 0) throw new EngineError('NO_CANDIDATES');

      // Always emitted, including when there is no choice to make — the board shows
      // every roll large (req §13.1).
      events.push({ e: 'throw:recorded', teamId: team.id, roll: action.roll, candidates: cands });

      if (cands.length === 1) {
        events.push(...commitMove(r, action.roll, cands[0]!, now));
      } else {
        r.pendingThrow = { teamId: team.id, roll: action.roll, at: now, candidates: cands };
      }
      break;
    }

    case 'MOVE': {
      if (r.pendingMiniGame !== null) throw new EngineError('MINIGAME_PENDING');
      const pending = r.pendingThrow;
      if (!pending) throw new EngineError('NO_PENDING_THROW');
      // A 말 on a branch 밭 has two candidates (지름길/바깥길); `to` disambiguates.
      const forMal = pending.candidates.filter((c) => c.malId === action.malId);
      const cand = action.to !== undefined ? forMal.find((c) => c.to === action.to) : forMal[0];
      if (!cand) throw new EngineError('ILLEGAL_MOVE');
      events.push(...commitMove(r, pending.roll, cand, now));
      break;
    }

    case 'UNDO': {
      if (r.pendingMiniGame !== null) throw new EngineError('MINIGAME_PENDING');
      // A throw entered but not yet resolved is not an event. Cancelling it is the
      // mis-tap caught in time (req §7.1); `revertedSeq: 0` means "nothing was logged".
      if (r.pendingThrow !== null) {
        r.pendingThrow = null;
        r.throwQueue += 1;
        events.push({ e: 'undo:applied', revertedSeq: 0 });
        events.push({ e: 'board:update', mal: boardMal(r), lastMove: r.history[r.history.length - 1] ?? null });
        break;
      }
      if (r.history.length === 0) throw new EngineError('NOTHING_TO_UNDO');

      const revertedSeq = r.history[r.history.length - 1]!.seq;
      const rebuilt = replay(setupOf(r), r.history.slice(0, -1));
      const current = rebuilt.teams[rebuilt.turnIndex]!;
      events.push({ e: 'undo:applied', revertedSeq });
      events.push({ e: 'board:update', mal: boardMal(rebuilt), lastMove: rebuilt.history[rebuilt.history.length - 1] ?? null });
      events.push({ e: 'turn:changed', teamId: current.id, teamName: current.name });
      return { state: rebuilt, events };
    }

    case 'PAUSE': {
      if (r.pausedAt !== null) throw new EngineError('ALREADY_PAUSED');
      r.pausedAt = now;
      break;
    }

    case 'RESUME': {
      if (r.pausedAt === null) throw new EngineError('NOT_PAUSED');
      r.totalPausedMs += now - r.pausedAt;
      r.pausedAt = null;
      break;
    }

    case 'EXTEND': {
      r.timeLimitMs += Math.round(action.minutes * MS_PER_MIN);
      break;
    }

    case 'END': {
      events.push(...endGame(r, action.reason, now));
      break;
    }

    case 'RESUME_FROM_ENDED': {
      if (r.revealStep > 0) throw new EngineError('REVEAL_STARTED');
      r.state = 'RUNNING';
      r.endedAt = null;
      r.endReason = null;
      break;
    }

    case 'REVEAL': {
      if (r.state === 'ENDED') {
        if (action.step !== 0) throw new EngineError('BAD_REVEAL_STEP');
        r.state = 'REVEAL';
        r.revealStep = 0;
      } else {
        if (action.step !== r.revealStep + 1 || action.step > MAX_REVEAL_STEP) {
          throw new EngineError('BAD_REVEAL_STEP');
        }
        r.revealStep = action.step;
      }
      events.push({ e: 'reveal:step', step: r.revealStep });
      break;
    }

    case 'MINIGAME_SPIN': {
      if (r.pendingMiniGame === null) throw new EngineError('NO_MINIGAME');
      r.pendingMiniGame.gameId = action.gameId;
      events.push({ e: 'minigame:spun', gameId: action.gameId });
      break;
    }

    case 'MINIGAME_RESOLVE': {
      if (r.pendingMiniGame === null) throw new EngineError('NO_MINIGAME');
      events.push(...resolveMiniGame(r, action.success, now));
      break;
    }

    case 'TICK': {
      if (r.pendingMiniGame !== null) break; // frozen — nothing to time out mid-challenge
      if (r.pausedAt !== null) break;
      if (remainingMs(r, now) > 0) break;
      // req §10 — the current team finishes its turn first. The end fires on the first
      // tick after that.
      if (isMidTurn(r)) break;
      events.push(...endGame(r, 'timeup', now));
      break;
    }
  }

  return { state: r, events };
}
