// Builder workflow: the owner records one period agreement (the work order: builder, document, period, scope,
// earnings cap) → assignments arise during the period, each reported → owner review (no payment) → the
// approved amount's isolated payout (authorize, fund, file, approve) → recorded settlement. Proto enforces
// the cap (`ceiling_exceeded`) and the period (`outside_period`); the scenario's `reports` tell the story.
// Signatures, funding and settlement are SIMULATED; every other step is Proto's real HTTP/RPC path.
//
//   node workflows/contribution-report.mjs --proto /path/to/proto [--scenario file.json] [--fault lost-filing-response|short-funding]
//                                          [--invoices-dist /abs/invoices/release --payee-steps …/payee.mjs [--payee-fault lost-response]] [--pause] [--keep]
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { observe } from './payment-steps.mjs';
import { orderPaymentEnding, startRecipe, usdcUnits } from './recipe.mjs';

const ctx = await startRecipe(import.meta.filename, { name: 'contribution-report',
  scenario: join(import.meta.dirname, 'scenarios/contribution-report.json'), faults: ['lost-filing-response', 'short-funding'] });

await ctx.run(async ({ scenario, owner, payee, stack, step }) => {
  const { agreement } = scenario;
  const agreementId = randomUUID();
  const ownerView = () => owner.rpc('compensation/list');
  const requestOf = async id => (await ownerView()).requests.find(r => r.id === id);
  const requestsForAgreement = async () => (await ownerView()).requests.filter(r => r.report.agreementId === agreementId);
  const transfers = async () => (await stack.state()).transfers.length;
  const reported = []; // every request this agreement should hold, in order

  await step('Owner records the signed period agreement', owner.account, async () => {
    await owner.signIn();
    const terms = { payee: scenario.payee, title: agreement.title, document: agreement.document, signedOn: agreement.signedOn,
      start: agreement.start, end: agreement.end, ceiling: usdcUnits(agreement.ceilingUsdc), openingApproved: '0', scope: agreement.scope };
    await owner.rpc('compensation/agreement', { commandId: randomUUID(), id: agreementId, expectedVersion: 0, terms });
    const recorded = (await ownerView()).agreements.find(a => a.id === agreementId);
    return { agreementId, recordedBy: recorded.recordedBy, ceiling: recorded.terms.ceiling, remaining: recorded.remaining };
  });
  await payee.signIn();

  for (const [index, report] of scenario.reports.entries()) {
    const n = index + 1, tab = `report${n}`;
    // The payee-side lost response is exercised on the first report.
    const fault = n === 1 ? ctx.payeeFault ?? undefined : undefined;

    const submitted = await step(`Contributor submits report ${n}: ${report.label}`, payee.account, async () => {
      const transfersBefore = await transfers();
      const saved = await payee.submitReport({ commandId: randomUUID(), id: randomUUID(), expectedVersion: 0, submit: true,
        report: { agreementId, start: report.start, end: report.end, contributions: report.contributions, assessment: report.assessment, evidence: report.evidence } },
        tab, { fault, report });
      if (report.expect) {
        // Refused at submission: no request is recorded and nothing is sent.
        const held = await requestsForAgreement();
        if (saved.ok || saved.code !== report.expect || held.length !== reported.length || await transfers() !== transfersBefore)
          throw new Error(`Expected ${report.expect} with nothing recorded or sent, got ${JSON.stringify({ saved, requests: held.length, transfers: await transfers() })}`);
        return { refused: saved.code, requestsForAgreement: held.length, transfersSoFar: transfersBefore };
      }
      let lost;
      if (fault === 'lost-response') {
        // The browser never saw Proto's answer; the page resends only its retained request and command identities.
        if (saved.status !== 'unknown' || !saved.requestId) throw new Error(`Expected an unknown outcome with retained identities, got ${JSON.stringify(saved)}`);
        const resumed = await payee.resume('report', tab);
        if (!resumed.ok || resumed.requestId !== saved.requestId || resumed.commandId !== saved.commandId) throw new Error(`Resume changed identities: ${JSON.stringify(resumed)}`);
        lost = { lostResponse: { outcome: saved.status }, resume: { outcome: resumed.result.outcome, requestId: resumed.requestId, commandId: resumed.commandId } };
      } else if (!saved.ok) throw new Error(`Report refused: ${JSON.stringify(saved)}`);
      reported.push(saved.requestId);
      const held = await requestsForAgreement(), recorded = held.find(r => r.id === saved.requestId);
      if (held.length !== reported.length || !recorded) throw new Error(`Expected ${reported.length} requests for the agreement, found ${held.length}`);
      return { requestId: saved.requestId, commandId: saved.commandId, state: recorded.state, version: recorded.version, requestsForAgreement: held.length, ...lost };
    });
    if (report.expect) continue;
    const requestId = submitted.requestId;

    for (const review of report.reviews) {
      const amount = usdcUnits(review.approvedUsdc);
      await step(`Owner reviews report ${n} at ${review.approvedUsdc} USDC${review.expect ? ` (refused: ${review.expect})` : ' (no payment)'}`, owner.account, async () => {
        const before = await requestOf(requestId), transfersBefore = await transfers();
        let refused = null;
        try {
          await owner.rpc('compensation/review', { commandId: randomUUID(), id: requestId, expectedVersion: before.version,
            decision: 'approved', approvedAmount: amount, feedback: review.feedback });
        } catch (error) { refused = error; }
        const after = await requestOf(requestId);
        // A review is never a payment, approved or refused.
        if (await transfers() !== transfersBefore) throw new Error('A review sent a payment');
        if (review.expect) {
          if (refused?.code !== review.expect || after.state !== before.state || after.version !== before.version)
            throw new Error(`Expected ${review.expect} with the request unchanged, got ${refused ? refused.code ?? refused.message : 'an approval'}`);
          return { refused: refused.code, state: after.state, version: after.version, transfersSoFar: transfersBefore };
        }
        if (refused) throw refused;
        const contributorView = (await payee.compensation()).requests.find(r => r.id === requestId);
        if (after.state !== 'approved' || after.approvedAmount !== amount || contributorView?.state !== 'approved' || contributorView.approvedAmount !== amount)
          throw new Error(`Compensation not recorded as approved at ${amount}: owner ${JSON.stringify(after)}, contributor ${JSON.stringify(contributorView ?? null)}`);
        return { state: after.state, approvedAmount: after.approvedAmount, contributorSees: contributorView.state, transfersSoFar: transfersBefore };
      });
    }

    const prepared = await step(`Owner prepares report ${n}'s isolated payout`, owner.account, async () => {
      const approved = await requestOf(requestId);
      const until = new Date(Date.now() + scenario.deadlineDays * 86_400_000).toISOString();
      await owner.rpc('compensation/prepare', { type: 'prepare', command: { commandId: randomUUID(), id: requestId, expectedVersion: approved.version, mode: 'isolated', until } });
      const bound = await requestOf(requestId);
      const order = await observe(async () => (await owner.rpc('workOrders/list')).find(o => o.id === bound.payment?.id), Boolean);
      if (!order.done) throw new Error('Prepared payout order not observed');
      if (order.value.amount !== bound.approvedAmount || order.value.payee !== scenario.payee) throw new Error(`Prepared order does not carry the approved terms: ${JSON.stringify(order.value)}`);
      return { orderId: order.value.id, amount: order.value.amount, until: order.value.until, payee: order.value.payee };
    });

    await orderPaymentEnding(ctx, prepared.orderId, { tag: `${tab}-`, label: `report ${n}` });
    if (ctx.receipt.stopped) return;

    // Complete only when the contributor sees this request, at its approved amount, paid through its order, and the
    // agreement's remaining cap is the scenario's.
    const approvedAmount = usdcUnits(report.reviews.at(-1).approvedUsdc), remaining = usdcUnits(report.remainingUsdc);
    await step(`Contributor reads report ${n}'s payment and the remaining cap`, payee.account, async () => {
      const view = await payee.compensation();
      const request = view.requests.find(r => r.id === requestId), payment = view.payments.find(p => p.requestId === requestId);
      if (request?.state !== 'approved' || request.approvedAmount !== approvedAmount)
        throw new Error(`The contributor does not see the approved request: ${JSON.stringify(request ?? null)}`);
      if (request.payment?.id !== prepared.orderId || payment?.id !== prepared.orderId || payment.status !== 'paid')
        throw new Error(`The contributor does not see the order paid: ${JSON.stringify({ binding: request.payment ?? null, payment: payment ?? null })}`);
      const seen = view.agreements.find(a => a.id === agreementId)?.remaining, recorded = (await ownerView()).agreements.find(a => a.id === agreementId)?.remaining;
      if (seen !== remaining || recorded !== remaining) throw new Error(`Remaining cap: contributor ${seen}, owner ${recorded}, expected ${remaining}`);
      return { requestId, state: request.state, approvedAmount: request.approvedAmount, orderId: payment.id, payment: payment.status, remaining };
    });
  }
});
