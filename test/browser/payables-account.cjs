const assert = require('node:assert/strict');
const path = require('node:path');
const { HOST_CAPABILITIES } = require('./fixtures/host.cjs');
const { runTask } = require('./fixtures/task.cjs');
const { rpcValue, rpcAnswer } = require('./fixtures/rpc.cjs');
const { mayCall } = require('@multiagency/sdk');

/**
 * Agent reads are cached per host, agent and signed-in account. When another account signs in on
 * this host (here: the session cookie changes, as from another tab), the open page must never keep
 * showing records read for the earlier account, and a refused decision is not repeated.
 */
const agreement = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', version: 1, at: '2026-10-16T12:00:00Z', recordedBy: 'owner', approved: '0', remaining: '1000000000',
  terms: { payee: 'builder.near', title: 'October engineering', document: 'https://docs.google.com/document/d/example', signedOn: '2026-10-01', start: '2026-10-01', end: '2026-10-31', ceiling: '1000000000', openingApproved: '0', scope: 'Authorized issues on the project board' } };
// Distinct per-account records make any reuse of the earlier account's cache visible.
const payees = { 'owner.near': 'alpha.near', 'other.near': 'beta.near' };
const compensationFor = account => {
  const payee = payees[account];
  const request = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', version: 1, payee, agreementVersion: 1, report: { agreementId: agreement.id, amount: '250000000', start: '2026-10-01', end: '2026-10-16',
    contributions: `Report from ${payee}.`, assessment: 'Fixture assessment.', evidence: ['https://github.com/example/project/pull/42'] }, state: 'submitted', feedback: '', reviewedBy: null, payment: null, at: '2026-10-16T12:00:00Z' };
  return { agreements: [{ ...structuredClone(agreement), terms: { ...agreement.terms, payee } }], requests: [request], history: [], payments: [] };
};
const policy = { policy: { actions: ['transfer'], frozen: false, assets: 'any', owner_approval: true, destinations: { mode: 'only', list: [] }, confidential: true, limits: {}, max_actions_per_hour: null, budget: { daily_usd: null, weekly_usd: null, monthly_usd: null }, timelock_ms: 0 },
  revision: 1, usage: { budget: { daily: { limit_usd: null, spent_usd: '0', remaining_usd: null, resets_at: null }, weekly: { limit_usd: null, spent_usd: '0', remaining_usd: null, resets_at: null }, monthly: { limit_usd: null, spent_usd: '0', remaining_usd: null, resets_at: null } }, timelock: { delay_ms: 0, scheduled_count: 0 } },
  cooldowns: { policy_change_available_at: null, unfreeze_available_at: null }, wallet_id: 'agent.near', status: 'APPLIED', provider_policy_synced: true };

const OWNER = { canSign: true, canPropose: true, canVote: true, canExecute: true, canManage: true };
const READER = { canSign: false, canPropose: false, canVote: false, canExecute: false, canManage: false };

