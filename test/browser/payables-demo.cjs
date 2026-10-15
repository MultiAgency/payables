const { runTask } = require('./fixtures/task.cjs');
const assert = require('node:assert/strict');
async function standaloneDemo(browser, root) {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    const requests = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'frontend.test') return route.abort();
      if (url.pathname === '/gw/me') return route.fulfill({ json: { selfService: true, agents: [], invoices: null, viewer: null } });
      if (url.pathname.startsWith('/gw/') || url.pathname.includes('/rpc/')) { requests.push(url.pathname); return route.abort(); }
      return route.fulfill({ path: url.pathname.startsWith('/static/') ? root + url.pathname : root + '/index.html' });
    });
    await page.goto('http://frontend.test/');
    await page.getByRole('heading', { name: 'Payments with permission built in.' }).waitFor();
    const preview = page.getByRole('region', { name: 'Interactive preview' });
    for (const flow of ['dao', 'po']) {
      await page.getByRole('radio', { name: flow === 'dao' ? /Confidential DAO payments/ : /Purchase-order agents/ }).click();
      const actions = flow === 'dao' ? ['Submit example invoice', 'Check the agreement', 'Record first approval', 'Record second approval', 'Show example outcome'] : ['Create example order', 'Fund example agent', 'Check example invoice', 'Show approved example payout', 'Close the grant window'];
      for (const action of actions) await page.getByRole('button', { name: action, exact: true }).click();
      await preview.getByText('Preview complete', { exact: true }).waitFor();
      for (let scenario = 1; scenario < (flow === 'dao' ? 3 : 4); scenario++) {
        await page.getByLabel('Try a scenario').selectOption(String(scenario));
        for (const action of actions.slice(0, flow === 'dao' ? 2 : 3)) await page.getByRole('button', { name: action, exact: true }).click();
        await page.getByText('The agreement stops this request.').waitFor();
        assert.equal(await page.getByRole('button', { name: actions.at(-1), exact: true }).count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
    }
    assert.deepEqual(requests, [], 'preview must never call an execution or sign-in API');
    assert.deepEqual(errors, []);
    await page.getByLabel('Try a scenario').selectOption('0');
    await page.screenshot({ path: `/tmp/payables-lyra-${width}.png`, fullPage: true });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.documentElement.classList.contains('dark') && getComputedStyle(document.querySelector('[data-slot=toggle-group-item][data-state=off]')).color === getComputedStyle(document.body).color);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `/tmp/payables-lyra-dark-${width}.png`, fullPage: true });
    await page.close();
  }
}
runTask([standaloneDemo]);
