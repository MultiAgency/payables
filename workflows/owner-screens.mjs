// The recipe's handle on the owner's screens: each call runs one step of owner-ui.mjs in its own process.
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const script = join(import.meta.dirname, 'owner-ui.mjs');
const STEPS = ['setup', 'addBuilder', 'funding', 'recordAgreement', 'approve', 'approveBlocked', 'prepareShared', 'send', 'approveHeld'];

export function ownerScreens(cdp) {
  const run = (step, args) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, step, JSON.stringify(args ?? {})], { env: { ...process.env, OWNER_UI_CDP: cdp, NODE_OPTIONS: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', c => { out += c; }); child.stderr.on('data', c => { err += c; });
    child.on('exit', code => code === 0 ? resolve(JSON.parse(out.trim().split('\n').at(-1) || 'null')) : reject(new Error(`Owner screen step ${step} failed: ${err.trim() || out.trim()}`)));
  });
  return Object.fromEntries([...STEPS.map(step => [step, args => run(step, args)]), ['close', async () => {}]]);
}
