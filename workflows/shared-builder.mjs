// Builder workflow on the shared payout agent. One-time setup (the payout agent, the builder as an agreed
// confidential destination, a live payout grant, funding) is done once; each report then needs only its review,
// shared preparation, submission, one owner approval and settlement: no new agent, grant or deposit.
// Owner steps go through the real Payables screens (--owner-app); contributor steps through the payee driver.
// Signatures, funding and settlement are SIMULATED; every other step is Proto's real path.
//
//   node workflows/shared-builder.mjs --proto /path/to/proto-snapshot --owner-app web/dist [--scenario file.json]
//        [--invoices-dist /abs/invoices/release --payee-steps …/payee.mjs [--payee-fault lost-response]] [--fault lost-filing-response]
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { observe } from './payment-steps.mjs';
import { ownerScreens } from './owner-screens.mjs';
import { startRecipe, usdcUnits } from './recipe.mjs';

const ctx = await startRecipe(import.meta.filename, { name: 'shared-builder',
  scenario: join(import.meta.dirname, 'scenarios/contribution-report.json'), faults: ['lost-filing-response'] });
if (!ctx.ownerApp) throw new Error('--owner-app <built Payables owner app> is required: owner steps go through its screens');

await ctx.run(async ({ scenario, owner, payee, stack, step }) => {
  const { agreement } = scenario;
  const ui = ownerScreens(stack.cdp);
  try {
    await owner.signIn();
    const ownerView = () => owner.rpc('compensation/list');
    const requestOf = async id => (await ownerView()).requests.find(r => r.id === id);
    const paymentOf = async id => (await ownerView()).payments.find(p => p.requestId === id);
    const transfers = async () => (await stack.state()).transfers;
    const approvals = async () => (await owner.rpc('owner/actions')).filter(a => a.type === 'approval_vote');
    // What one-time setup provides, read once and compared after every report.
    const fixed = async () => {
      const [setup, overview, orders] = await Promise.all([owner.rpc('setup'), owner.rpc('overview'), owner.rpc('workOrders/list')]);
      return { agentId: setup.agentId, grant: setup.grant?.id ?? null, orderAgents: orders.length,
        balance: BigInt(overview.book.find(h => h.symbol === 'USDC')?.confidential ?? 0) };
    };

    ctx.phase = 'agreement';
    const agreementId = await step('Owner records the period agreement in Agreements', owner.account, async () => {
      const terms = { payee: scenario.payee, title: agreement.title, document: agreement.document, signedOn: agreement.signedOn,
        start: agreement.start, end: agreement.end, ceiling: usdcUnits(agreement.ceilingUsdc), scope: agreement.scope };
      await ui.recordAgreement(terms);
      const recorded = (await ownerView()).agreements.find(a => a.terms.payee === scenario.payee && a.terms.title === agreement.title);
      if (!recorded || recorded.terms.ceiling !== terms.ceiling || recorded.remaining !== terms.ceiling) throw new Error(`Agreement not recorded as entered: ${JSON.stringify(recorded ?? null)}`);
      return { agreementId: recorded.id, ceiling: recorded.terms.ceiling, remaining: recorded.remaining };
    }).then(r => r.agreementId);
    ctx.phase = 'setup';
    if (ctx.uiSetup) {
      const listed = policy => policy?.policy?.destinations?.list?.some(d => d.address === scenario.payee && d.confidential);
      await step('Setup, once: owner adds the builder to the payout policy (one wallet signature)', owner.account, async () => {
        const before = (await stack.state()).payoutPolicy;
        if (listed(before)) throw new Error('The builder was already in the payout policy');
        const signed = async () => (await owner.rpc('owner/actions')).filter(a => a.type === 'policy_update' && a.ownerSucceeded).length;
        const signedBefore = await signed();
        await ui.addBuilder({ payee: scenario.payee });
        const after = await observe(async () => (await stack.state()).payoutPolicy, p => listed(p) && p.revision > before.revision, { timeoutMs: 60_000 });
        if (!after.done) throw new Error(`The builder was not added to the payout policy: ${JSON.stringify(after.value)}`);
        await observe(signed, n => n > signedBefore, { timeoutMs: 30_000 });
        if (await signed() !== signedBefore + 1) throw new Error('Expected exactly one owner-signed policy update');
        return { destination: scenario.payee, confidential: true, policyRevision: `${before.revision} → ${after.value.revision}`, ownerSignatures: 1 };
      });
      await step('Setup, once: fund the payout agent (simulated deposit arrival)', owner.account, async () => {
        const amount = usdcUnits(agreement.ceilingUsdc);
        const instructions = await ui.funding();
        await stack.control('fundPayout', { amount });
        const funded = await observe(fixed, f => f.balance >= BigInt(amount), { timeoutMs: 60_000 });
        if (!funded.done) throw new Error('Funding arrival not observed');
        // The owner's screen must show the funded balance, not only Proto's record.
        const after = await ui.funding({ amount });
        return { amount, depositInstructions: instructions, fundedScreen: after.usdcRow, balance: `${funded.value.balance}` };
      });
    }
    const setup = await step(`Setup ready on the owner's screen: payout agent, builder in the signed policy, payout grant, funding`, owner.account, async () => {
      // Each item is what the owner sees in "Shared payouts · optional setup, once".
      const shown = await ui.setup();
      if (shown.length !== 4 || !shown.every(item => /Ready/.test(item))) throw new Error(`Shared payout setup is not ready on the owner's screen: ${JSON.stringify(shown)}`);
      const state = await fixed();
      if (!state.grant || state.orderAgents !== 0) throw new Error(`Unexpected setup: ${JSON.stringify(state, (_, v) => typeof v === 'bigint' ? `${v}` : v)}`);
      return { performedBy: ctx.uiSetup ? 'owner screens (builder and funding above); payout agent and grant provisioned by the stack' : 'stack (--owner, --payee, live payout grant, funding)', ownerScreen: shown.map(item => item.split('\n')[0] + ': Ready'),
        payoutAgent: state.agentId, grant: state.grant, balance: `${state.balance}` };
    });
    let { balance } = await fixed();

    await payee.signIn();

    const reported = [];
    let unresolved = null; // a shared send whose outcome is unknown
    for (const [index, report] of scenario.reports.entries()) {
      const n = index + 1, tab = `report${n}`;
      ctx.phase = `report ${n}`;
      const fault = n === 1 ? ctx.payeeFault ?? undefined : undefined;
      const submitted = await step(`Contributor submits report ${n}: ${report.label}`, payee.account, async () => {
        const before = (await transfers()).length;
        const saved = await payee.submitReport({ commandId: randomUUID(), id: randomUUID(), expectedVersion: 0, submit: true,
          report: { agreementId, start: report.start, end: report.end, contributions: report.contributions, assessment: report.assessment, evidence: report.evidence } },
          tab, { fault, report });
        const held = (await ownerView()).requests.filter(r => r.report.agreementId === agreementId);
        if (report.expect) {
          if (saved.ok || saved.code !== report.expect || held.length !== reported.length || (await transfers()).length !== before)
            throw new Error(`Expected ${report.expect} with nothing recorded or sent, got ${JSON.stringify({ saved, requests: held.length })}`);
          return { refused: saved.code, requestsForAgreement: held.length };
        }
        let lost;
        if (fault === 'lost-response') {
          if (saved.status !== 'unknown' || !saved.requestId) throw new Error(`Expected an unknown outcome with retained identities, got ${JSON.stringify(saved)}`);
          const resumed = await payee.resume('report', tab);
          if (!resumed.ok || resumed.requestId !== saved.requestId || resumed.commandId !== saved.commandId) throw new Error(`Resume changed identities: ${JSON.stringify(resumed)}`);
          lost = { lostResponse: { outcome: saved.status }, resume: { requestId: resumed.requestId, commandId: resumed.commandId } };
        } else if (!saved.ok) throw new Error(`Report refused: ${JSON.stringify(saved)}`);
        reported.push(saved.requestId);
        const after = (await ownerView()).requests.filter(r => r.report.agreementId === agreementId);
        if (after.length !== reported.length || after.some(r => r.id === saved.requestId && r.payment)) throw new Error(`Expected ${reported.length} requests, the new one unbound, found ${JSON.stringify(after)}`);
        return { requestId: saved.requestId, commandId: saved.commandId, requestsForAgreement: after.length, ...lost };
      });
      if (report.expect) continue;
      const requestId = submitted.requestId;

      let approvedAmount;
      for (const review of report.reviews) {
        const amount = usdcUnits(review.approvedUsdc);
        if (review.expect) {
          await step(`Owner tries ${review.approvedUsdc} USDC on report ${n}: the screen blocks it`, owner.account, async () => {
            const before = await requestOf(requestId), sent = (await transfers()).length;
            const shown = await ui.approveBlocked({ payee: scenario.payee, amount, feedback: review.feedback });
            const after = await requestOf(requestId);
            if (!shown.approveDisabled || after.version !== before.version || after.state !== 'submitted' || (await transfers()).length !== sent)
              throw new Error(`The over-cap decision was not blocked: ${JSON.stringify({ shown, state: after.state })}`);
            return { shown: shown.shown, approveDisabled: true, state: after.state };
          });
          await step(`Proto refuses the same ${review.approvedUsdc} USDC decision: ${review.expect}`, owner.account, async () => {
            // The screen's block mirrors the server's rule; the server enforces it independently.
            const before = await requestOf(requestId), sent = (await transfers()).length;
            let refused = null;
            try { await owner.rpc('compensation/review', { commandId: randomUUID(), id: requestId, expectedVersion: before.version, decision: 'approved', approvedAmount: amount, feedback: review.feedback }); }
            catch (error) { refused = error; }
            const after = await requestOf(requestId);
            if (refused?.code !== review.expect || after.version !== before.version || (await transfers()).length !== sent)
              throw new Error(`Expected ${review.expect} with nothing changed or sent, got ${refused ? refused.code ?? refused.message : 'an approval'}`);
            return { refused: refused.code, state: after.state, transfersSoFar: sent };
          });
          continue;
        }
        await step(`Owner approves report ${n} at ${review.approvedUsdc} USDC in the review screen (no payment)`, owner.account, async () => {
          const sent = (await transfers()).length;
          await ui.approve({ payee: scenario.payee, amount, feedback: review.feedback });
          const recorded = await requestOf(requestId), contributor = (await payee.compensation()).requests.find(r => r.id === requestId);
          if (recorded?.state !== 'approved' || recorded.approvedAmount !== amount || contributor?.approvedAmount !== amount || (await transfers()).length !== sent)
            throw new Error(`Not approved at ${amount} without a transfer: ${JSON.stringify({ recorded, contributor })}`);
          approvedAmount = amount;
          return { state: recorded.state, approvedAmount: amount, transfersSoFar: sent };
        });
      }

      await step(`Owner prepares report ${n}'s shared payout`, owner.account, async () => {
        const shown = await ui.prepareShared({ payee: scenario.payee, amount: approvedAmount });
        const request = await requestOf(requestId), payment = await paymentOf(requestId);
        if (request.payment?.mode !== 'shared' || request.payment.id !== requestId || payment?.status !== 'PREPARED')
          throw new Error(`Not prepared on the shared path: ${JSON.stringify({ binding: request.payment, payment })}`);
        return { mode: request.payment.mode, invoiceId: payment.invoiceId, status: payment.status, screenStep: shown.step };
      });

      const lostSend = ctx.fault === 'lost-filing-response' && n === 1;
      if (lostSend) {
        // The send's reply is lost but its effect is kept: the payment stays UNKNOWN and is never sent again.
        await step(`Owner sends report ${n}'s payout for approval (answer lost)`, owner.account, async () => {
          const sent = (await transfers()).length;
          await stack.control('dropTransferResponse');
          const shown = await ui.send({ payee: scenario.payee, amount: approvedAmount, lost: true });
          const recorded = await observe(() => paymentOf(requestId), p => p?.status === 'UNKNOWN', { timeoutMs: 30_000 });
          await new Promise(resolve => setTimeout(resolve, 3000));
          const after = await transfers(), still = await paymentOf(requestId);
          if (!recorded.done || after.length !== sent + 1 || still.status !== 'UNKNOWN')
            throw new Error(`Expected one submission left UNKNOWN: ${JSON.stringify({ payment: still, transfers: after.length - sent })}`);
          unresolved = { requestId, invoiceId: still.invoiceId };
          return { screen: shown.shown, status: still.status, submissions: 1, resent: 0 };
        });
        continue;
      }
      if (unresolved) {
        // While report 1's outcome is unknown, the payout agent refuses further sends; nothing is sent.
        await step(`Owner sends report ${n}'s payout: refused while report 1's outcome is unknown`, owner.account, async () => {
          const sent = (await transfers()).length;
          const shown = await ui.send({ payee: scenario.payee, amount: approvedAmount, refused: true });
          const payment = await paymentOf(requestId), first = await paymentOf(unresolved.requestId);
          if (payment.status !== 'PREPARED' || (await transfers()).length !== sent || first.status !== 'UNKNOWN')
            throw new Error(`Expected the send refused with nothing sent: ${JSON.stringify({ payment, first })}`);
          return { screen: shown.shown, status: payment.status, firstReport: first.status, transfersSoFar: sent };
        });
        return ctx.stop(`Report 1's shared payout outcome is unknown; shared payouts wait for its review. Nothing was resent.`,
          { unresolved: { ...unresolved, status: 'UNKNOWN' } });
      }
      const submittedPayout = await step(`Owner sends report ${n}'s payout for approval`, owner.account, async () => {
        const sent = (await transfers()).length;
        const shown = await ui.send({ payee: scenario.payee, amount: approvedAmount });
        // Follow the record: one submission, held for the owner, whatever the screen heard.
        const recorded = await observe(() => paymentOf(requestId), p => p?.correlationId && p.status !== 'PREPARED', { timeoutMs: 30_000 });
        const after = await transfers();
        if (!recorded.done || after.length !== sent + 1 || after.at(-1).correlation !== recorded.value.correlationId)
          throw new Error(`Expected exactly one submission for this report: ${JSON.stringify({ payment: recorded.value, transfers: after.length - sent })}`);
        return { correlationId: recorded.value.correlationId, status: recorded.value.status, screen: shown.shown ?? shown.step, submissions: 1 };
      });

      await step(`Owner approves report ${n}'s held payout (one simulated wallet signature)`, owner.account, async () => {
        const before = (await approvals()).filter(a => a.payment?.correlationId === submittedPayout.correlationId).length;
        await ui.approveHeld({ payee: scenario.payee, amount: approvedAmount });
        // The wallet's signature is confirmed by the provider asynchronously: follow the recorded owner action.
        const mine = async () => (await approvals()).filter(a => a.payment?.correlationId === submittedPayout.correlationId);
        await observe(mine, list => list.some(a => a.ownerSucceeded), { timeoutMs: 60_000 });
        const after = await mine();
        if (before !== 0 || after.length !== 1 || !after[0].ownerSucceeded) throw new Error(`Expected exactly one owner approval: ${JSON.stringify(after)}`);
        const payment = await paymentOf(requestId);
        if (payment.status === 'SUCCESS') throw new Error('Approval was reported as payment');
        return { approvals: 1, ownerSucceeded: true, status: payment.status };
      });

      await step(`Provider settles report ${n}'s payout (simulated); exactly one transfer`, 'provider', async () => {
        await stack.control('settle', { correlation: submittedPayout.correlationId });
        const settled = await observe(() => paymentOf(requestId), p => p?.status === 'SUCCESS', { timeoutMs: 60_000 });
        const mine = (await transfers()).filter(t => t.correlation === submittedPayout.correlationId);
        if (!settled.done || mine.length !== 1 || mine[0].status !== 'SUCCESS' || mine[0].recipient !== scenario.payee || mine[0].amount !== approvedAmount)
          throw new Error(`Unexpected settlement: ${JSON.stringify({ payment: settled.value, transfers: mine })}`);
        return { status: settled.value.status, paid: { recipient: mine[0].recipient, amount: mine[0].amount } };
      });

      const remaining = usdcUnits(report.remainingUsdc);
      await step(`Report ${n} closes: contributor sees it paid; no new agent, grant or deposit`, payee.account, async () => {
        const view = await payee.compensation(), request = view.requests.find(r => r.id === requestId);
        const payment = view.payments.find(p => p.requestId === requestId);
        if (request?.approvedAmount !== approvedAmount || !['paid', 'SUCCESS'].includes(payment?.status))
          throw new Error(`The contributor does not see this report paid: ${JSON.stringify({ request, payment })}`);
        const seen = view.agreements.find(a => a.id === agreementId)?.remaining, recorded = (await ownerView()).agreements.find(a => a.id === agreementId)?.remaining;
        if (seen !== remaining || recorded !== remaining) throw new Error(`Remaining cap: contributor ${seen}, owner ${recorded}, expected ${remaining}`);
        // Per report: the setup is reused, never repeated.
        const now = await fixed();
        if (now.agentId !== setup.payoutAgent || now.grant !== setup.grant || now.orderAgents !== 0 || balance - now.balance !== BigInt(approvedAmount))
          throw new Error(`Setup changed during the report: ${JSON.stringify({ before: setup, now }, (_, v) => typeof v === 'bigint' ? `${v}` : v)}`);
        balance = now.balance;
        return { contributorSees: payment.status, remaining, newAgents: 0, newGrants: 0, deposits: 0, balanceSpent: approvedAmount };
      });
    }
  } finally { await ui.close(); }
});
