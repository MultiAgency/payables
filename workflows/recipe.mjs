// Shared recipe frame: offline isolation, scenario inputs, an isolated Proto stack, pausable steps
// with a receipt, and the isolated-order payment ending reused by every Payables story.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { protoStack } from './proto-stack.mjs';
import { observe, ownerRpc, ownerSignIn, session, payeeApi, workOrderOwnerAction } from './payment-steps.mjs';
import { sdkMode } from '../scripts/release-mode.mjs';

export const usdcUnits = value => {
  const [whole, fraction = ''] = String(value).split('.');
  if (!/^\d+$/.test(whole) || !/^\d{0,6}$/.test(fraction)) throw new Error(`Invalid USDC amount: ${value}`);
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))).toString();
};

/**
 * Digest of a directory tree, the same algorithm as Proto's E2E runner (`test/e2e/run.mjs`):
 * sha256 over sorted entries of `relative path NUL file bytes NUL`, skipping the named directories.
 */
export function treeDigest(root, skip = []) {
  const hash = createHash('sha256');
  (function scan(dir, prefix) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = prefix + entry.name;
      if (skip.includes(path)) continue;
      if (entry.isDirectory()) scan(join(dir, entry.name), `${path}/`);
      else if (entry.isFile()) hash.update(path).update('\0').update(readFileSync(join(dir, entry.name))).update('\0');
    }
  })(root, '');
  return hash.digest('hex');
}

/** The SDK this run used: a release candidate's tarball sha256 and source snapshot, or the dev link it resolved. */
function contractProvenance() {
  const root = resolve(import.meta.dirname, '..');
  const pkg = JSON.parse(readFileSync(join(root, 'node_modules/@multiagency/sdk/package.json'), 'utf8'));
  const { mode, spec } = sdkMode();
  if (mode === 'dev') return { package: `${pkg.name}@${pkg.version}`, link: spec };
  const provenance = JSON.parse(readFileSync(join(root, 'node_modules/@multiagency/sdk/provenance.json'), 'utf8'));
  const tarball = join(root, 'vendor', `multiagency-sdk-${pkg.version}.tgz`);
  return { package: `${pkg.name}@${pkg.version}`, tarballSha256: createHash('sha256').update(readFileSync(tarball)).digest('hex'), builtFrom: provenance.snapshot };
}

// Proto's snapshot runDigest scope: the whole root except its own run artifacts and manifest (node_modules is a symlink, skipped).
const SNAPSHOT_SKIP = ['.test-artifacts', 'SNAPSHOT.json'];

/** Which Proto ran: a frozen snapshot (its declared manifest plus our own digest), or a checkout's HEAD and dirty state. */
function protoSource(proto) {
  const manifest = join(proto, 'SNAPSHOT.json');
  if (existsSync(manifest)) {
    const declared = JSON.parse(readFileSync(manifest, 'utf8'));
    const digest = treeDigest(proto, SNAPSHOT_SKIP);
    if (digest !== declared.runDigest) throw new Error(`Proto snapshot digest ${digest} does not match its declared runDigest ${declared.runDigest}`);
    return { path: proto, snapshot: { runDigest: digest, verified: true, sourceHead: declared.sourceHead, overlay: declared.overlay,
      overlayDiffSha256: declared.overlayDiffSha256, validated: declared.validated } };
  }
  const git = (...command) => { const r = spawnSync('git', ['-C', proto, ...command], { encoding: 'utf8' }); return r.status === 0 ? r.stdout : null; };
  const dirty = git('diff', 'HEAD'), untracked = git('ls-files', '--others', '--exclude-standard');
  return { path: proto, head: git('rev-parse', 'HEAD')?.trim() ?? null, warning: 'Working checkout, not a frozen snapshot',
    dirty: dirty === null ? null : { diffSha256: createHash('sha256').update(dirty).digest('hex'), untracked: untracked.split('\n').filter(Boolean) } };
}

/**
 * Starts a recipe: re-executes the entry under Proto's offline network guard, loads its scenario
 * and an isolated stack, and returns the actors' sessions plus `step`/`stop` helpers.
 */
