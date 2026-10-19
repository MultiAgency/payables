import type { Gateway } from "./gateway-contract.js";

/**
 * Owner-app capabilities (Proto P2 manifest v1) that gate optional parts of this app at runtime.
 * A feature mounts, and sends requests, only where the host's `/gw/me` reports every capability it
 * needs. A capability is compatibility, not authority: each call is still authorized by the gateway.
 */
/** The Portfolio (Treasury strategy) area: strategy, schedule, rebalance, plans, steward, runs. */
export const PORTFOLIO = ["treasury-observe-v1", "treasury-strategy-v1", "treasury-plans-v1"] as const;
/** The owning treasury link (DAO), funding from it, confidentiality and shielding. */
export const OWNER_TREASURY = ["owner-treasury-v1"] as const;

/**
 * Whether the host provides `needed`. A gateway that does not report capabilities provides none.
 * `null` means no gateway: a local agent server serving its own page is the whole platform.
 */
export function provides(gateway: Gateway | null | undefined, needed: readonly string[]): boolean {
  if (gateway === null) return true;
  return Boolean(gateway?.capabilities) && needed.every(name => gateway!.capabilities!.includes(name));
}
