const { HOST_CAPABILITIES } = require('./fixtures/host.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runTask } = require('./fixtures/task.cjs');
const { rpcValue, rpcAnswer } = require('./fixtures/rpc.cjs');
const { assertHidden } = require('./fixtures/hidden.cjs');

/**
 * Recurring builder payouts on the shared payout agent: one-time setup (agent, builder in the signed policy,
 * grant, funding) is shown apart from each report's steps (review, prepare shared, send, approve, settle).
 */
const agreement = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', version: 1, at: '2026-10-16T12:00:00Z', recordedBy: 'owner', approved: '25000000', remaining: '15000000',
  terms: { payee: 'builder.near', title: 'October design support', document: 'https://example.org/agreements/october-design', signedOn: '2026-10-01', start: '2026-10-01', end: '2026-10-31', ceiling: '40000000', openingApproved: '0', scope: 'Design reviews and delivery assets' } };
const policyWith = list => ({ policy: { actions: ['transfer'], frozen: false, assets: 'any', owner_approval: true, destinations: { mode: 'only', list }, confidential: true, limits: {}, max_actions_per_hour: null, budget: { daily_usd: null, weekly_usd: null, monthly_usd: null }, timelock_ms: 0 },
  revision: 1, usage: { budget: { daily: { limit_usd: null, spent_usd: '0', remaining_usd: null, resets_at: null }, weekly: { limit_usd: null, spent_usd: '0', remaining_usd: null, resets_at: null }, monthly: { limit_usd: null, spent_usd: '0', remaining_usd: null, resets_at: null } }, timelock: { delay_ms: 0, scheduled_count: 0 } },
  cooldowns: { policy_change_available_at: null, unfreeze_available_at: null }, wallet_id: 'agent.near', status: 'APPLIED', provider_policy_synced: true });

async function open(browser, root, { destinations, link = false }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(10000);
  // A fresh ordinary report, already approved at 25 (no amount of its own), with no payment yet.
  const r = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', version: 2, payee: 'builder.near', agreementVersion: 1, report: { agreementId: agreement.id, start: '2026-10-01', end: '2026-10-15', contributions: 'Reviewed onboarding screens and delivered the icon set.', assessment: 'Delivered on schedule.', evidence: ['https://example.org/deliverables/icons'] },
    state: 'approved', approvedAmount: '25000000', feedback: 'Accepted.', reviewedBy: 'owner.near', payment: null, at: '2026-10-16T12:00:00Z' };
  const view = { agreements: [structuredClone(agreement)], requests: [r], history: [], payments: [] };
  const calls = [], commands = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()), p = url.pathname;
    if (url.hostname !== 'frontend.test') return route.abort();
    if (p === '/gw/me') return route.fulfill({ json: { capabilities: HOST_CAPABILITIES, agents: [{ name: 'payables', owner: 'owner.near', dao: false }], invoices: null, viewer: { account: 'owner.near', access: { payables: { canSign: true, canPropose: true, canVote: true, canExecute: true, canManage: true } } } } });
    if (p.includes('/rpc/')) {
      const method = p.split('/rpc/')[1]; calls.push(method);
      if (method === 'compensation/prepare') {
        const c = route.request().postDataJSON().json; commands.push(c);
        r.version++; r.payment = { mode: c.command.mode, id: r.id };
        view.payments = [{ requestId: r.id, invoiceId: 'a'.repeat(32), status: 'PREPARED', correlationId: null, refused: null }];
        return route.fulfill({ json: rpcAnswer(method, view) });
      }
      if (method === 'compensation/send') {
        commands.push(route.request().postDataJSON().json);
        Object.assign(view.payments[0], { status: 'PENDING_APPROVAL', correlationId: 'shared-payout' });
        return route.fulfill({ json: rpcAnswer(method, view) });
      }
      const values = {
        instance: { agentId: 'fixture', executor: true },
        setup: { agentId: 'fixture', executor: true, wallet: 'agent.near', owner: { type: 'near', account_id: 'owner.near', public_key: 'ed25519:fixture' }, grant: { label: 'payout', expiresAt: '2030-01-01T00:00:00Z', id: 'grant-fixture' }, dao: null },
        overview: { agentId: 'fixture', digest: 'sha256:' + 'a'.repeat(64), notInForce: null, agreed: [], unmanaged: [], target: { usdc: 1 }, book: [{ asset: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', symbol: 'USDC', decimals: 6, public: 0n, confidential: 40000000n, usd: 40, price: 1, priceUpdatedAt: null, priceExpiresAt: null }], policy: policyWith(destinations), rebalance: { minLegUsd: 1, maxCostBps: 100 }, grants: [] },
        'treasury/get': null, 'inbox/list': [], 'workOrders/list': [], 'agreements/list': [], 'owner/actions': [], 'owner/pending': [], held: [], unresolved: [], invoices: [], activity: [], paymentHistory: { items: [], complete: true }, 'compensation/list': view,
      };
      return route.fulfill({ json: rpcAnswer(method, rpcValue(values, method)) });
    }
    if (p.startsWith('/static/')) return route.fulfill({ path: path.join(root, p), contentType: p.endsWith('.js') ? 'application/javascript' : p.endsWith('.css') ? 'text/css' : 'font/woff2' });
    return route.fulfill({ path: path.join(root, 'index.html'), contentType: 'text/html' });
  });
  // A deep link opens the request without a click; otherwise the owner selects it.
  if (link) await page.goto(`https://frontend.test/a/payables/?request=${link === true ? r.id : link}`);
  else { await page.goto('https://frontend.test/a/payables/'); await page.getByRole('button', { name: /builder\.near/ }).click(); }
  return { page, r, view, calls, commands, errors };
}

