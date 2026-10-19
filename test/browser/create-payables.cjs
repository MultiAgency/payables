const { HOST_CAPABILITIES } = require('./fixtures/host.cjs');
const { runTask } = require('./fixtures/task.cjs');
const assert = require('node:assert/strict');

async function createPayables(browser, root) {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const requests = [], errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const { hostname, pathname } = new URL(route.request().url());
      if (hostname !== 'frontend.test') return route.abort();
      if (pathname === '/gw/me') return route.fulfill({ json: { capabilities: HOST_CAPABILITIES, selfService: true, agents: [], invoices: null, viewer: { account: 'alice.near', access: {} } } });
      if (pathname === '/gw/payables') {
        requests.push(route.request().postDataJSON());
        return route.fulfill({ status: 503, json: { error: 'Workspace reserved. Continue again to reopen it.' } });
      }
      assert.ok(!pathname.includes('/rpc/'), 'an owner with no agent must not read an existing agent');
      return route.fulfill({ path: pathname.startsWith('/static/') ? root + pathname : root + '/index.html' });
    });
    await page.goto('http://frontend.test/');
    await page.getByRole('heading', { name: 'Set up your Payables agent' }).waitFor();
    await page.getByRole('button', { name: 'Continue to Payables setup' }).click();
    await page.getByText('Workspace reserved. Continue again to reopen it.').waitFor();
    assert.deepEqual(requests, [{ kind: 'wallet', owner: 'alice.near' }]);
    await page.getByRole('radio', { name: 'Sputnik DAO', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Continue to Payables setup' }).isDisabled(), true);
    await page.getByLabel('DAO account', { exact: true }).fill('team.sputnik-dao.near');
    await page.getByRole('button', { name: 'Continue to Payables setup' }).click();
    await page.getByText('Workspace reserved. Continue again to reopen it.').waitFor();
    assert.deepEqual(requests[1], { kind: 'dao', owner: 'team.sputnik-dao.near' });
    assert.equal(await page.getByLabel('DAO account', { exact: true }).inputValue(), 'team.sputnik-dao.near');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `/tmp/payables-onboarding-${width}.png`, fullPage: true });
    await page.close();
  }
}
runTask([createPayables]);
