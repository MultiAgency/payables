const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { runTask } = require('./fixtures/task.cjs');
const { rpcValue } = require('./fixtures/rpc.cjs');
const { assertResponsive } = require('./fixtures/layout.cjs');

const agreement = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', version: 1, at: '2026-10-16T12:00:00Z', recordedBy: 'owner', approved: '0', remaining: '1000000000',
  terms: { payee: 'builder.near', title: 'October engineering', document: 'https://docs.google.com/document/d/example', signedOn: '2026-10-01', start: '2026-10-01', end: '2026-10-31', ceiling: '1000000000', openingApproved: '0', scope: 'Authorized issues on the project board' } };
async function contributor(browser, root) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, colorScheme: 'dark' });
  page.setDefaultTimeout(10000);
  let requests = [], history = [], payments = [], account = 'builder.near', failed = false;
  const writes = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()), p = url.pathname;
    if (url.hostname !== 'invoice.test') return route.abort();
    if (p === '/api/compensation/session') return route.fulfill({ json: { account } });
    if (p === '/api/signout') { account = null; return route.fulfill({ json: { account: null } }); }
    if (p === '/api/compensation') {
      if (failed) return route.fulfill({ status: 503, json: { error: 'Request records unavailable. Keep your draft.' } });
      if (route.request().method() === 'GET') return route.fulfill({ json: { account, agreements: [agreement], requests, history, payments } });
      const c = route.request().postDataJSON(); writes.push(c);
      const existing = requests.find(r => r.id === c.id);
      assert.equal(c.expectedVersion, existing?.version ?? 0);
      const r = { id: c.id, version: c.expectedVersion + 1, payee: 'builder.near', agreementVersion: 1, report: c.report, state: c.submit ? 'submitted' : 'draft', feedback: '', reviewedBy: null, payment: null, at: '2026-10-16T12:00:00Z' };
      requests = [r]; history.push({ sequence: history.length + 1, actor: 'builder.near', record: structuredClone(r) });
      return route.fulfill({ json: r });
    }
    if (p.startsWith('/static/')) return route.fulfill({ path: path.join(root, p), contentType: p.endsWith('.js') ? 'application/javascript' : p.endsWith('.css') ? 'text/css' : 'font/woff2' });
    return route.fulfill({ path: path.join(root, 'contributor.html'), contentType: 'text/html' });
  });
  await page.goto('https://invoice.test/report');
  await page.getByRole('button', { name: 'New report' }).click();
  await page.getByLabel('Submission type', { exact: true }).selectOption('invoice');
  await page.getByLabel('Amount requested · USDC').fill('250');
  await page.getByLabel('Contributions', { exact: true }).fill('Shipped the authorized wallet integration. PR #42 includes tests and migration notes.');
  await page.getByLabel('Assessment', { exact: true }).fill('The new flow removes the manual handoff. All requested acceptance checks pass.');
  await page.getByLabel('Evidence links').fill('https://github.com/example/project/pull/42');
  await page.reload();
  await page.getByLabel('Contributions', { exact: true }).waitFor();
  assert.match(await page.getByLabel('Contributions', { exact: true }).inputValue(), /wallet integration/);
  await page.getByRole('button', { name: 'Back to requests', exact: true }).click();
  await page.getByRole('button', { name: 'Resume draft', exact: true }).click();
  assert.match(await page.getByLabel('Contributions', { exact: true }).inputValue(), /wallet integration/);
  await assertResponsive(page, 'report composer');
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({ path: '/tmp/payables-report-composer-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/payables-report-composer-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.getByText('Submitted for compensation review. Nothing has been sent for payment.').waitFor();
  assert.equal(writes.length, 1); assert.equal(writes[0].report.amount, '250000000');
  const original = requests[0].id;
  requests[0] = { ...requests[0], version: 2, state: 'changes_requested', feedback: 'Please request 200 USDC for the accepted scope.', reviewedBy: 'owner' };
  history.push({ sequence: 2, actor: 'owner', record: structuredClone(requests[0]) });
  await page.getByRole('button', { name: 'All requests' }).click();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('button', { name: /October engineering/ }).click();
  await page.getByText('Please request 200 USDC for the accepted scope.').first().waitFor();
  await page.getByRole('button', { name: 'Revise' }).click();
  await page.getByLabel('Amount requested · USDC').fill('200');
  failed = true;
  await page.getByRole('button', { name: 'Resubmit' }).click();
  await page.getByText('Request records unavailable. Keep your draft.').waitFor();
  assert.equal(await page.getByLabel('Amount requested · USDC').inputValue(), '200');
  failed = false;
  await page.getByRole('button', { name: 'Resubmit' }).click();
  await page.getByRole('button', { name: 'All requests' }).waitFor();
  assert.equal(requests[0].id, original); assert.equal(requests[0].report.amount, '200000000');
  assert.ok(writes.every(w => w.report.agreementId === agreement.id));
  requests[0] = { ...requests[0], version: requests[0].version + 1, state: 'approved', payment: { mode: 'shared', id: requests[0].id }, reviewedBy: 'owner' };
  for (const status of ['PENDING_APPROVAL', 'UNKNOWN', 'FAILED', 'SUCCESS']) {
    payments = [{ requestId: original, id: 'retained-invoice', status }];
    await page.getByRole('button', { name: 'All requests' }).click();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('button', { name: /October engineering/ }).click();
    await page.getByText(`Payment status: ${status.replaceAll('_', ' ')}.`, { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Revise', exact: true }).count(), 0);
    assert.equal(requests.length, 1);
  }
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).waitFor();
  assert.equal(await page.getByText('Shipped the authorized wallet integration.', { exact: false }).count(), 0);
  assert.deepEqual(errors, []);
}

async function owner(browser, root) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, colorScheme: 'dark' });
  page.setDefaultTimeout(12000);
  const r = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', version: 1, payee: 'builder.near', agreementVersion: 1, report: { agreementId: agreement.id, amount: '250000000', start: '2026-10-01', end: '2026-10-16', contributions: 'Shipped the wallet integration with acceptance tests.', assessment: 'The new flow removes the manual handoff.', evidence: ['https://github.com/example/project/pull/42'] }, state: 'submitted', feedback: '', reviewedBy: null, payment: null, at: '2026-10-16T12:00:00Z' };
  const view = { agreements: [structuredClone(agreement)], requests: [r], history: [], payments: [] };
  const calls = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()), p = url.pathname;
    if (url.hostname !== 'frontend.test') return route.abort();
    if (p === '/gw/me') return route.fulfill({ json: { agents: [{ name: 'payables', owner: 'owner.near', dao: false }], invoices: null, viewer: { account: 'owner.near', access: { payables: { canSign: true, canPropose: true, canVote: true, canExecute: true, canManage: true } } } } });
    if (p.includes('/rpc/')) {
      const method = p.split('/rpc/')[1]; calls.push(method);
      if (method === 'compensation/prepare') {
        const c = route.request().postDataJSON().json.command;
        assert.equal(c.id, r.id); assert.equal(c.mode, 'shared');
        r.version++; r.payment = { mode: 'shared', id: r.id };
        view.payments = [{ requestId: r.id, invoiceId: 'retained-invoice', status: 'PREPARED', correlationId: null, refused: null }];
        // Persisted preparation, lost response: recovery must read this identity.
        return route.fulfill({ status: 503, json: { message: 'Preparation response lost. Refresh the retained request.', code: 'SERVICE_UNAVAILABLE' } });
      }
      if (method === 'compensation/send') {
        assert.equal(route.request().postDataJSON().json.id, r.id);
        view.payments[0].status = 'PENDING_APPROVAL';
        view.payments[0].correlationId = 'retained-operation';
        return route.fulfill({ status: 503, json: { message: 'Submission response lost. Refresh the retained payment.', code: 'SERVICE_UNAVAILABLE' } });
      }
      if (method === 'compensation/review') {
        const c = route.request().postDataJSON().json;
        assert.equal(c.expectedVersion, r.version); assert.equal(c.decision, 'approved');
        r.state = 'approved'; r.version++; r.reviewedBy = 'owner.near'; view.agreements[0].approved = r.report.amount; view.agreements[0].remaining = '750000000';
        return route.fulfill({ json: { json: view } });
      }
      const values = {
        instance: { agentId: 'fixture', executor: true },
        setup: { agentId: 'fixture', executor: true, wallet: 'agent.near', owner: { type: 'near', account_id: 'owner.near' }, grant: { label: 'payout', expiresAt: '2030-01-01T00:00:00Z' }, dao: null },
        overview: { agentId: 'fixture', digest: 'sha256:' + 'a'.repeat(64), notInForce: null, agreed: [], unmanaged: [], target: { usdc: 1 }, book: [{ asset: 'usdc', symbol: 'USDC', decimals: 6, public: '0', confidential: '10000000', usd: 10, price: 1 }], policy: { policy: { actions: ['transfer'], frozen: false, assets: 'any', owner_approval: true, destinations: { mode: 'only', list: [] } }, revision: 1, usage: { budget: {} }, cooldowns: {} } },
        'treasury/get': null, 'inbox/list': [], 'workOrders/list': [], 'agreements/list': [], 'owner/actions': [], 'owner/pending': [], held: [], unresolved: [], invoices: [], activity: [], paymentHistory: { items: [], complete: true }, 'compensation/list': view,
      };
      return route.fulfill({ json: { json: rpcValue(values, method) } });
    }
    if (p.startsWith('/static/')) return route.fulfill({ path: path.join(root, p), contentType: p.endsWith('.js') ? 'application/javascript' : p.endsWith('.css') ? 'text/css' : 'font/woff2' });
    return route.fulfill({ path: path.join(root, 'index.html'), contentType: 'text/html' });
  });
  await page.goto('https://frontend.test/a/payables/');
  await page.getByRole('button', { name: /builder.near.*250/ }).click();
  await page.getByText('Shipped the wallet integration with acceptance tests.').waitFor();
  await page.getByLabel('Compensation · USDC', { exact: true }).fill('1250');
  await page.getByRole('button', { name: 'Refresh requests', exact: true }).click();
  await page.getByText(/Compensation exceeds the remaining ceiling by 250 USDC/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Approve', exact: true }).isDisabled(), true);
  await page.getByLabel('Compensation · USDC', { exact: true }).fill('250');
  await page.getByRole('button', { name: 'Refresh requests', exact: true }).click();
  await assertResponsive(page, 'owner review');
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({ path: '/tmp/payables-owner-review-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(calls.filter(c => c === 'compensation/review').length, 0);
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Approve compensation', exact: true }).click();
  await page.getByText(/Compensation is approved and counted/).waitFor();
  assert.equal(calls.filter(c => c === 'compensation/review').length, 1);
  assert.ok(!calls.includes('compensation/send') && !calls.includes('pay'));
  // A previously prepared shared payout remains recoverable without changing its path.
  r.payment = { mode: 'shared', id: r.id };
  view.payments = [{ requestId: r.id, invoiceId: 'retained-invoice', status: 'PREPARED', correlationId: null, refused: null }];
  await page.getByRole('button', { name: 'Refresh requests', exact: true }).click();
  await page.getByRole('button', { name: 'Review payment submission', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(calls.filter(c => c === 'compensation/send').length, 0);
  await page.getByRole('button', { name: 'Review payment submission', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send payment', exact: true }).click();
  await page.getByText(/Submission response lost/).waitFor();
  for (const status of ['PENDING_APPROVAL', 'UNKNOWN', 'FAILED', 'SUCCESS']) {
    view.payments[0].status = status;
    await page.getByRole('button', { name: 'Refresh requests', exact: true }).click();
    await page.getByText(`Payment: ${status}.`, { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Prepare shared payout', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Review payment submission', exact: true }).count(), 0);
    assert.equal(view.agreements[0].remaining, '750000000');
    assert.equal(view.payments[0].invoiceId, 'retained-invoice');
  }
  assert.equal(calls.filter(c => c === 'compensation/prepare').length, 0);
  assert.equal(calls.filter(c => c === 'compensation/send').length, 1);
  assert.deepEqual(errors, []);
}
runTask([contributor, owner]);
