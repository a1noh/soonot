/** Deployment configuration (spec §12). One process, one port, one database. */

export interface Config {
  port: number;
  dbPath: string;
  masterPasscodeHash: string | null;
  sessionSecret: string | null;
  projectorHoldMs: number;
  production: boolean;
  tls: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env['PORT'] ?? 3000),
    dbPath: env['DB_PATH'] ?? './soonot.db',
    masterPasscodeHash: env['MASTER_PASSCODE_HASH'] ?? null,
    sessionSecret: env['SESSION_SECRET'] ?? null,
    projectorHoldMs: Number(env['PROJECTOR_HOLD_MS'] ?? 20_000),
    production: env['NODE_ENV'] === 'production',
    tls: env['TLS'] === 'true',
  };
}

/**
 * A missing passcode hash is fatal in production and a loud warning in
 * development, where a default keeps `npm run dev` a single command.
 * It is never silently defaulted in production: an event host with no passcode
 * is an unattended laptop anyone can drive.
 */
export const DEV_PASSCODE = 'soonot';

export function requirePasscodeHash(config: Config, hashDev: (s: string) => string): string {
  if (config.masterPasscodeHash) return config.masterPasscodeHash;
  if (config.production) {
    throw new Error('MASTER_PASSCODE_HASH is required. Run `npm run hash-passcode` to make one.');
  }
  // eslint-disable-next-line no-console
  console.warn(
    `[master] MASTER_PASSCODE_HASH unset — development passcode is "${DEV_PASSCODE}". ` +
      'Run `npm run hash-passcode` before an event.',
  );
  return hashDev(DEV_PASSCODE);
}
