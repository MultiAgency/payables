/**
 * Complete owner answers for fixtures whose scenario does not care about them, shaped as Proto's
 * published owner contract (P3) returns them. Scenarios override fields; validation still applies.
 */
/** `strategy/get` for an agent with no schedule on: Proto always answers with a status, never null. */
const strategyStatus = (overrides = {}) => ({
  strategy: { targetBps: { usdc: 10000 }, minLegUsd: 1, maxCostBps: 100, autopilot: { everyMin: 60, maxUsd: 10 } },
  digest: 'fixture-strategy', grantSuffix: 'fixture', executor: true, on: false, grantMatches: null, unresolved: 0, grant: null,
  readiness: { state: 'off', reasons: [], canEnable: false }, observedAt: '2026-10-16T00:00:00.000Z', ...overrides,
});
/**
 * The `progress` Proto's server attaches to `workOrders/get` (P3 G6), computed from the snapshot by
 * the server's own rule, so a scenario that changes the snapshot gets the progress the server would send.
 */
function workOrderProgress(snapshot, now = Date.now()) {
  const expired = now >= Date.parse(snapshot.order.until);
  const residual = snapshot.balance !== null && BigInt(snapshot.balance) > 0n ? snapshot.balance : null;
  const stage = snapshot.error ? 'unavailable' : snapshot.invoice && snapshot.invoice.status !== 'prepared' ? snapshot.invoice.status
    : expired ? 'expired' : !snapshot.agentId ? 'authorize' : !snapshot.policyReady ? 'policy'
    : !snapshot.grant ? 'grant' : snapshot.balance === null ? 'unavailable'
    : BigInt(snapshot.balance) < BigInt(snapshot.order.amount) ? 'fund' : BigInt(snapshot.balance) > BigInt(snapshot.order.amount) ? 'funding_review' : 'submit';
  return { stage, expired, residual, excess: snapshot.balance !== null && BigInt(snapshot.balance) > BigInt(snapshot.order.amount)
    ? (BigInt(snapshot.balance) - BigInt(snapshot.order.amount)).toString() : null };
}
module.exports = { strategyStatus, workOrderProgress };
