// Sally's purchase order: fixed terms → owner authorizes the order agent and its grant → exact
// funding → payee files the order's invoice → owner approves the held payout → recorded outcome.
// Signatures, funding and settlement are SIMULATED; every other step is Proto's real HTTP/RPC path.
//
//   node workflows/purchase-order.mjs --proto /path/to/proto [--scenario file.json] [--fault lost-filing-response]
//                                     [--invoices-dist /abs/invoices/dist] [--pause] [--keep]
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { orderPaymentEnding, startRecipe, usdcUnits } from './recipe.mjs';

const ctx = await startRecipe(import.meta.filename, { name: 'purchase-order',
  scenario: join(import.meta.dirname, 'scenarios/sally.json'), faults: ['lost-filing-response', 'short-funding'] });

await ctx.run(async ({ scenario, owner, payee, step }) => {
  const id = randomUUID();
  await step('Owner records fixed terms', owner.account, async () => {
    await owner.signIn();
    const order = await owner.rpc('workOrders/create', { id, payee: scenario.payee, amount: usdcUnits(scenario.amountUsdc),
      note: scenario.note, until: scenario.until ?? new Date(Date.now() + scenario.deadlineDays * 86_400_000).toISOString() });
    if (order.payee !== scenario.payee || order.amount !== usdcUnits(scenario.amountUsdc)) throw new Error(`Order does not carry the scenario's terms: ${JSON.stringify(order)}`);
    return { orderId: order.id, payee: order.payee, amount: order.amount, until: order.until };
  });
  await payee.signIn();
  await orderPaymentEnding(ctx, id);
});