/** One tab on the Payables agent. `state.account` is whoever the session cookie names right now. */
async function openAgent(context, root, state, { access = () => OWNER, records = account => compensationFor(account) } = {}) {
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const reads = [], writes = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const { hostname, pathname } = new URL(route.request().url());
    if (hostname !== 'frontend.test') return route.abort();
    if (pathname === '/gw/logout') { state.account = null; return route.fulfill({ json: {} }); }
    if (pathname === '/gw/me' && state.hold) await state.hold.promise;
    if (pathname === '/gw/me') return route.fulfill({ json: state.account
      ? { capabilities: HOST_CAPABILITIES, agents: [{ name: 'payables', owner: 'owner.near', dao: false }], invoices: null,
        viewer: { account: state.account, access: { payables: access(state.account) } } }
      : { capabilities: HOST_CAPABILITIES, agents: [], invoices: null, viewer: null } });
    if (pathname.includes('/rpc/')) {
      const method = pathname.split('/rpc/')[1];
      if (method === 'compensation/review') {
        writes.push({ method, account: state.account });
        // The gateway decides by the session's own rights: a decision from an account that may not review is refused.
        if (!state.account || !mayCall(access(state.account), method)) return route.fulfill({ status: 403, json: { error: 'Your account cannot do that here.', access: 'procedure' } });
        return route.fulfill({ json: rpcAnswer(method, records(state.account)) });
      }
      reads.push({ method, account: state.account });
      const values = {
        instance: { agentId: 'fixture', executor: true },
        setup: { agentId: 'fixture', executor: true, wallet: 'agent.near', owner: { type: 'near', account_id: 'owner.near', public_key: 'ed25519:fixture' }, grant: { label: 'payout', expiresAt: '2030-01-01T00:00:00Z', id: 'grant-fixture' }, dao: null },
        overview: { agentId: 'fixture', digest: 'sha256:' + 'a'.repeat(64), notInForce: null, agreed: [], unmanaged: [], target: { usdc: 1 }, book: [{ asset: 'usdc', symbol: 'USDC', decimals: 6, public: 0n, confidential: 10000000n, usd: 10, price: 1, priceUpdatedAt: null, priceExpiresAt: null }], policy, rebalance: { minLegUsd: 1, maxCostBps: 100 }, grants: [] },
        'treasury/get': null, 'inbox/list': [], 'workOrders/list': [], 'agreements/list': [], 'owner/actions': [], 'owner/pending': [], held: [], unresolved: [], invoices: [], activity: [], paymentHistory: { items: [], complete: true },
        'compensation/list': records(state.account),
      };
      return route.fulfill({ json: rpcAnswer(method, rpcValue(values, method)) });
    }
    if (pathname.startsWith('/static/')) return route.fulfill({ path: path.join(root, pathname), contentType: pathname.endsWith('.js') ? 'application/javascript' : pathname.endsWith('.css') ? 'text/css' : 'font/woff2' });
    return route.fulfill({ path: path.join(root, 'index.html'), contentType: 'text/html' });
  });
  return { page, reads, writes, errors };
}

async function accountSwitch(browser, root) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const state = { account: 'owner.near' };
  // The other account may read this agent but not review: the refusal follows from its rights.
  const { page, reads, writes, errors } = await openAgent(context, root, state, { access: account => account === 'owner.near' ? OWNER : READER });
  try {
    await page.goto('https://frontend.test/a/payables/');
    await page.getByRole('button', { name: /alpha\.near/ }).click();
    await page.getByText('Report from alpha.near.').waitFor();
    state.account = 'other.near';
    await page.getByLabel('Review feedback', { exact: true }).fill('Not this period.');
    await page.getByRole('button', { name: 'Decline', exact: true }).click();
    await page.getByRole('button', { name: /beta\.near/ }).waitFor();
    assert.equal(await page.getByText(/alpha\.near/).count(), 0, 'no record read for the earlier account remains on the page');
    assert.ok(reads.some(read => read.method === 'compensation/list' && read.account === 'other.near'), 'the new account reads its own records');
    // Give any retry or refetch time to happen before checking that the refused decision went out once.
    await page.waitForTimeout(1500);
    assert.deepEqual(writes, [{ method: 'compensation/review', account: 'other.near' }], 'the refused decision is not repeated');

    // Signing out leaves the agent document; the public page reads no agent records.
    const before = reads.length;
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForURL('https://frontend.test/');
    await page.waitForLoadState('networkidle');
    assert.equal(reads.length, before, 'no agent read after sign-out');
    assert.equal(await page.getByText(/alpha\.near|beta\.near/).count(), 0);
    assert.deepEqual(errors, []);
  } catch (error) {
    console.error('Account switch failure:', { state, reads: reads.slice(-8), writes }, await page.locator('body').innerText().catch(() => ''));
    throw error;
  } finally { await context.close(); }
}
/**
 * Another tab on this origin signs in as a member who can read the same agent but may not review.
 * Without any refused action, this tab must re-read the session promptly, show the member, and never
 * leave the owner's review controls enabled for the member.
 */
