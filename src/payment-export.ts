import { z } from "zod";
import { invoiceOperations } from "./invoice-store.js";
import { type Op, readOps } from "./ops.js";

/**
 * The payment export: one read-only row per payment this agent has recorded, for a consumer (the dashboard)
 * that matches payments to DAO proposals and budgets. It reads the local journal only: no provider call, no write.
 *
 * `state` keeps the stages apart. `approved` means the owner's approval released the payment and the provider is
 * processing it; it is not `completed`. An outcome nobody has proven is `unresolved`, never guessed.
 */
export const paymentState = z.enum(["prepared", "held", "approved", "completed", "failed", "refunded", "refused", "unresolved"]);
/** `linked`: the DAO proposal that approved it is known. `none`: proven to have no proposal (a wallet owner). `unknown`: not determined. */
export const proposalState = z.enum(["linked", "none", "unknown"]);
export const paymentExportRow = z.strictObject({
  paymentId: z.string(),
  correlationId: z.string().nullable(),
  recipient: z.string().nullable(),
  asset: z.string().nullable(),
  amount: z.string().nullable(),
  confidential: z.boolean().nullable(),
  state: paymentState,
  /** The provider's last recorded status, as received. */
  providerStatus: z.string().nullable(),
  refusal: z.string().nullable(),
  proposalId: z.number().int().nonnegative().nullable(),
  proposalState,
  invoiceId: z.string().nullable(),
  /** When the payment was first recorded here. The journal records no later timestamp, so none is invented. */
  createdAt: z.string(),
});
export const paymentExport = z.strictObject({ version: z.literal(1), payments: z.array(paymentExportRow) });
export type PaymentExportRow = z.infer<typeof paymentExportRow>;

/** What the caller knows of the DAO proposal behind a payment: its id, null for no proposal, undefined for not known. */
export type ProposalLookup = (correlationId: string) => number | null | undefined;

export function stateOf(op: Op): z.infer<typeof paymentState> {
  if (op.refused !== undefined) return "refused";
  if (op.status === undefined && op.correlationId === undefined) return op.submissionState === "PREPARED" ? "prepared" : "unresolved";
  switch (op.status) {
    case "PENDING_APPROVAL": return "held";
    case "PROCESSING": return "approved";
    case "SUCCESS": return "completed";
    case "FAILED": return "failed";
    case "REFUNDED": return "refunded";
    default: return "unresolved";
  }
}

const text = (value: unknown) => (typeof value === "string" ? value : null);

export function paymentRow(op: Op, proposalFor?: ProposalLookup): PaymentExportRow {
  const found = op.correlationId === undefined ? undefined : proposalFor?.(op.correlationId);
  return {
    paymentId: op.idempotencyKey,
    correlationId: op.correlationId ?? null,
    recipient: text(op.request.recipient),
    asset: text(op.request.asset) ?? text(op.request.origin_asset),
    amount: text(op.request.amount),
    confidential: typeof op.request.confidential === "boolean" ? op.request.confidential : null,
    state: stateOf(op),
    providerStatus: op.status ?? null,
    refusal: op.refused ?? null,
    proposalId: typeof found === "number" ? found : null,
    proposalState: typeof found === "number" ? "linked" : found === null ? "none" : "unknown",
    invoiceId: op.invoiceId ?? null,
    createdAt: op.at,
  };
}

/** Every recorded payment (transfers), newest first. Swaps and other money actions are not payments. */
export function exportPayments(proposalFor?: ProposalLookup) {
  const byKey = new Map<string, Op>();
  for (const op of [...readOps(), ...invoiceOperations()]) if (op.method === "transfer" || (op.method === undefined && "recipient" in op.request)) byKey.set(op.idempotencyKey, op);
  const payments = [...byKey.values()].sort((a, b) => b.at.localeCompare(a.at)).map((op) => paymentRow(op, proposalFor));
  return paymentExport.parse({ version: 1, payments });
}
