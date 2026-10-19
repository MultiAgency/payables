import { ASSETS } from "@multiagency/sdk";
import { usdc } from "./compensation-ui";

/**
 * Shared payouts pay recurring reports from this agent. Setup is done once per payout agent; each report then
 * needs only its own review, preparation, submission, one owner approval and settlement. Display only: Proto
 * decides every step.
 */
export type SetupItem = { key: "agent" | "destination" | "grant" | "funding"; label: string; ready: boolean; detail: string; to: "/payees" | "/policy" | "/funding" | "/" };

type Destination = { address?: string; confidential?: boolean };
type Inputs = {
  executor: boolean;
  grant: { expiresAt: string } | null;
  policy: { destinations: { mode: string; list: Destination[] } } | null | undefined;
  book: { asset: string; confidential: bigint | string | number }[];
  payees: string[];
  /** The approved amount waiting to be paid, if any (atomic USDC). */
  amount?: string;
  now: number;
};

export function sharedPayoutSetup({ executor, grant, policy, book, payees, amount, now }: Inputs): SetupItem[] {
  const listed = policy?.destinations.mode === "only" ? policy.destinations.list : [];
  const missing = payees.filter(payee => !listed.some(d => d.address === payee && d.confidential));
  const live = grant && Date.parse(grant.expiresAt) > now;
  const balance = BigInt(book.find(holding => holding.asset === ASSETS.USDC)?.confidential ?? 0);
  const funded = amount ? balance >= BigInt(amount) : balance > 0n;
  return [
    // A payout agent either executes here or files payouts for its executor host; both serve shared payouts.
    { key: "agent", label: "Payout agent", ready: true, to: "/",
      detail: executor ? "This agent submits payouts after your approval." : "This host files payouts for your approval; the agent's executor host submits them." },
    { key: "destination", label: "Builder in the signed policy", ready: payees.length > 0 && missing.length === 0, to: "/payees",
      detail: !payees.length ? "Record an agreement first." : missing.length ? `Add ${missing.join(", ")} as a confidential destination.` : `${payees.join(", ")} ${payees.length === 1 ? "is" : "are"} an agreed confidential destination.` },
    { key: "grant", label: "Payout grant", ready: Boolean(live), to: "/policy",
      detail: live ? `Live until ${grant!.expiresAt}.` : grant ? `Expired ${grant.expiresAt}. Authorize a new grant.` : "Authorize a payout grant." },
    { key: "funding", label: "Funding", ready: funded, to: "/funding",
      detail: `${usdc(balance.toString())} USDC confidential balance${amount ? `; this payout needs ${usdc(amount)} USDC` : ""}.` },
  ];
}

/** The recurring steps for one report on the shared path, and which one is next. */
export const REPORT_STEPS = ["Review with an explicit amount", "Prepare the shared payout", "Send it for approval", "Approve the held payout", "Settlement recorded"] as const;
export function reportStep(state: string, payment: { mode: string } | null, status: string | undefined): number {
  if (state !== "approved") return 0;
  if (!payment) return 1;
  if (status === "PREPARATION_INCOMPLETE") return 1;
  if (status === "PREPARED") return 2;
  // An unknown outcome is not a step to take: follow the record until it is reviewed.
  if (status === "UNKNOWN") return -1;
  if (status === "SUCCESS") return 5;
  return 3;
}
