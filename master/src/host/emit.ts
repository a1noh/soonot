/**
 * Emit audiences (spec §6.2).
 *
 * Bingo §16.2 is the one mistake that would actually break the event:
 * broadcasting `cell:result` turns ~8,100 events into ~810,000 messages, and it
 * looks free at ten players in dev. So fan-out is not a call-site decision.
 * Each module declares its own `Emit` union pairing every event name with its
 * *legal* audience, which makes the mistake a compile error rather than a load
 * test finding.
 *
 * The four tokens below are normative. There is no `all` and no `socket`.
 */

export type Audience =
  /** One player's socket, by `playerId`. Bingo only. */
  | { readonly to: 'player'; readonly playerId: string }
  /** Every socket on that game's surface, projector included. Both games. */
  | { readonly to: 'room' }
  /** Every signed-in master device (req §3.4) — laptop and phone both. */
  | { readonly to: 'master' }
  /** The projector surface alone. Reserved; nothing emits it in v1. */
  | { readonly to: 'projector' };

export type AudienceToken = Audience['to'];

export const AUDIENCE_TOKENS = ['player', 'room', 'master', 'projector'] as const;

/**
 * One thing that happened, addressed. A module's `Emit` union is a set of these
 * with `ev` and `data` narrowed to literal pairs.
 */
export type Emit = Audience & {
  readonly ev: string;
  readonly data: unknown;
};

/**
 * `room:state` is always sent **last**, after the granular events, so a client
 * that ignores them and re-renders from state alone is still correct
 * (spec §6.2). A reconnecting client gets it by itself — no replayed animations.
 */
export const STATE_EVENT = 'room:state';

/**
 * Sorts a module's emits into delivery order. Stable, so animation events keep
 * the order `apply` produced them in.
 */
export function inDeliveryOrder(emits: readonly Emit[]): Emit[] {
  const granular = emits.filter((e) => e.ev !== STATE_EVENT);
  const state = emits.filter((e) => e.ev === STATE_EVENT);
  return [...granular, ...state];
}

/** Every emit carries `serverNow`, so bingo needs no clock ticks at all (spec §7). */
export interface Envelope {
  readonly serverNow: number;
  readonly data: unknown;
}

export function envelope(data: unknown, serverNow: number): Envelope {
  return { serverNow, data };
}
