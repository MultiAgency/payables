// Drives Proto's isolated recipe stack (`test/e2e/stack.mjs`) as a separate process. Proto owns the
// stack and its simulator; this side only reads its published state and writes its file controls.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/** `ownerApp`: a built Payables owner app, served at /a/payout/ through Proto's shared release server. */
/** `builder`: an account not yet agreed in the payout policy; `payoutFunding`: the payout agent's starting balance. */
export async function protoStack(proto, out, { owner, payees, browser = 'none', ownerApp, builder, payoutFunding, env = process.env, startupMs = 90_000 }) {
  const directory = join(out, 'stack'), log = join(out, 'stack.log');
  const child = spawn(process.execPath, ['--require', join(proto, 'test/fixtures/offline-network.cjs'), join(proto, 'test/e2e/stack.mjs'), '--owner', owner, ...payees.flatMap(p => ['--payee', p]),
    ...(browser === 'none' ? ['--no-browser'] : browser === 'headed' ? ['--headed'] : []), ...(ownerApp ? ['--payables-release', ownerApp] : []),
    ...(builder ? ['--builder', builder] : []), ...(payoutFunding !== undefined ? ['--payout-funding', payoutFunding] : [])],
  { cwd: proto, env: { ...env, PROTO_E2E_ARTIFACTS: out }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk; appendFileSync(log, chunk); });
  const exited = new Promise(resolve => child.once('exit', resolve));
  const deadline = Date.now() + startupMs;
  while (!output.includes('Isolated stack ready')) {
    if (child.exitCode !== null) throw new Error(`Proto stack exited during startup; see ${log}`);
    if (Date.now() > deadline) { child.kill('SIGTERM'); throw new Error(`Proto stack startup timed out; see ${log}`); }
    await delay(100);
  }
  const statePath = join(directory, 'state.json');
  const read = () => JSON.parse(readFileSync(statePath, 'utf8'));
  const initial = read();
  /** The stack's published state, refreshed after `since` so it reflects actions already taken. */
  async function state(since = Date.now()) {
    while (statSync(statePath).mtimeMs <= since) await delay(50);
    for (;;) { try { return read(); } catch { await delay(50); } }
  }
  let sequence = 0;
  /** One simulator control (fund, settle, dropTransferResponse, …); throws if the stack refused it. */
  async function control(command, input = {}) {
    const name = `payables-${process.pid}-${++sequence}`, request = join(directory, 'controls', `${name}.json`), result = join(directory, 'controls', `${name}.result.json`);
    writeFileSync(request, JSON.stringify({ command, ...input }));
    while (!existsSync(result)) await delay(50);
    const answer = JSON.parse(readFileSync(result, 'utf8'));
    if (!answer.ok) throw new Error(`Stack refused ${command}: ${answer.error}`);
  }
  return {
    dashboard: initial.dashboard, invoices: initial.payee, owner: initial.owner, cdp: initial.cdp,
    certificateDirectory: join(directory, 'environment'), state, control,
    async close() { writeFileSync(join(directory, 'stop'), ''); await Promise.race([exited, delay(30_000).then(() => child.kill('SIGKILL'))]); },
  };
}