const setupItem = (page, label) => page.getByRole('list', { name: 'Shared payout setup' }).getByRole('listitem').filter({ hasText: label });

async function recurringSteps(browser, root) {
  const { page, r, view, calls, commands, errors } = await open(browser, root, { destinations: [{ action: 'transfer', address: 'builder.near', confidential: true }] });
  // One-time setup is complete and shown apart from this report's steps.
  for (const label of ['Payout agent', 'Builder in the signed policy', 'Payout grant', 'Funding']) await setupItem(page, label).getByText('Ready', { exact: true }).waitFor();
  // The isolated order is the default; shared is an explicit choice that names its tradeoff.
  await page.getByText('Isolated order (default)', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Prepare isolated order', exact: true }).waitFor();
  await assertHidden(page.getByRole('button', { name: 'Prepare shared payout', exact: true }), 'the shared payout is opened only on demand');
  await page.getByText('Shared payout instead', { exact: true }).click();
  await page.getByText(/if one send's reply is lost, every shared payout pauses until that payment is reviewed/).waitFor();
  await page.getByRole('button', { name: 'Prepare shared payout', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Prepare shared payout', exact: true }).click();
  for (let i = 0; !commands.length; i++) { assert.ok(i < 100, 'the shared preparation was sent'); await page.waitForTimeout(50); }
  // From preparation on, the request links to its own payment record: by invoice until a payout correlation exists.
  const paymentLink = page.getByRole('link', { name: 'Open this payment', exact: true });
  await paymentLink.waitFor();
  assert.equal(await paymentLink.getAttribute('href'), `/a/payables/follow/payment?invoice=${'a'.repeat(32)}`);
  const [prepare] = commands;
  assert.equal(prepare.command.mode, 'shared'); assert.equal(prepare.command.id, r.id);
  assert.deepEqual(Object.keys(prepare.command).sort(), ['commandId', 'expectedVersion', 'id', 'mode'], 'a shared preparation carries no order deadline');
  await page.waitForFunction(() => document.querySelector('[aria-label="Steps for this report"] [aria-current="step"]')?.textContent?.startsWith('3.'));
  assert.equal(calls.filter(c => c === 'compensation/send').length, 0, 'preparing sends nothing');

  await page.getByRole('button', { name: 'Review payment submission', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send payment', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Steps for this report"] [aria-current="step"]')?.textContent?.startsWith('4.'));
  assert.equal(await page.getByRole('link', { name: 'Review the held payout', exact: true }).getAttribute('href'), '/a/payables/follow/payment?payment=shared-payout');
  assert.equal(await paymentLink.getAttribute('href'), '/a/payables/follow/payment?payment=shared-payout', 'once sent, by its payout correlation');
  // An unknown outcome is not a step: the screen says to follow the record and that nothing is resent.
  view.payments[0].status = 'UNKNOWN';
  await page.getByRole('button', { name: 'Refresh requests', exact: true }).click();
  await page.getByText(/Outcome unknown: this shared payout may have been submitted\. Shared payouts wait until it is reviewed\. Nothing is sent again\./).waitFor();
  assert.equal(await paymentLink.getAttribute('href'), '/a/payables/follow/payment?payment=shared-payout', 'an unknown payment stays reachable');
  assert.equal(await page.locator('[aria-label="Steps for this report"] [aria-current="step"]').count(), 0);
  // Settlement is recorded separately from the owner's approval.
  view.payments[0].status = 'SUCCESS';
  await page.getByRole('button', { name: 'Refresh requests', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Steps for this report"] [aria-current="step"]'));
  assert.equal(await paymentLink.getAttribute('href'), '/a/payables/follow/payment?payment=shared-payout', 'a paid request stays linked to its payment');
  assert.deepEqual([calls.filter(c => c === 'compensation/prepare').length, calls.filter(c => c === 'compensation/send').length], [1, 1], 'one preparation and one submission per report');
  assert.ok(!calls.some(c => /^workOrders\/(create|prepare|submit|deposit|file)$/.test(c) || c === 'deposit'), 'a shared payout creates no order agent, grant or deposit');
  assert.deepEqual(errors, []);
  await page.close();
}

async function setupMissing(browser, root) {
  const { page, calls, errors } = await open(browser, root, { destinations: [] });
  await setupItem(page, 'Builder in the signed policy').getByText('Needed', { exact: true }).waitFor();
  assert.equal(await setupItem(page, 'Builder in the signed policy').getByRole('link').getAttribute('href'), '/a/payables/payees');
  await page.getByText('Shared payout instead', { exact: true }).click();
  await page.getByText(/The shared payout needs its one-time setup: Add builder\.near as a confidential destination\./).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Prepare shared payout', exact: true }).isDisabled(), true, 'no shared payout before setup');
  assert.equal(calls.filter(c => c === 'compensation/prepare').length, 0);
  assert.deepEqual(errors, []);
  await page.close();
}

async function deepLink(browser, root) {
  const { page, errors } = await open(browser, root, { destinations: [], link: true });
  await page.getByText('Reviewed onboarding screens and delivered the icon set.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /builder\.near/ }).getAttribute('aria-pressed'), 'true', 'the linked request is the selected one');
  assert.deepEqual(errors, []);
  await page.close();
}

/** A link to a request this agent doesn't hold selects nothing and says so. */
async function deepLinkMissing(browser, root) {
  const page = (await open(browser, root, { destinations: [], link: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })).page;
  await page.getByText("This link names a request that isn't recorded for this agent. Nothing is selected.", { exact: true }).waitFor();
  assert.equal(await page.locator('button[aria-pressed="true"]').count(), 0, 'no other request is selected');
  await page.getByText('Evidence before execution.', { exact: true }).waitFor();
  await page.close();
}

runTask([recurringSteps, setupMissing, deepLink, deepLinkMissing]);
