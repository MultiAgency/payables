// Community sponsorship: an agreed recipient requests payment → the payout agent submits the
// confidential payout, which the provider holds → the owner approves it → recorded outcome.
// Signatures and settlement are SIMULATED; every other step is Proto's real HTTP/RPC path.
//
//   node workflows/sponsorship.mjs --proto /path/to/proto [--scenario file.json] [--fault lost-filing-response]
//                                  [--invoices-dist /abs/invoices/dist] [--pause] [--keep]
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { observe, ownerAction } from './payment-steps.mjs';
import { startRecipe, usdcUnits } from './recipe.mjs';

const ctx = await startRecipe(import.meta.filename, { name: 'sponsorship',
  scenario: join(import.meta.dirname, 'scenarios/sponsorship.json'), faults: ['lost-filing-response', 'owner-rejects'] });

await ctx.run(async ({ scenario, owner, payee, stack, sign, step, stop }) => {
  const submission = randomUUID();
  const invoiceOf = async id => (await payee.invoices()).invoices.find(i => i.id === id);

  const recipient = scenario.payeeLabel ?? scenario.payee, sponsor = scenario.ownerLabel ?? owner.account;
  // Prerequisite, not a step here: the owner already agreed this recipient as a confidential destination
  // in the payout agent's signed policy (a fixture in the local stack).
  console.log(`Prerequisite (fixture, not shown): the signed policy of ${sponsor} already lists ${recipient} (${scenario.payee}) as an agreed confidential destination.`);
  ctx.receipt.prerequisites = [`${scenario.payee} is an owner-agreed confidential destination in the payout agent's signed policy (fixture policy, not a recipe step)`];
  const filed = await step(`${recipient} requests ${scenario.amountUsdc} USDC from ${sponsor}`, payee.account, async () => {
    await payee.signIn();
    if (ctx.fault === 'lost-filing-response') await stack.control('dropTransferResponse');
    const request = { amount: scenario.amountUsdc, note: scenario.note, submission };
    const http = ctx.receipt.payeeDriver.kind === 'sdk';
    const first = await payee.submitInvoice(request, 'tab1', { fault: ctx.payeeFault ?? undefined });
    // The UI driver's page mints its own submission identity; the step reports it.
    const identity = http ? submission : first.submission;
    if (ctx.payeeFault === 'lost-response') {
      // The browser never saw Proto's answer. The page resends only its retained submission.
      if (first.status !== 'unknown') throw new Error(`Expected an unknown outcome, got ${JSON.stringify(first)}`);
      const resumed = await payee.resume('invoice');
      const transfers = (await stack.state()).transfers.length;
      if (!resumed.ok || resumed.submission !== identity || transfers !== 1) throw new Error(`Resume did not reuse the retained request: ${JSON.stringify(resumed)}, ${transfers} transfers`);
      return { invoiceId: resumed.invoiceId, status: resumed.result.status ?? 'waiting', submission: identity,
        lostResponse: { outcome: first.status }, resume: { outcome: resumed.result.outcome, submission: resumed.submission }, transfersSoFar: transfers };
    }
    if (!first.ok) throw new Error(`Request refused: ${JSON.stringify(first)}`);
    if (ctx.fault !== 'lost-filing-response') return { invoiceId: first.invoiceId, status: first.status, submission: identity };
    // Provider-side lost response. HTTP driver: repeat the identical request. UI driver: the page shows
    // the unknown outcome from Proto and keeps its submission.
    const retry = http ? await payee.submitInvoice(request) : null;
    const transfers = (await stack.state()).transfers.length;
    // Repeating the identical request returns the same invoice and never sends a second transfer.
    if ((retry && (!retry.ok || retry.invoiceId !== first.invoiceId)) || transfers !== 1)
      throw new Error(`Retry changed the request: ${JSON.stringify(retry)}, ${transfers} transfers`);
    return { invoiceId: first.invoiceId, status: first.status, submission: identity, ...(retry && { retry: { invoiceId: retry.invoiceId, status: retry.status } }),
      transfersSoFar: transfers };
  });
  if (filed.status !== 'waiting') {
    await owner.signIn();
    return stop(`Request outcome is ${filed.status}. No new send; observe invoice ${filed.invoiceId} until the provider reports it.`,
      { unresolved: { invoice: await invoiceOf(filed.invoiceId), heldForOwner: (await owner.rpc('held')).length } });
  }

  const verdict = ctx.fault === 'owner-rejects' ? 'reject' : 'approve';
  const approval = await step(`Owner ${verdict === 'reject' ? 'rejects' : 'approves'} the held confidential payout (simulated wallet signature)`, owner.account, async () => {
    await owner.signIn();
    const held = await observe(async () => (await owner.rpc('held')).find(h => h.request?.recipient === scenario.payee), Boolean);
    if (!held.done) throw new Error('Held payout not observed');
    const action = await ownerAction(owner.rpc, sign, owner.account,
      { type: 'approval_vote', approvalId: held.value.approvalId, correlationId: held.value.correlationId, verdict });
    if (!action.ownerSucceeded) throw new Error(`Approval not observed: ${JSON.stringify(action)}`);
    const requesterSees = (await invoiceOf(filed.invoiceId)).status;
    if (requesterSees === 'paid') throw new Error('Approval was reported as payment');
    return { payoutCorrelationId: held.value.correlationId, approvalId: held.value.approvalId, voteCorrelationId: action.correlationId, requesterSees };
  });

  if (verdict === 'reject') return step('Both sides record the rejected payout; nothing moved', 'provider', async () => {
    const failed = await observe(() => invoiceOf(filed.invoiceId), i => i?.status === 'failed', { timeoutMs: 60_000 });
    const ownerView = await owner.rpc('paymentStatus', { correlationId: approval.payoutCorrelationId });
    const transfers = (await stack.state()).transfers;
    if (!failed.done || ownerView.status !== 'FAILED' || transfers.some(t => t.status === 'SUCCESS'))
      throw new Error(`Rejection not recorded: requester ${failed.value?.status}, owner ${ownerView.status}`);
    return { invoiceId: filed.invoiceId, outcome: `rejected (provider ${ownerView.status})`, requesterSees: 'failed', ownerSees: ownerView.status, failureCode: ownerView.failureCode ?? ownerView.failure_code ?? null, transfersSoFar: transfers.length, settled: 0 };
  });

  await step('Provider settles the payout (simulated) and both sides record it', 'provider', async () => {
    await stack.control('settle', { correlation: approval.payoutCorrelationId });
    const paid = await observe(() => invoiceOf(filed.invoiceId), i => i?.status === 'paid', { timeoutMs: 60_000 });
    const ownerView = await owner.rpc('paymentStatus', { correlationId: approval.payoutCorrelationId });
    if (!paid.done || ownerView.status !== 'SUCCESS') throw new Error(`Settlement not recorded: requester ${paid.value?.status}, owner ${ownerView.status}`);
    // Exactly one transfer moved, and it paid the requested amount to the scenario's payee.
    const { transfers } = await stack.state();
    const [paidOut] = transfers;
    if (transfers.length !== 1 || paidOut.status !== 'SUCCESS' || paidOut.recipient !== scenario.payee || paidOut.amount !== usdcUnits(scenario.amountUsdc) || paidOut.correlation !== approval.payoutCorrelationId)
      throw new Error(`Unexpected provider transfers: ${JSON.stringify(transfers)}`);
    return { invoiceId: filed.invoiceId, outcome: `paid (provider ${ownerView.status})`, requesterSees: 'paid', ownerSees: ownerView.status, payoutTransfers: 1, paid: { recipient: paidOut.recipient, amount: paidOut.amount } };
  });
});
