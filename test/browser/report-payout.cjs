const { workOrderProgress } = require('./fixtures/outputs.cjs');
const { HOST_CAPABILITIES } = require('./fixtures/host.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runTask } = require('./fixtures/task.cjs');
const { rpcValue, rpcAnswer } = require('./fixtures/rpc.cjs');
const { assertResponsive } = require('./fixtures/layout.cjs');
const agreement = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', version: 1, at: '2026-10-16T12:00:00Z', recordedBy: 'owner', approved: '0', remaining: '1000000000', terms: { payee: 'builder.near', title: 'October engineering', document: 'https://docs.google.com/document/d/example', signedOn: '2026-10-01', start: '2026-10-01', end: '2026-10-31', ceiling: '1000000000', openingApproved: '0', scope: 'Authorized issues' } };
const report = { agreementId: agreement.id, start: '2026-10-01', end: '2026-10-16', contributions: 'Shipped the integration and acceptance tests.', assessment: 'Removed the manual handoff.', evidence: ['https://github.com/example/project/pull/42'] };
async function reportFirst(browser, root) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  page.setDefaultTimeout(10000);
  let requests = [], receipts = new Map(), attempts = [], lost = true, payments = [];
  await page.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.hostname !== 'invoice.test') return route.abort();
    if (u.pathname === '/api/compensation/session') return route.fulfill({ json: { account: 'builder.near' } });
    if (u.pathname === '/api/compensation') {
      if (route.request().method() === 'GET') return route.fulfill({ json: { account: 'builder.near', agreements: [agreement], requests, history: [], payments } });
      const c = route.request().postDataJSON(); attempts.push(c);
      assert.equal(c.report.amount, undefined);
      if (!receipts.has(c.commandId)) { requests = [{ id: c.id, version: 1, payee: 'builder.near', agreementVersion: 1, report: c.report, state: 'submitted', feedback: '', reviewedBy: null, payment: null, at: '2026-10-16T12:00:00Z' }]; receipts.set(c.commandId, requests[0]); }
      if (lost) { lost = false; return route.fulfill({ status: 503, json: { error: 'Response lost. Retry this report.' } }); }
      return route.fulfill({ json: receipts.get(c.commandId) });
    }
    if (u.pathname.startsWith('/static/')) return route.fulfill({ path: path.join(root, u.pathname), contentType: u.pathname.endsWith('.js') ? 'application/javascript' : u.pathname.endsWith('.css') ? 'text/css' : 'font/woff2' });
    return route.fulfill({ path: path.join(root, 'contributor.html'), contentType: 'text/html' });
  });
  await page.goto('https://invoice.test/report');
  await page.getByRole('button', { name: 'New report', exact: true }).click();
  assert.equal(await page.getByLabel('Amount requested · USDC').count(), 0);
  await page.getByLabel('Contributions', { exact: true }).fill(report.contributions);
  await page.getByLabel('Assessment', { exact: true }).fill(report.assessment);
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.getByText('Response lost. Retry this report.').waitFor();
  await page.reload();
  await page.getByLabel('Contributions', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.getByText('Compensation in review', { exact: true }).waitFor();
  assert.equal(attempts.length, 2); assert.deepEqual(attempts[0], attempts[1]); assert.equal(requests.length, 1);
  requests[0] = { ...requests[0], version: 2, state: 'approved', approvedAmount: '250000000', feedback: 'Accepted the integration and tests.', reviewedBy: 'owner', payment: { mode: 'isolated', id: requests[0].id, until: '2030-01-01T00:00:00Z' } };
  for (const status of ['preparing', 'waiting', 'unknown', 'failed', 'paid']) {
    payments = [{ requestId: requests[0].id, id: requests[0].id, status }];
    await page.getByRole('button', { name: 'All requests', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('button', { name: /October engineering/ }).click();
    await page.getByText(`Payment status: ${status}.`, { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Revise', exact: true }).count(), 0);
  }
  await assertResponsive(page, 'amount-free report and isolated payout');
  await page.screenshot({ path: '/tmp/payables-report-receive-mobile.png', fullPage: true });
}
async function isolatedReview(browser, root) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, colorScheme: 'dark' });
  page.setDefaultTimeout(10000);
  const r = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', version: 1, payee: 'builder.near', agreementVersion: 1, report, state: 'submitted', feedback: '', reviewedBy: null, payment: null, at: '2026-10-16T12:00:00Z' };
  const view = { agreements: [structuredClone(agreement)], requests: [r], history: [], payments: [] };
  const calls = []; let order, snapshot, preparations = 0;
  await page.route('**/*', route => {
    const u = new URL(route.request().url()), p = u.pathname;
    if (u.hostname !== 'frontend.test') return route.abort();
    if (p === '/gw/me') return route.fulfill({ json: { capabilities: HOST_CAPABILITIES, agents: [{ name: 'payables', owner: 'owner.near', dao: false }], invoices: 'https://invoice.test', viewer: { account: 'owner.near', access: { payables: { canSign: true, canPropose: true, canVote: true, canExecute: true, canManage: true } } } } });
    if (p.includes('/rpc/')) {
      const method = p.split('/rpc/')[1]; calls.push(method);
      const c = route.request().postDataJSON()?.json;
      if (method === 'compensation/review') {
        assert.equal(c.approvedAmount, '250000000'); assert.ok(c.feedback); assert.equal(r.report.amount, undefined);
        r.approvedAmount = c.approvedAmount; r.feedback = c.feedback; r.state = 'approved'; r.version++;
        view.agreements[0].approved = c.approvedAmount; view.agreements[0].remaining = '750000000';
        return route.fulfill({ json: rpcAnswer(method, view) });
      }
      if (method === 'compensation/prepare') {
        assert.equal(c.command.mode, 'isolated'); assert.equal(c.command.id, r.id); preparations++;
        if (!r.payment) { r.payment = { mode: 'isolated', id: r.id, until: c.command.until }; r.version++; return route.fulfill({ status: 503, json: { message: 'Preparation interrupted. Refresh this request.', code: 'SERVICE_UNAVAILABLE' } }); }
        assert.equal(c.command.until, r.payment.until);
        order = { version: 1, id: r.id, parentAgentId: 'fixture', payee: r.payee, amount: r.approvedAmount, asset: 'usdc', note: 'Accepted October report', until: r.payment.until, createdAt: r.at, owner: { type: 'near', account_id: 'owner.near', public_key: 'fixture' } };
        snapshot = { order, agentId: null, wallet: null, balance: null, policyReady: false, grant: null, invoice: null, ownerActions: [], approval: null, error: null, executor: true };
        return route.fulfill({ json: rpcAnswer(method, view) });
      }
      if (method === 'workOrders/file') {
        assert.deepEqual(c, { id: r.id });
        snapshot.invoice = { id: 'retained-invoice', amount: order.amount, note: order.note, filedAt: r.at, status: 'unknown', revisionConflict: false };
        return route.fulfill({ status: 503, json: { message: 'Submission response lost. Follow this payout.', code: 'SERVICE_UNAVAILABLE' } });
      }
      const values = {
        instance: { agentId: 'fixture', executor: true }, setup: { agentId: 'fixture', executor: true, wallet: 'agent.near', owner: { type: 'near', account_id: 'owner.near', public_key: 'ed25519:fixture' }, grant: null, dao: null },
        overview: { agentId: 'fixture', digest: 'sha256:' + 'a'.repeat(64), notInForce: null, agreed: [], unmanaged: [], target: { usdc: 1 }, book: [], policy: { policy: { actions: ['transfer'], frozen: false, assets: 'any', owner_approval: true, destinations: { mode: 'only', list: [] }, confidential: true, limits: {}, max_actions_per_hour: null, budget: { daily_usd: null, weekly_usd: null, monthly_usd: null }, timelock_ms: 0 }, revision: 1, usage: { budget: { daily: { limit_usd: null, spent_usd: '0', remaining_usd: null, resets_at: null }, weekly: { limit_usd: null, spent_usd: '0', remaining_usd: null, resets_at: null }, monthly: { limit_usd: null, spent_usd: '0', remaining_usd: null, resets_at: null }}, timelock: { delay_ms: 0, scheduled_count: 0 } }, cooldowns: { policy_change_available_at: null, unfreeze_available_at: null}, wallet_id: 'agent.near', status: 'APPLIED', provider_policy_synced: true }, rebalance: { minLegUsd: 1, maxCostBps: 100 }, grants: [] },
        'treasury/get': null, 'inbox/list': [], 'workOrders/list': order ? [order] : [], 'workOrders/get': snapshot && { ...snapshot, progress: workOrderProgress(snapshot) }, 'agreements/list': [], 'owner/actions': [], 'owner/pending': [], held: [], unresolved: [], invoices: [], activity: [], paymentHistory: { items: [], complete: true }, 'compensation/list': view,
      };
      return route.fulfill({ json: rpcAnswer(method, rpcValue(values, method)) });
    }
    if (p.startsWith('/static/')) return route.fulfill({ path: path.join(root, p), contentType: p.endsWith('.js') ? 'application/javascript' : p.endsWith('.css') ? 'text/css' : 'font/woff2' });
    return route.fulfill({ path: path.join(root, 'index.html'), contentType: 'text/html' });
  });
  await page.goto('https://frontend.test/a/payables/');
  await page.getByRole('button', { name: /builder.near Report/ }).click();
  assert.equal(await page.getByRole('button', { name: 'Approve', exact: true }).isDisabled(), true);
  await page.getByLabel('Compensation · USDC', { exact: true }).fill('250');
  await page.getByLabel('Review feedback', { exact: true }).fill('Accepted the integration and tests.');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Approve compensation', exact: true }).click();
  await page.getByText(/Compensation is approved and counted/).waitFor();
  assert.ok(!calls.includes('workOrders/file'));
  // The isolated order is the default payout path.
  await page.getByText('Isolated order (default)', { exact: true }).waitFor();
  await page.getByLabel('Isolated order payment deadline (UTC)').fill('2026-11-15T12:00');
  await page.getByRole('button', { name: 'Prepare isolated order', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Prepare payout', exact: true }).click();
  // A lost preparation answer is an unknown outcome: the retained request is read again, never re-sent.
  await page.getByText(/The outcome is unknown: this compensation\/prepare request may have taken effect/).waitFor();
  await page.getByRole('button', { name: 'Refresh requests', exact: true }).click();
  await page.getByRole('button', { name: 'Resume preparation', exact: true }).click();
  await page.getByText('Next: authorize the dedicated agent.').waitFor();
  snapshot.agentId = 'isolated-agent'; snapshot.policyReady = true; snapshot.balance = '0';
  await page.getByRole('button', { name: 'Refresh work order', exact: true }).click();
  await page.getByText('Next: authorize its expiring grant.').waitFor();
  snapshot.grant = { id: 'isolated-grant', expiresAt: order.until };
  await page.getByRole('button', { name: 'Refresh work order', exact: true }).click();
  await page.getByText('Next: fund this payout.').waitFor();
  snapshot.balance = '250000001';
  await page.getByRole('button', { name: 'Refresh work order', exact: true }).click();
  await page.getByText(/Excess funding: 0.000001 USDC/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Submit payout', exact: true }).count(), 0);
  snapshot.balance = order.amount;
  await page.getByRole('button', { name: 'Refresh work order', exact: true }).click();
  await page.getByRole('button', { name: 'Submit payout', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(calls.filter(c => c === 'workOrders/file').length, 0);
  await page.getByRole('button', { name: 'Submit payout', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit payout', exact: true }).click();
  await page.getByText(/The outcome is unknown: this workOrders\/file request may have taken effect/).waitFor();
  await page.getByRole('button', { name: 'Refresh work order', exact: true }).click();
  await page.getByText(/Follow this retained payment before any further action/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Submit payout', exact: true }).count(), 0);
  snapshot.invoice.status = 'paid'; snapshot.balance = '0';
  await page.getByRole('button', { name: 'Refresh work order', exact: true }).click();
  await page.getByText('Recorded payment: paid').waitFor();
  assert.equal(await page.getByText(/The outcome is unknown: this workOrders\/file request/).count(), 0);
  assert.equal(view.agreements[0].remaining, '750000000'); assert.equal(preparations, 2);
  assert.equal(calls.filter(c => c === 'workOrders/file').length, 1);
  await assertResponsive(page, 'integrated isolated payout');
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({ path: '/tmp/payables-report-isolated-owner.png', fullPage: true });
}
runTask([reportFirst, isolatedReview]);
