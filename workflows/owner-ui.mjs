// Owner steps through the real Payables screens: the stack serves the built owner app at /a/payout/ and keeps an
// owner browser signed in through its simulated wallet. This drives that page over CDP by its visible labels only;
// every decision is still authorized and recorded by Proto.
//
// It runs as its own process, one step per run, attached only to the stack's loopback CDP (as Invoices' payee
// steps do): Playwright's connection can't run under the recipe's offline network guard.
//   node workflows/owner-ui.mjs <step> <json args>   (CDP from OWNER_UI_CDP)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const usdc = atomic => { const n = BigInt(atomic), cents = (n % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, ''); return `${(n / 1_000_000n).toLocaleString()}${cents ? `.${cents}` : ''}`; };

async function connect(cdp) {
  const browser = await chromium.connectOverCDP(cdp);
  const page = browser.contexts().flatMap(context => context.pages()).find(p => new URL(p.url()).pathname.startsWith('/a/payout'));
  if (!page) throw new Error('The stack has no owner page at /a/payout/');
  page.setDefaultTimeout(20_000);
  const origin = new URL(page.url()).origin;
  const go = async path => { await page.goto(`${origin}/a/payout${path}`); };
  const review = page.getByRole('heading', { name: 'Reports & payment requests', exact: true });
  const steps = page.getByRole('list', { name: 'Steps for this report' });
  const currentStep = () => steps.locator('[aria-current="step"]').innerText().catch(() => null);
  /** Opens one request on Payments: the builder's, in the given state, at the given amount if known. */
  async function open({ payee, state, amount }) {
    await go('/'); await review.waitFor();
    await page.getByRole('button', { name: 'Refresh requests', exact: true }).click();
    let request = page.getByRole('button').filter({ hasText: payee }).filter({ hasText: state });
    if (amount) request = request.filter({ hasText: `${usdc(amount)} USDC` });
    await request.first().click();
  }
  const waitForStep = async prefix => { await page.waitForFunction(p => document.querySelector('[aria-label="Steps for this report"] [aria-current="step"]')?.textContent?.startsWith(p), prefix); };

  return {
    page,
    close: () => browser.close(),
    /** The one-time setup checklist as the owner sees it. */
    async setup() {
      await go('/'); await review.waitFor();
      const items = page.getByRole('list', { name: 'Shared payout setup' }).getByRole('listitem');
      await items.first().waitFor();
      return items.allInnerTexts();
    },
    /** One-time setup: adds the builder to the payout policy; the owner signs the policy update in the wallet. */
    async addBuilder({ payee }) {
      await go('/payees');
      await page.getByText('Add a payee without agreement terms', { exact: true }).click();
      const form = page.locator('form').filter({ has: page.locator('input[name="payee"]') });
      await form.locator('input[name="payee"]').fill(payee);
      await form.getByRole('button', { name: 'Add', exact: true }).click();
      const wallet = page.getByRole('button', { name: /^Continue to (wallet|signing)$/ });
      if (await wallet.count().catch(() => 0)) await wallet.first().click();
    },
    /**
     * One-time setup on Balances & funding. Without `amount`: the deposit instructions the owner reads. With
     * `amount`: waits until the Balances table's USDC row shows that confidential balance, and returns the row.
     */
    async funding({ amount } = {}) {
      await go('/funding');
      if (!amount) {
        const receive = page.getByRole('heading', { name: 'Receive funds', exact: true });
        await receive.waitFor();
        return (await page.locator('section').filter({ has: receive }).innerText()).split('\n').slice(0, 3);
      }
      const row = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'USDC', exact: true }) });
      const want = new RegExp(`^${usdc(amount).replaceAll('.', '\\.')}(\\.0+)?$`);
      for (let i = 0; i < 40; i++) {
        const shown = (await row.locator('td').last().innerText().catch(() => '')).trim().replace(/\s*USDC$/, '');
        if (want.test(shown)) return { usdcRow: (await row.innerText()).replace(/\s+/g, ' ').trim() };
        await page.waitForTimeout(500); await page.reload();
      }
      throw new Error(`Balances never showed ${usdc(amount)} USDC confidential: ${await row.innerText().catch(() => 'no USDC row')}`);
    },
    async recordAgreement(terms) {
      await go('/payees');
      await page.getByText('Record a signed agreement', { exact: true }).click();
      for (const [label, value] of [['Agreement title', terms.title], ['Contributor NEAR account', terms.payee], ['Signed Google Doc or document URL', terms.document],
        ['Signed on', terms.signedOn], ['Work period starts', terms.start], ['Work period ends', terms.end], ['Upper limit · USDC', usdc(terms.ceiling)],
        ['Already approved outside this system · USDC', '0'], ['Scope reference', terms.scope]]) await page.getByLabel(label, { exact: true }).fill(value);
      await page.getByRole('button', { name: 'Record signed terms', exact: true }).click();
      await page.getByRole('heading', { name: terms.title, exact: true }).waitFor();
    },
    /** Approves at an explicit amount; resolves once the screen shows the approval. */
    async approve({ payee, amount, feedback }) {
      await open({ payee, state: 'In review' });
      await page.getByLabel('Compensation · USDC', { exact: true }).fill(usdc(amount));
      await page.getByLabel('Review feedback', { exact: true }).fill(feedback);
      await page.getByRole('button', { name: 'Approve', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Approve compensation', exact: true }).click();
      await page.getByText(/Compensation is approved and counted against the agreement ceiling/).waitFor();
      return { step: await currentStep() };
    },
    /** An over-cap decision: the screen names the excess and keeps Approve disabled, so nothing is submitted. */
    async approveBlocked({ payee, amount, feedback }) {
      await open({ payee, state: 'In review' });
      await page.getByLabel('Compensation · USDC', { exact: true }).fill(usdc(amount));
      await page.getByLabel('Review feedback', { exact: true }).fill(feedback);
      const alert = page.getByText(/Compensation exceeds the remaining ceiling by [\d.,]+ USDC/);
      await alert.waitFor();
      return { shown: await alert.innerText(), approveDisabled: await page.getByRole('button', { name: 'Approve', exact: true }).isDisabled() };
    },
    async prepareShared({ payee, amount }) {
      await open({ payee, state: 'Compensation approved', amount });
      // The isolated order is the default; the shared payout is the owner's explicit choice.
      await page.getByText('Isolated order (default)', { exact: true }).waitFor();
      await page.getByText('Shared payout instead', { exact: true }).click();
      await page.getByRole('button', { name: 'Prepare shared payout', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Prepare shared payout', exact: true }).click();
      await waitForStep('3.');
      return { step: await currentStep() };
    },
    /**
     * Sends for approval. With `lost`, the answer is expected to be lost and the screen must say the outcome is
     * unknown; with `refused`, the screen must say nothing was changed or sent.
     */
    async send({ payee, amount, lost, refused }) {
      await open({ payee, state: 'Compensation approved', amount });
      await page.getByRole('button', { name: 'Review payment submission', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Send payment', exact: true }).click();
      if (refused) {
        const shown = page.getByText(/Nothing was changed or sent\./);
        await shown.waitFor();
        return { shown: await shown.innerText() };
      }
      if (lost) {
        // Either the call's own unknown outcome, or the recorded payment read as UNKNOWN: both say nothing is resent.
        const unknown = page.getByText(/The outcome is unknown: this compensation\/send request may have taken effect|Outcome unknown: this shared payout may have been submitted/).first();
        await unknown.waitFor();
        return { shown: await unknown.innerText() };
      }
      await waitForStep('4.');
      return { step: await currentStep() };
    },
    /** Follows the report's own link to its held payout and approves it with one wallet signature. */
    async approveHeld({ payee, amount }) {
      await open({ payee, state: 'Compensation approved', amount });
      await waitForStep('4.');
      await page.getByRole('link', { name: 'Review the held payout', exact: true }).click();
      await page.getByRole('button', { name: 'Sign approval', exact: true }).click();
      await page.getByRole('button', { name: 'Continue to wallet', exact: true }).click();
      // Signed: the approval control is gone once the page reads the recorded owner action.
      await page.getByRole('button', { name: 'Sign approval', exact: true }).waitFor({ state: 'detached', timeout: 60_000 });
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [step, args] = process.argv.slice(2);
  const ui = await connect(process.env.OWNER_UI_CDP);
  try { console.log(JSON.stringify(await ui[step](JSON.parse(args ?? '{}')) ?? null)); }
  catch (error) {
    // What the owner's screen showed when the step failed, for the receipt.
    const shown = await ui.page.locator('main').innerText({ timeout: 2000 }).catch(() => '');
    console.error(`${error.message.split('\n')[0]} at ${ui.page.url()}\n${shown.slice(0, 1500)}`); process.exitCode = 1;
  }
  finally { await ui.close(); }
}
