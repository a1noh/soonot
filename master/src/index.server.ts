/**
 * The process entry point (spec §12). `npm start`.
 *
 * Both games are plugged in: 윷놀이 at milestone 3, bingo at milestone 4.
 * One process, one port — the HTTP surface, the four socket namespaces and
 * the built client assets all live here.
 */

import { loadConfig, requirePasscodeHash } from './config.js';
import { hashPasscode } from './identity/passcode.js';
import { createHost } from './host/server.js';
import { bingoModule } from '@soonot/bingo/src/module.js';
import { yutnoriModule } from '@soonot/yutnori/src/module.js';

const config = loadConfig();
const passcodeHash = requirePasscodeHash(config, hashPasscode);

const host = createHost({
  config,
  passcodeHash,
  modules: { bingo: bingoModule, yutnori: yutnoriModule },
});

const port = await host.listen();
// eslint-disable-next-line no-console
console.log(`[master] listening on http://localhost:${port}  (console: /master)`);
