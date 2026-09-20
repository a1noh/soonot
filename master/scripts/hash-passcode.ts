/**
 * `npm run hash-passcode` — prints the `MASTER_PASSCODE_HASH` for a passcode.
 *
 * The hash goes in the deployment's configuration; the passcode itself is never
 * stored anywhere (req §3.1, §8).
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { hashPasscode } from '../src/identity/passcode.js';

const fromArgv = process.argv[2];

const passcode =
  fromArgv ??
  (await (async () => {
    const rl = createInterface({ input: stdin, output: stdout });
    const answer = await rl.question('New master passcode: ');
    rl.close();
    return answer;
  })());

if (!passcode || passcode.length < 4) {
  console.error('Passcode must be at least 4 characters.');
  process.exit(1);
}

console.log('');
console.log('MASTER_PASSCODE_HASH=' + hashPasscode(passcode));
console.log('');
console.log('Put that in the environment. The passcode itself is never stored.');
