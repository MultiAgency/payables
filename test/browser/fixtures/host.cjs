/**
 * Capabilities a fixture gateway reports in `/gw/me` (Proto P2 v1.2): a host serving both areas.
 * Tests of a payables-only host pass their own list.
 */
const NEUTRAL = ['gateway-session-v1', 'agent-observe-v1', 'agent-schedule-stop-v1', 'agent-funding-v1', 'owner-treasury-v1', 'owner-intents-v1'];
const PAYABLES = ['payables-payments-v1', 'payables-agreements-v1', 'payables-work-orders-v1', 'payables-compensation-v1', 'payables-recovery-v1', 'payables-guide-v1'];
const TREASURY = ['treasury-observe-v1', 'treasury-strategy-v1', 'treasury-plans-v1', 'treasury-recovery-v1'];
module.exports = { HOST_CAPABILITIES: [...NEUTRAL, ...PAYABLES, ...TREASURY], PAYABLES_HOST_CAPABILITIES: [...NEUTRAL, ...PAYABLES] };
