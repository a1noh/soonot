/**
 * The fake game of milestone 1 (spec §13).
 *
 * It implements `GameModule` and nothing else: five lifecycle states, a reveal
 * counter, and one game-specific action (`POKE`) that exists only to prove a
 * module can extend the host's base whitelist. It has no rules, because the
 * host must work without knowing any.
 *
 * It is also the fixture that keeps §9.1 honest: if the host ever needs
 * something from a game that this stub cannot supply, the host has grown a game
 * rule and the test will not compile.
 */

import type { GameModule, Viewer } from '../host/module';
import type { Emit } from '../host/emit';
import type { GameId, RoomState } from '../shared/lifecycle';
import { nextRevealStep, type RevealStep } from '../shared/lifecycle';
import type { RankEntry } from '../shared/rank';
import { EngineError } from '../host/errors';

export interface StubState {
  readonly eventId: string;
  readonly state: RoomState;
  readonly revealStep: RevealStep;
  readonly pokes: number;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
  /** Set at SETUP; `START` refuses below 2, standing in for a per-game guard. */
  readonly entrants: number;
}

export type StubAction =
  | { readonly t: 'SETUP'; readonly entrants: number }
  | { readonly t: 'START' }
  | { readonly t: 'POKE' }
  | { readonly t: 'END' }
  | { readonly t: 'REVEAL' };

function emitsFor(state: StubState, extra: readonly Emit[] = []): Emit[] {
  return [
    ...extra,
    { to: 'room', ev: 'room:state', data: { state: state.state, revealStep: state.revealStep } },
  ];
}

export function createStubModule(id: GameId): GameModule<StubState, StubAction> {
  return {
    id,

    create(eventId) {
      return {
        eventId,
        state: 'SETUP',
        revealStep: 0,
        pokes: 0,
        startedAt: null,
        endedAt: null,
        entrants: 0,
      };
    },

    lifecycle: (s) => s.state,

    allowed: {
      SETUP: [],
      LOBBY: [],
      RUNNING: ['POKE'],
      ENDED: [],
      REVEAL: [],
    },

    apply(s, action, now) {
      switch (action.t) {
        case 'SETUP': {
          const next: StubState = { ...s, state: 'LOBBY', entrants: action.entrants };
          return { state: next, emits: emitsFor(next) };
        }
        case 'START': {
          // A per-game transition guard (req §4.2): the host owns the machine,
          // the game owns the condition.
          if (s.entrants < 2) throw new EngineError('TOO_FEW', '참여자가 부족해요');
          const next: StubState = { ...s, state: 'RUNNING', startedAt: now };
          return { state: next, emits: emitsFor(next) };
        }
        case 'POKE': {
          const next: StubState = { ...s, pokes: s.pokes + 1 };
          return {
            state: next,
            emits: emitsFor(next, [{ to: 'room', ev: 'stub:poked', data: { pokes: next.pokes } }]),
          };
        }
        case 'END': {
          const next: StubState = { ...s, state: 'ENDED', endedAt: now };
          return {
            state: next,
            emits: emitsFor(next, [{ to: 'room', ev: 'game:ended', data: { endedAt: now } }]),
          };
        }
        case 'REVEAL': {
          const step = s.state === 'REVEAL' ? nextRevealStep(s.revealStep) : (1 as RevealStep);
          const next: StubState = { ...s, state: 'REVEAL', revealStep: step };
          return {
            state: next,
            emits: emitsFor(next, [{ to: 'room', ev: 'reveal:step', data: { step } }]),
          };
        }
      }
    },

    route(ev, payload, viewer: Viewer) {
      if (viewer.kind !== 'master') return null;
      switch (ev) {
        case 'master:setup': {
          const entrants = (payload as { entrants?: number } | null)?.entrants ?? 0;
          return { t: 'SETUP', entrants };
        }
        case 'master:start':
          return { t: 'START' };
        case 'master:poke':
          return { t: 'POKE' };
        case 'master:end':
          return { t: 'END' };
        case 'master:reveal':
          return { t: 'REVEAL' };
        default:
          return null;
      }
    },

    project(s, viewer) {
      return viewer.kind === 'master'
        ? { state: s.state, revealStep: s.revealStep, pokes: s.pokes, entrants: s.entrants }
        : { state: s.state, revealStep: s.revealStep };
    },

    rank(s): RankEntry[] {
      return Array.from({ length: Math.min(s.entrants, 4) }, (_, i) => ({
        id: `e${i + 1}`,
        label: `참가자 ${i + 1}`,
        detail: `${s.pokes}회`,
      }));
    },

    invariants(s) {
      if (s.revealStep < 0 || s.revealStep > 4) throw new Error('revealStep out of range');
      if (s.state !== 'REVEAL' && s.revealStep !== 0) {
        throw new Error('revealStep set outside REVEAL');
      }
      if (s.pokes < 0) throw new Error('negative pokes');
    },

    persistence: {
      kind: 'snapshot',
      write: () => undefined,
      read: () => null,
      triggers: { onTransition: true, onEmits: ['game:ended'], debounceMs: 1000 },
    },

    ticks: false,
  };
}
