import { createHash } from "node:crypto";

/**
 * Supplier settlement (idea 03): the stages a purchase order passes from a supplier's request to a settled payment,
 * as a pure model with no I/O. It is the contract a later dispatch integration must satisfy, proven offline first.
 *
 *   requested -> agreed -> funded -> converted -> held -> approved -> settled
 *
 * and the terminal outcomes `expired`, `refused` and `failed`. Two distinctions are structural, not conventions:
 * a request is not an agreement (only the owner's `agree` leaves `requested`), and an approval is not a payment
 * (only a proven provider `SUCCESS` reaches `settled`). The terms are fixed at agreement; any event carrying
 * different terms is refused. After the deadline nothing new starts; an operation already sent keeps its outcome.
 */
export type Terms = { supplier: string; asset: string; amount: string; invoiceId: string; until: string };
export type Stage = "requested" | "agreed" | "funded" | "converted" | "held" | "approved" | "settled" | "expired" | "refused" | "failed";
export type State = { stage: Stage; termsDigest: string; reason?: string };
export type Event =
  | { type: "agree"; terms: Terms }
  | { type: "fund"; terms: Terms; asset: string; amount: string }
  | { type: "convert"; terms: Terms; quote: Quote }
  | { type: "hold"; terms: Terms }
  | { type: "approve"; terms: Terms }
  | { type: "provider"; terms: Terms; status: string };
/** A conversion quote: what the inbound asset buys in the settlement asset, and its cost. */
export type Quote = { asset: string; amountOut: string; costBps: number };

export const MAX_COST_BPS = 100;
const ORDER: Stage[] = ["requested", "agreed", "funded", "converted", "held", "approved", "settled"];
const FINAL = new Set<Stage>(["settled", "expired", "refused", "failed"]);

export const termsDigest = (t: Terms) => createHash("sha256").update(JSON.stringify([t.supplier, t.asset, t.amount, t.invoiceId, t.until])).digest("hex");
const positive = (value: string) => /^[1-9][0-9]{0,29}$/.test(value);

/** A new order: a supplier's request, which binds nothing until the owner agrees. */
export const request = (terms: Terms): State => ({ stage: "requested", termsDigest: termsDigest(terms) });

const refuse = (state: State, reason: string): State => ({ ...state, stage: "refused", reason });

/** The next state for an event; a refusal is a terminal state with its reason, never a silent no-op. */
export function advance(state: State, event: Event, now: number): State {
  if (FINAL.has(state.stage)) return state;
  const past = now >= Date.parse(event.terms.until);
  // Once sent, a payment's outcome still arrives after the deadline: only starting something new is cut off.
  const inFlight = state.stage === "approved" && event.type === "provider";
  if (past && !inFlight) return { ...state, stage: "expired", reason: "The deadline has passed." };
  if (event.type !== "agree" && termsDigest(event.terms) !== state.termsDigest) return refuse(state, "The terms changed after agreement.");
  switch (event.type) {
    case "agree":
      if (state.stage !== "requested") return refuse(state, "Already agreed.");
      return termsDigest(event.terms) === state.termsDigest ? { ...state, stage: "agreed" } : refuse(state, "The agreed terms differ from the request.");
    case "fund":
      if (state.stage !== "agreed") return refuse(state, "Funding needs an agreed order.");
      return positive(event.amount) ? { ...state, stage: "funded" } : refuse(state, "The funded amount is not valid.");
    case "convert": {
      if (state.stage !== "funded") return refuse(state, "Conversion needs a funded order.");
      const { quote, terms } = event;
      if (quote.asset !== terms.asset) return refuse(state, "The conversion does not produce the agreed asset.");
      if (!positive(quote.amountOut) || BigInt(quote.amountOut) < BigInt(terms.amount)) return refuse(state, "The conversion does not cover the agreed amount.");
      if (!Number.isFinite(quote.costBps) || quote.costBps > MAX_COST_BPS) return refuse(state, "The conversion costs more than allowed.");
      return { ...state, stage: "converted" };
    }
    case "hold":
      return state.stage === "converted" ? { ...state, stage: "held" } : refuse(state, "Only a converted order can be held for approval.");
    case "approve":
      return state.stage === "held" ? { ...state, stage: "approved" } : refuse(state, "Only a held payment can be approved.");
    case "provider":
      if (state.stage !== "approved") return refuse(state, "A provider outcome needs an approved payment.");
      // Anything but a proven outcome leaves the payment approved: unknown stays unknown.
      if (event.status === "SUCCESS") return { ...state, stage: "settled" };
      if (event.status === "FAILED" || event.status === "REFUNDED") return { ...state, stage: "failed", reason: event.status };
      return state;
  }
}

/** Stages in order, so a consumer can show progress; terminal outcomes have no position. */
export const progress = (stage: Stage) => ORDER.indexOf(stage);