async function sharedReader(browser, root) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const state = { account: 'owner.near' };
  const shared = () => compensationFor('owner.near');
  const { page, reads, writes, errors } = await openAgent(context, root, state, { access: account => account === 'owner.near' ? OWNER : READER, records: shared });
  const approve = page.getByRole('button', { name: 'Approve', exact: true });
  try {
    await page.goto('https://frontend.test/a/payables/');
    await page.getByRole('button', { name: /alpha\.near/ }).click();
    await page.getByText('Report from alpha.near.').waitFor();
    assert.equal(await approve.isEnabled(), true, 'the owner may review');

    // Another tab signs in as the member and announces it on this origin. While the session read is
    // pending, the owner's permissions enable nothing.
    state.account = 'member.near';
    let release; state.hold = { promise: new Promise(resolve => { release = resolve; }) };
    const other = await context.newPage();
    await other.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>other tab</title>' }));
    await other.goto('https://frontend.test/elsewhere');
    await other.evaluate(() => new BroadcastChannel('multiagency-session').postMessage('changed'));
    await page.getByText('Checking which account is signed in.', { exact: false }).waitFor({ timeout: 3000 });
    assert.ok(!(await approve.count()) || !(await approve.isEnabled()), 'no permission-dependent control is enabled before the account is confirmed');
    state.hold = null; release();
    await page.getByText('member.near', { exact: true }).first().waitFor({ timeout: 3000 });
    assert.ok(!(await approve.count()) || !(await approve.isEnabled()), 'the member is not shown the owner\'s review control enabled');
    assert.ok(reads.some(read => read.method === 'compensation/list' && read.account === 'member.near'), 'records are read again for the member');

    // Returning to a tab re-reads the session too: the owner signs back in elsewhere, then this tab is focused.
    state.account = 'owner.near';
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => document.body.innerText.includes('owner.near'), null, { timeout: 3000 });
    const request = page.getByRole('button', { name: /alpha\.near/ });
    if (!(await approve.count())) await request.click();
    await approve.waitFor({ state: 'visible' });
    for (let i = 0; !(await approve.isEnabled()); i++) { assert.ok(i < 60, 'the owner regains the review control once confirmed'); await page.waitForTimeout(50); }
    assert.deepEqual(writes, [], 'nothing was sent');
    assert.deepEqual(errors, []);
  } catch (error) {
    console.error('Shared reader failure:', { state, reads: reads.slice(-8), writes }, await page.locator('body').innerText().catch(() => ''));
    throw error;
  } finally { await context.close(); }
}
/**
 * The real announcement: tab B is the app itself, and its Sign out button announces the change. No test code
 * sends the message. Tab A must drop the owner's records and controls promptly without a refused action.
 */
async function realSignOut(browser, root) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const state = { account: 'owner.near' };
  const a = await openAgent(context, root, state);
  try {
    await a.page.goto('https://frontend.test/a/payables/');
    await a.page.getByRole('button', { name: /alpha\.near/ }).click();
    await a.page.getByText('Report from alpha.near.').waitFor();
    const b = await openAgent(context, root, state);
    await b.page.goto('https://frontend.test/a/payables/');
    await b.page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await b.page.waitForURL('https://frontend.test/');
    await a.page.getByText('Report from alpha.near.').waitFor({ state: 'detached', timeout: 3000 });
    assert.equal(await a.page.getByRole('button', { name: 'Approve', exact: true }).count(), 0, 'tab A shows no owner control after tab B signs out');
    assert.deepEqual([...a.writes, ...b.writes], [], 'nothing was sent');
    assert.deepEqual([...a.errors, ...b.errors], []);
  } catch (error) {
    console.error('Real sign-out failure:', { state }, await a.page.locator('body').innerText().catch(() => ''));
    throw error;
  } finally { await context.close(); }
}
runTask([accountSwitch, sharedReader, realSignOut]);