export async function startRecipe(entry, { name, scenario: defaultScenario, faults = [] }) {
  const args = process.argv.slice(2);
  const option = key => { const i = args.indexOf(key); return i === -1 ? undefined : args[i + 1]; };
  const flag = key => args.includes(key);
  const proto = resolve(option('--proto') ?? process.env.PROTO_DIR ?? resolve(import.meta.dirname, '../../proto'));

  // The runner and every Proto child it starts refuse non-loopback connections.
  if (!process.env.PAYABLES_WORKFLOW_OFFLINE) {
    const { offlineEnvironment } = await import(pathToFileURL(join(proto, 'scripts/test-environment.mjs')).href);
    const result = spawnSync(process.execPath, ['--require', join(proto, 'test/fixtures/offline-network.cjs'), entry, ...args],
      { stdio: 'inherit', env: { ...offlineEnvironment(), PAYABLES_WORKFLOW_OFFLINE: '1', PROTO_DIR: proto,
        // The Invoices release is staged and served by Proto's shared release server.
        ...(option('--invoices-dist') && { PROTO_E2E_INVOICES_DIST: resolve(option('--invoices-dist')), PROTO_E2E_INVOICES_MODE: 'release-server' }) } });
    process.exit(result.status ?? 1);
  }

  const scenarioPath = resolve(option('--scenario') ?? defaultScenario);
  const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'));
  const fault = option('--fault');
  if (fault && !faults.includes(fault)) throw new Error(`Unknown fault: ${fault}. Available: ${faults.join(', ') || 'none'}`);

  const { OWNER: STACK_OWNER, sign } = await import(pathToFileURL(join(proto, 'test/e2e/provider.mjs')).href);
  const ownerAccount = scenario.owner ?? STACK_OWNER;
  const out = resolve(import.meta.dirname, '../.test-artifacts/workflows', `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(out, { recursive: true });
  const invoicesDist = process.env.PROTO_E2E_INVOICES_DIST;
  // Optional: payee submissions and filings through Invoices' UI-level steps on the actual Invoices page.
  const payeeSteps = option('--payee-steps') && resolve(option('--payee-steps'));
  // Optional: owner steps through a built Payables owner app (web/dist), served by the stack at /a/payout/.
  const ownerApp = option('--owner-app') && resolve(option('--owner-app'));
  const browser = option('--browser') ?? (payeeSteps || ownerApp ? 'headless' : 'none');
  if (ownerApp && browser === 'none') throw new Error('--owner-app needs a browser (--browser headless|headed)');
  // `--setup ui`: the stack leaves the builder out of the payout policy and the payout agent unfunded; the owner sets both up.
  const uiSetup = option('--setup') === 'ui';
  if (option('--setup') && !uiSetup) throw new Error('--setup takes "ui"');
  if (uiSetup && !ownerApp) throw new Error('--setup ui needs --owner-app');
  if (payeeSteps && (!invoicesDist || browser === 'none')) throw new Error('--payee-steps needs --invoices-dist and a browser (--browser headless|headed)');
  // Payee-side lost response (the browser never sees Proto's answer), then the page's own resume. UI driver only.
  const payeeFault = option('--payee-fault');
  if (payeeFault && (!payeeSteps || payeeFault !== 'lost-response')) throw new Error('--payee-fault lost-response needs --payee-steps');
  // Filming: leave the page's filing confirm for the person at the headed browser.
  const humanConfirm = flag('--human-confirm');
  if (humanConfirm && (!payeeSteps || browser !== 'headed')) throw new Error('--human-confirm needs --payee-steps and --browser headed');
  const receipt = { story: scenario.story, scenario: scenarioPath, inputs: scenario, proto: protoSource(proto),
    invoicesFrontend: invoicesDist ? { path: invoicesDist, digest: treeDigest(invoicesDist) } : null,
    ownerApp: ownerApp ? { path: ownerApp, digest: treeDigest(ownerApp), sdk: contractProvenance() } : null,
    payeeDriver: payeeSteps ? { kind: 'invoices-ui', script: payeeSteps, sha256: createHash('sha256').update(readFileSync(payeeSteps)).digest('hex') } : { kind: 'sdk', ...contractProvenance() },
    fault: fault ?? null, payeeFault: payeeFault ?? null, setup: uiSetup ? 'owner screens' : 'stack-provisioned',
    simulated: ['wallet signatures', 'funding arrival', 'settlement', 'provider'], steps: [] };
  const save = () => writeFileSync(join(out, 'receipt.json'), JSON.stringify(receipt, null, 2));
  const prompt = flag('--pause') ? createInterface({ input: process.stdin, output: process.stdout }) : undefined;

  console.log(`Starting isolated Proto from ${proto} (simulated provider, no network)…`);
  const stack = await protoStack(proto, out, uiSetup
    ? { owner: ownerAccount, payees: ['bystander.near'], builder: scenario.payee, payoutFunding: '0', browser, ownerApp }
    : { owner: ownerAccount, payees: [scenario.payee], browser, ownerApp });
  receipt.stack = { dashboard: stack.dashboard, payee: stack.invoices, ...(ownerApp && { owner: stack.owner, cdp: stack.cdp }) };
  const owner = session(stack.dashboard, stack.certificateDirectory), payee = session(stack.invoices, stack.certificateDirectory);
  const payeeReads = payeeApi(payee);

  const ctx = {
    scenario, fault, payeeFault, stack, sign, receipt, save, ownerApp, uiSetup,
    /** Each step records the phase it ran in (for example one-time setup, or one report). */
    phase: undefined,
    owner: { account: ownerAccount, http: owner, rpc: ownerRpc(owner, 'payout'), signIn: () => ownerSignIn(owner, ownerAccount, sign) },
    payee: { account: scenario.payee, ...payeeReads, signIn: () => payeeReads.signIn(scenario.payee, sign),
      ...payeeDriver({ api: payeeReads, steps: payeeSteps, statePath: join(out, 'stack', 'state.json'), scenarioPath, out, humanConfirm }) },
    async step(title, actor, run) {
      if (prompt) await prompt.question(`\n▶ ${title} (${actor}) — Enter to continue `);
      const result = await run();
      receipt.steps.push({ step: title, actor, ...(ctx.phase && { phase: ctx.phase }), at: new Date().toISOString(), ...result }); save();
      console.log(`✔ ${title}: ${JSON.stringify(result)}`);
      return result;
    },
    stop(reason, extra = {}) {
      Object.assign(receipt, extra, { stopped: reason }); save();
      console.log(`■ Stopped: ${reason}`);
      process.exitCode = 3;
    },
  };
  /** Runs the story, then checks the simulator saw only declared requests and closes the stack. */
  ctx.run = async story => {
    try {
      await story(ctx);
      const { providerErrors } = await stack.state();
      if (providerErrors.length) throw new Error(`Simulated provider refused requests: ${providerErrors.join('; ')}`);
      const snapshot = receipt.proto.snapshot;
      if (snapshot) {
        snapshot.unchangedAfterRun = treeDigest(proto, SNAPSHOT_SKIP) === snapshot.runDigest;
        // A run that changed its own Proto snapshot proves nothing about that snapshot.
        if (!snapshot.unchangedAfterRun) { save(); throw new Error(`Proto snapshot ${proto} changed during the run`); }
      }
      if (!receipt.stopped) receipt.completed = true;
      save();
      if (flag('--keep')) {
        console.log(`\nStack kept for filming. Owner UI: ${stack.owner}  Payee: ${stack.invoices}/${stack.cdp ? `  Browser (CDP): ${stack.cdp}` : ''}`);
        await (prompt ?? createInterface({ input: process.stdin, output: process.stdout })).question('Enter to stop the stack ');
      }
    } catch (error) {
      receipt.error = error.message; save();
      console.error(`✘ ${error.message}`);
      process.exitCode = 1;
    } finally {
      console.log(`Receipt: ${join(out, 'receipt.json')}`);
      prompt?.close();
      await stack.close();
    }
  };
  return ctx;
}

/** Maps the contract client's `Result` to the driver shape. An `unknown` keeps the caller's identity. */
const outcome = r => r.ok
  ? { ok: true, invoiceId: r.value.id, status: r.value.status, value: r.value }
  : { ok: false, kind: r.kind, httpStatus: r.status ?? null, code: r.code ?? null, refusal: r.error ?? null, status: r.kind === 'unknown' ? 'unknown' : r.kind };

/**
 * Payee submissions and filings. Each `tab` is one browser tab or client with its own retained
 * identity. Both drivers return `{ ok, invoiceId, status, refusal, code, httpStatus? }`; Proto reads verify.
 * - sdk: Proto's `payeeClient` (`@multiagency/sdk/payee`) against the payee routes.
 * - invoices-ui: Invoices' `workflow/payee.mjs`, a separate process driving the actual page over CDP.
 */
function payeeDriver({ api, steps, statePath, scenarioPath, out, humanConfirm }) {
  if (!steps) return {
    fileOrder: async id => outcome(await api.client.fileWorkOrder(id)),
    submitInvoice: async ({ amount, note, submission }) => outcome(await api.client.submitInvoice({ submission, amount, note })),
    submitReport: async command => { const r = outcome(await api.client.submitReport(command)); return { ...r, requestId: r.value?.id ?? command.id, commandId: command.commandId, status: r.value?.state ?? r.status }; },
  };
  // A tab that submits one of several reports reads that report from its own scenario file.
  const scenarioOf = new Map();
  const run = (args, tab) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [steps, ...args, '--session', statePath, '--scenario', scenarioOf.get(tab) ?? scenarioPath, '--receipt', join(out, `payee-${tab}.json`)],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', c => { stdout += c; }); child.stderr.on('data', c => { stderr += c; });
    child.on('exit', code => {
      const last = stdout.trim().split('\n').at(-1);
      let result; try { result = JSON.parse(last); } catch { result = null; }
      // 0: recorded or read; 1: Proto refused or not ready; anything else is a guard or error.
      // Identities the page minted (submission, commandId, …) are kept in the driver's own receipt.
      let identities = null; try { identities = JSON.parse(readFileSync(join(out, `payee-${tab}.json`), 'utf8')).identities ?? null; } catch {}
      if (code === 0 || (code === 1 && result)) resolve({ ok: code === 0, httpStatus: result?.http, code: result?.code ?? (result?.outcome === 'not_ready' ? 'not_ready' : null),
        invoiceId: result?.invoiceId, status: result?.status ?? result?.outcome, refusal: code === 1 ? (result?.error ?? result?.note ?? result?.outcome ?? null) : null, result, identities });
      else reject(new Error(`Invoices payee step ${args.join(' ')} exited ${code}: ${stderr.trim() || last}`));
    });
  });
  return {
    // The step answers the page's filing confirm itself; with humanConfirm it waits for the person instead.
    fileOrder: (id, tab = 'tab1') => run(['order', 'file', '--order', id, ...(humanConfirm ? ['--confirm', 'human'] : [])], tab),
    submitInvoice: async (_request, tab = 'tab1', { fault } = {}) => {
      const r = await run(['invoice', 'submit', ...(fault ? ['--fault', fault] : [])], tab);
      return { ...r, submission: r.result?.submission ?? r.identities?.invoice?.submission ?? null };
    },
    /** Resends only the page's retained identity after a payee-side lost response. */
    resume: async (kind, tab = 'tab1') => { const r = await run([kind, 'resume'], tab); return { ...r, requestId: r.result?.requestId, commandId: r.result?.commandId, submission: r.result?.submission ?? null }; },
    // The page mints its own identities from the scenario's `report`; the result names them.
    submitReport: async (_command, tab = 'tab1', { fault, report } = {}) => {
      if (report) {
        const file = join(out, `scenario-${tab}.json`);
        writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(scenarioPath, 'utf8')), report }));
        scenarioOf.set(tab, file);
      }
      const r = await run(['report', 'submit', ...(fault ? ['--fault', fault] : [])], tab);
      return { ...r, requestId: r.result?.requestId, commandId: r.result?.commandId };
    },
  };
}

/**
 * The isolated-order payment ending: owner authorizes the order agent and its grant, funds exactly
 * the order amount, the payee files the order's one invoice, the owner approves the held payout,
 * and both sides observe the recorded outcome. An unknown filing outcome stops the recipe.
 */
/** `tag` prefixes this order's payee tabs, so each order on one story keeps its own retained identities. */
export async function orderPaymentEnding(ctx, id, { tag = '', label } = {}) {
  const of = label ? ` (${label})` : '';
  const { owner, payee, stack, sign, step } = ctx;
  const snapshot = () => owner.rpc('workOrders/get', { id });
  const orderTransfers = async agent => (await stack.state()).transfers.filter(p => p.agent === agent);
  const amount = (await snapshot()).order.amount;

  await step(`Owner authorizes the order agent (simulated wallet signature)${of}`, owner.account, async () => {
    const action = await workOrderOwnerAction(owner.rpc, sign, owner.account, id, 'create');
    const ready = await observe(snapshot, s => s.agentId && s.policyReady);
    if (!action.ownerSucceeded || !ready.done) throw new Error(`Agent authorization not observed: ${JSON.stringify(action)}`);
    return { correlationId: action.correlationId, orderAgent: ready.value.agentId, policyReady: true };
  });

  await step(`Owner authorizes the order grant until the deadline (simulated wallet signature)${of}`, owner.account, async () => {
    const action = await workOrderOwnerAction(owner.rpc, sign, owner.account, id, 'grant');
    const granted = await observe(snapshot, s => s.grant);
    if (!action.ownerSucceeded || !granted.done) throw new Error(`Grant not observed: ${JSON.stringify(action)}`);
    return { correlationId: action.correlationId, grantId: granted.value.grant.id, expiresAt: granted.value.grant.expiresAt };
  });

  if (ctx.fault === 'short-funding') {
    // One atomic unit short: the order is not ready, filing is refused and nothing is sent. The owner
    // then tops up exactly the shortfall to the same deposit path and the story continues.
    await step(`Owner funds one unit short (simulated deposit arrival)${of}`, owner.account, async () => {
      const deposit = await owner.rpc('workOrders/deposit', { id });
      const short = (BigInt(amount) - 1n).toString();
      await stack.control('fund', { agent: (await snapshot()).agentId, amount: short });
      const funded = await observe(snapshot, s => s.balance === short);
      if (!funded.done) throw new Error(`Funding not observed: ${funded.value.balance}`);
      return { depositCorrelationId: deposit.correlationId, depositAddress: deposit.address, balance: funded.value.balance, required: amount };
    });
    await step(`Payee filing is refused while funding is short${of}`, payee.account, async () => {
      const order = await payee.workOrder(id);
      const attempt = await payee.fileOrder(id, `${tag}short`);
      const agent = (await snapshot()).agentId, transfers = (await orderTransfers(agent)).length, invoice = (await snapshot()).invoice;
      // Proto refuses with 409 work_order_not_ready. Invoices' page checks readiness first and files nothing ("not_ready").
      const refused = attempt.code === 'work_order_not_ready' ? attempt.httpStatus === 409 && /Nothing was sent/.test(attempt.refusal ?? '') : attempt.code === 'not_ready';
      if (order.ready || attempt.ok || !refused || transfers !== 0 || invoice) throw new Error(`Short funding was not refused as expected: ready ${order.ready}, ${JSON.stringify(attempt)}, ${transfers} transfers`);
      return { ready: order.ready, filingStatus: attempt.httpStatus ?? null, code: attempt.code, refusal: attempt.refusal, orderTransfers: transfers, invoice };
    });
    await step(`Owner tops up the exact shortfall (simulated deposit arrival)${of}`, owner.account, async () => {
      await stack.control('fund', { agent: (await snapshot()).agentId, amount: '1' });
      const funded = await observe(snapshot, s => s.balance === amount);
      if (!funded.done) throw new Error(`Top-up not observed: ${funded.value.balance}`);
      return { balance: funded.value.balance };
    });
  } else await step(`Owner funds exactly the order amount (simulated deposit arrival)${of}`, owner.account, async () => {
    const deposit = await owner.rpc('workOrders/deposit', { id });
    await stack.control('fund', { agent: (await snapshot()).agentId, amount });
    const funded = await observe(snapshot, s => s.balance === amount);
    if (!funded.done) throw new Error(`Funding not observed: ${funded.value.balance}`);
    return { depositCorrelationId: deposit.correlationId, depositAddress: deposit.address, balance: funded.value.balance };
  });

  const filed = await step(`Payee files the order invoice${of}`, payee.account, async () => {
    const order = await payee.workOrder(id);
    if (!order.ready) throw new Error(`Order not ready for the payee: ${JSON.stringify(order)}`);
    if (ctx.fault === 'lost-filing-response') await stack.control('dropTransferResponse');
    const first = await payee.fileOrder(id, `${tag}tab1`);
    if (!first.ok || !first.invoiceId) throw new Error(`Filing refused: ${JSON.stringify(first)}`);
    // Filing again from a second tab (or retrying after an unknown outcome) reuses the order's one
    // retained payout; it never sends another.
    const again = await payee.fileOrder(id, `${tag}tab2`);
    const transfers = (await orderTransfers((await snapshot()).agentId)).length;
    if (!again.ok || again.invoiceId !== first.invoiceId || transfers !== 1) throw new Error(`Second filing changed the payout: ${JSON.stringify(again)}, ${transfers} transfers`);
    return { invoiceId: first.invoiceId, status: first.status, [ctx.fault === 'lost-filing-response' ? 'retry' : 'duplicateFiling']: { invoiceId: again.invoiceId, status: again.status }, orderTransfers: transfers };
  });
  if (filed.status !== 'waiting') {
    const order = await snapshot();
    return ctx.stop(`Filing outcome is ${filed.status}. No new send; observe invoice ${filed.invoiceId} until the provider reports it.`,
      { unresolved: { invoice: order.invoice, ownerApproval: order.approval } });
  }

  const approval = await step(`Owner approves the held payout (simulated wallet signature)${of}`, owner.account, async () => {
    const held = await observe(snapshot, s => s.approval);
    if (!held.done) throw new Error('Held payout not observed');
    const action = await workOrderOwnerAction(owner.rpc, sign, owner.account, id, 'approve');
    if (!action.ownerSucceeded) throw new Error(`Approval not observed: ${JSON.stringify(action)}`);
    const payeeView = await payee.workOrder(id);
    if (payeeView.invoice.status === 'paid') throw new Error('Approval was reported as payment');
    return { payoutCorrelationId: held.value.approval.correlationId, approvalId: held.value.approval.approvalId,
      voteCorrelationId: action.correlationId, payeeSees: payeeView.invoice.status };
  });

  await step(`Provider settles the payout (simulated) and both sides record it${of}`, 'provider', async () => {
    await stack.control('settle', { correlation: approval.payoutCorrelationId });
    const paid = await observe(() => payee.workOrder(id), o => o.invoice?.status === 'paid', { timeoutMs: 60_000 });
    const ownerView = await snapshot();
    if (!paid.done || ownerView.invoice?.status !== 'paid') throw new Error(`Settlement not recorded: payee ${paid.value.invoice?.status}, owner ${ownerView.invoice?.status}`);
    // Exactly one transfer moved, and it paid the order's own amount to the scenario's payee.
    const transfers = await orderTransfers(ownerView.agentId);
    const [paidOut] = transfers;
    if (transfers.length !== 1 || paidOut.status !== 'SUCCESS' || paidOut.recipient !== ctx.scenario.payee || paidOut.amount !== amount || paidOut.correlation !== approval.payoutCorrelationId)
      throw new Error(`Unexpected provider transfers: ${JSON.stringify(transfers)}`);
    return { invoiceId: ownerView.invoice.id, payeeSees: 'paid', ownerSees: 'paid', orderTransfers: 1, paid: { recipient: paidOut.recipient, amount: paidOut.amount }, orderBalance: ownerView.balance };
  });
}
