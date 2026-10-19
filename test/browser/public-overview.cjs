const { HOST_CAPABILITIES } = require('./fixtures/host.cjs');
/** Offline public overview regressions. Every request is intercepted; no server or wallet starts. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('./fixtures/browser.cjs');
const { assertResponsive } = require('./fixtures/layout.cjs');
const root = path.resolve(process.argv[2] || 'web/dist');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  const results = [];
  async function check(name, width, work) {
    if (process.env.CASE_FILTER && !name.includes(process.env.CASE_FILTER)) return;
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const requests = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      requests.push(url.pathname);
      if (url.origin !== 'http://frontend.test') return route.abort();
      if (url.pathname === '/gw/me') return route.fulfill({ json: { capabilities: HOST_CAPABILITIES,
        agents: [], invoices: null, viewer: null,
      } });
      if (url.pathname.startsWith('/static/')) return route.fulfill({ path: root + url.pathname,
        contentType: url.pathname.endsWith('.js') ? 'application/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'font/woff2' });
      if (url.pathname.includes('/rpc/') || url.pathname.startsWith('/gw/')) return route.abort();
      return route.fulfill({ path: path.join(root, 'index.html'), contentType: 'text/html' });
    });
    try {
      await work(page, requests);
      assert.deepEqual(errors, []);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      results.push({ name, width, pass: true });
    } catch (error) {
      results.push({ name, width, pass: false, error: error.message });
    } finally { await context.close(); }
  }

  {
    const width = 390;
    await check('public landing leads directly to workflows and requirement stages', width, async (page, requests) => {
      await page.goto('http://frontend.test/');
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.getByRole('link', { name: 'See how it works', exact: true }).click();
      assert.match(page.url(), /#workflows$/);
      assert.equal(await page.getByRole('link', { name: /Try Payables|Try Portfolio|Explore example/ }).count(), 0);
      for (const [name, id] of [['Payables', 'facilitator'], ['Portfolio', 'treasury']]) {
        const link = page.getByRole('link', { name: `${name} requirement stages`, exact: true });
        assert.equal(await link.getAttribute('href'), `#${id}-requirements`);
        await link.click();
        assert.match(page.url(), new RegExp(`#${id}-requirements$`));
        assert.ok(await page.locator(`#${id}-requirements`).isVisible());
      }
      assert.deepEqual(requests.filter(url => /\/rpc\/|manifest\.json/.test(url)), []);
      await assertResponsive(page, 'public landing');
    });
  }
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
  process.exitCode = results.length > 0 && results.every(result => result.pass) ? 0 : 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
