/**
 * The process entry point (spec §12). `npm start`.
 *
 * Milestones 1–2 boot the host with **stub modules** in both slots: identity,
 * namespaces and the console shell are real, and the games plug in at
 * milestones 3 and 4 by swapping these two lines.
 */

import { loadConfig, requirePasscodeHash } from './config.js';
import { hashPasscode } from './identity/passcode.js';
import { createHost } from './host/server.js';
import { createStubModule } from './__tests__/stub-module.js';

const config = loadConfig();
const passcodeHash = requirePasscodeHash(config, hashPasscode);

const host = createHost({
  config,
  passcodeHash,
  modules: {
    bingo: createStubModule('bingo'), // → @soonot/bingo at milestone 4
    yutnori: createStubModule('yutnori'), // → @soonot/yutnori at milestone 3
  },
});

const port = await host.listen();
// eslint-disable-next-line no-console
console.log(`[master] listening on http://localhost:${port}  (console: /master)`);
