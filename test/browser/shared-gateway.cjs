const { runTask } = require('./fixtures/task.cjs');
const assert = require('node:assert/strict');

async function hostedFailure(browser, root) {
  for (const discovery of [{ body: '<html>fallback</html>', contentType: 'text/html' }, { body: '{bad', contentType: 'application/json' }, { json: {} }]) {
    const page = await browser.newPage();
    const privateCalls = [];
    await page.route('**/*', route => {
      const { hostname, pathname } = new URL(route.request().url());
      if (hostname !== 'frontend.test') return route.abort();
      if (pathname === '/gw/me') return route.fulfill(discovery);
      if (pathname.includes('/rpc') || pathname.startsWith('/gw/')) { privateCalls.push(pathname); return route.abort(); }
      return route.fulfill({ path: pathname.startsWith('/static/') ? root + pathname : root + '/index.html' });
    });
    await page.goto('http://frontend.test/a/own-alice/');
    await page.getByRole('heading', { name: 'Dashboard unavailable' }).waitFor();
    assert.deepEqual(privateCalls, []);
    await page.close();
  }
}
async function sharedSetup(browser, root) {
  const page = await browser.newPage();
  const reservations = [];
  await page.route('**/*', route => {
    const { hostname, pathname } = new URL(route.request().url());
    if (hostname !== 'frontend.test') return route.abort();
    if (pathname === '/gw/me') return route.fulfill({ json: { agents: [], invoices: null, viewer: { account: 'alice.near', access: {} }, selfService: true, setupAreas: ['payables'] } });
    if (pathname === '/gw/agents') { reservations.push(route.request().postDataJSON()); return route.fulfill({ json: { name: 'own-alice' } }); }
    assert.ok(!pathname.includes('/rpc'), 'missing selected-agent access must prevent private reads');
    return route.fulfill({ path: pathname.startsWith('/static/') ? root + pathname : root + '/index.html' });
  });
  await page.goto('http://frontend.test/');
  await page.getByRole('button', { name: 'Continue to Payables setup' }).click();
  await page.waitForURL('**/a/own-alice/');
  await page.getByRole('heading', { name: 'Access unavailable' }).waitFor();
  assert.deepEqual(reservations, [{ owner: 'alice.near', kind: 'wallet', area: 'payables' }]);
  await page.close();
}
runTask([hostedFailure, sharedSetup]);
