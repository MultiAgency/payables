import assert from "node:assert/strict";
import { test } from "node:test";
import { paymentExport, paymentRow, stateOf } from "../src/payment-export.js";
import { type Op, readOps, record } from "../src/ops.js";
import { freshDirectory } from "./fixtures/harness.js";

freshDirectory("payment-export");
const transfer = { asset: "nep141:usdc", amount: "1000000", recipient: "payee.near", confidential: true };
const op = (over: Partial<Op>): Op => ({ at: "2026-10-20T00:00:00.000Z", idempotencyKey: "k", kind: "payout", method: "transfer", request: transfer, ...over });

test("held, approved, completed, refused and unresolved payments are distinguishable", () => {
  assert.equal(stateOf(op({ correlationId: "c", status: "PENDING_APPROVAL" })), "held");
  assert.equal(stateOf(op({ correlationId: "c", status: "PROCESSING" })), "approved");
  assert.equal(stateOf(op({ correlationId: "c", status: "SUCCESS" })), "completed");
  assert.equal(stateOf(op({ correlationId: "c", status: "FAILED" })), "failed");
  assert.equal(stateOf(op({ correlationId: "c", status: "REFUNDED" })), "refunded");
  assert.equal(stateOf(op({ refused: "policy_denied" })), "refused");
  assert.equal(stateOf(op({ submissionState: "PREPARED" })), "prepared");
  // Sent with no proven outcome, or an unrecognized status, stays unresolved: never read as completed.
  assert.equal(stateOf(op({ correlationId: "c", status: "SENT" })), "unresolved");
  assert.equal(stateOf(op({ correlationId: "c", status: "UNCERTAIN" })), "unresolved");
  assert.equal(stateOf(op({ correlationId: "c" })), "unresolved");
  assert.equal(stateOf(op({})), "unresolved");
});

test("the proposal id is carried when known, and is otherwise none or unknown, never guessed", () => {
  const held = op({ correlationId: "c", status: "PENDING_APPROVAL" });
  assert.deepEqual(pick(paymentRow(held, () => 42)), { proposalId: 42, proposalState: "linked" });
  assert.deepEqual(pick(paymentRow(held, () => null)), { proposalId: null, proposalState: "none" });
  assert.deepEqual(pick(paymentRow(held, () => undefined)), { proposalId: null, proposalState: "unknown" });
  assert.deepEqual(pick(paymentRow(held)), { proposalId: null, proposalState: "unknown" });
  // Nothing was sent, so there is no correlation id to look a proposal up by.
  assert.deepEqual(pick(paymentRow(op({ submissionState: "PREPARED" }), () => 7)), { proposalId: null, proposalState: "unknown" });
});
const pick = (row: ReturnType<typeof paymentRow>) => ({ proposalId: row.proposalId, proposalState: row.proposalState });

test("the schema is strict and a row carries its payment terms and identity", () => {
  const row = paymentRow(op({ correlationId: "c", status: "SUCCESS", invoiceId: "inv1" }), () => 9);
  assert.deepEqual(row, { paymentId: "k", correlationId: "c", recipient: "payee.near", asset: "nep141:usdc", amount: "1000000", confidential: true,
    state: "completed", providerStatus: "SUCCESS", refusal: null, proposalId: 9, proposalState: "linked", invoiceId: "inv1", createdAt: "2026-10-20T00:00:00.000Z" });
  assert.equal(paymentExport.safeParse({ version: 1, payments: [row] }).success, true);
  assert.equal(paymentExport.safeParse({ version: 1, payments: [{ ...row, extra: 1 }] }).success, false);
  assert.equal(paymentExport.safeParse({ version: 2, payments: [] }).success, false);
});

test("the export reads the journal: transfers only, newest first, nothing written", async () => {
  const { exportPayments } = await import("../src/payment-export.js");
  record({ at: "2026-10-20T00:00:00.000Z", idempotencyKey: "first", kind: "payout", method: "transfer", request: transfer });
  record({ idempotencyKey: "first", correlation_id: "c1", status: "PENDING_APPROVAL" });
  record({ at: "2026-10-21T00:00:00.000Z", idempotencyKey: "swap", kind: "rebalance", method: "swap", request: { origin_asset: "a", destination_asset: "b", amount: "1" } });
  record({ at: "2026-10-22T00:00:00.000Z", idempotencyKey: "second", kind: "payout", method: "transfer", request: transfer });
  const before = readOps().length;
  const exported = exportPayments((id) => (id === "c1" ? 5 : undefined));
  assert.deepEqual(exported.payments.map((p) => [p.paymentId, p.state, p.proposalState]), [["second", "unresolved", "unknown"], ["first", "held", "linked"]]);
  assert.equal(readOps().length, before);
});
