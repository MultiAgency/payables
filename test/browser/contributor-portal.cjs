const { runTask } = require('./fixtures/task.cjs');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const { html, script, landing } = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
  'import {invoicePage,invoiceBrowser} from "./src/invoice-page.ts"; import {contributorPortalPage} from "./src/contributor-portal-page.ts"; console.log(JSON.stringify({html:invoicePage("Contributor portal", "", "https://invoice.test/owners"),script:invoiceBrowser,landing:contributorPortalPage()}));'], {encoding:'utf8'}));
async function contributorRequests(browser) {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({viewport:{width,height:1000}});
    const writes = [], errors = [];
    let orders = [], fail = true, account = 'contributor.near';
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const {hostname,pathname:p} = new URL(route.request().url());
      if(hostname === 'cdn.jsdelivr.net') return route.fulfill({contentType:'text/javascript',body:'export class NearConnector { async disconnect() {} async connect() {} async getConnectedWallet() {return {wallet:{signMessage:async()=>({accountId:"other.near",publicKey:"mock",signature:"mock"})}};} }'});
      if(hostname !== 'invoice.test') return route.abort();
      if(p === '/') return route.fulfill({contentType:'text/html',body:html});
      if(p === '/invoice-browser.js') return route.fulfill({contentType:'text/javascript',body:script});
      if(p === '/api/session') return route.fulfill({json:{account,agreed:false}});
      if(p === '/api/invoices') return route.fulfill({json:{invoices:[],agreements:[],agreed:false}});
      if(p === '/api/signout') {account=null;return route.fulfill({json:{}});}
      if(p === '/api/signin/challenge') return route.fulfill({json:{nonce:'AAAA',message:'fixture',recipient:'invoice.test'}});
      if(p === '/api/signin') {account='other.near';return route.fulfill({json:{account,agreed:false}});}
      if(p === '/api/work-orders' && route.request().method() === 'POST') {
        const draft=route.request().postDataJSON();writes.push(draft);
        if(fail) return route.fulfill({status:503,json:{error:'Request unavailable.'}});
        orders=[{id:'12345678-1234-4234-8234-123456789abc',note:draft.note,amount:'250000000',until:draft.until,createdAt:new Date().toISOString()}];
        return route.fulfill({json:{id:orders[0].id,status:'requested'}});
      }
      if(p === '/api/work-orders') return route.fulfill({json:{orders}});
      throw new Error('Unexpected request '+p);
    });
    await page.goto('https://invoice.test/');
    await page.locator('#work-request-note').fill('Contributor guide');
    await page.locator('#work-request-amount').fill('250');
    await page.locator('#work-request-until').fill('2026-12-01');
    await page.getByRole('button',{name:'Send work order request'}).click();
    await page.getByText(/Your draft is retained/).waitFor();
    await page.reload();
    await page.getByText(/A previous request is retained/).waitFor();
    assert.equal(await page.locator('#work-request-note').inputValue(),'Contributor guide');
    fail=false;
    await page.getByRole('button',{name:'Send work order request'}).click();
    await page.getByText(/Work order requested/).waitFor();
    await page.getByRole('button',{name:'Review work order'}).waitFor();
    assert.deepEqual(writes[0],writes[1]);
    assert.equal('payee' in writes[0],false);
    assert.equal(await page.locator('#work-request-note').inputValue(),'');
    assert.equal(await page.getByRole('link',{name:/Owner workspace/}).getAttribute('href'),'https://invoice.test/owners');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    mkdirSync('.test-artifacts/contributor-portal',{recursive:true});
    await page.screenshot({path:'.test-artifacts/contributor-portal/portal-'+width+'.png',fullPage:true});
    await page.locator('#signout').click();
    await page.locator('#signin').waitFor();
    assert.equal(await page.locator('#request-work').isVisible(),false);
    await page.locator('#signin').click();
    await page.getByText('other.near',{exact:true}).waitFor();
    assert.equal(await page.locator('#work-request-note').inputValue(),'');
    assert.equal(await page.locator('#work-orders-list li').count(),0);
    assert.deepEqual(errors,[]);
    await page.close();
  }
}
async function portalEntry(browser) {
  const page=await browser.newPage({viewport:{width:390,height:1000}});
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:landing}));
  await page.goto('https://invoice.test/');
  assert.equal(await page.getByRole('link',{name:'Open owner workspace'}).getAttribute('href'),'/owners');
  await page.locator('#intake').fill('https://evil.test/requests/pay-aaaaaaaaaaaaaaaaaaaaaaaa/');
  await page.getByRole('button',{name:'Open contributor portal'}).click();
  await page.getByRole('alert').waitFor();
  assert.equal(page.url(),'https://invoice.test/');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'.test-artifacts/contributor-portal/entry-390.png',fullPage:true});
}
runTask([contributorRequests,portalEntry]);
