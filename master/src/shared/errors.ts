/**
 * The error a game throws (spec §2 dependency direction).
 *
 * This lives in `shared/` rather than `host/` because **games throw it**: a
 * module's `apply` raises `EngineError` when an action is illegal under its own
 * rules. A game importing it from `host/` would invert the one dependency rule
 * that keeps "the host contains no game rules" (req §9.1) true.
 *
 * `HostError` — the host's own refusals — stays in `host/errors.ts`, where no
 * game can reach it.
 */
export class EngineError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = 'EngineError';
    this.code = code;
  }
}
