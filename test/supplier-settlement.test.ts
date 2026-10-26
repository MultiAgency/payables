import assert from "node:assert/strict";
import { test } from "node:test";
import { advance, type Event, MAX_COST_BPS, progress, request, type State, type Terms } from "../src/supplier-settlement.js";

const now = Date.parse("2026-10-20T00:00:00Z");
const terms: Terms = { supplier: "supplier.near", asset: "nep141:usdc", amount: "5000000", invoiceId: "inv-1", until: "2026-10-27T00:00:00Z" };
const quote = { asset: terms.asset, amountOut: "5000000", costBps: 20 };
const run = (state: State, events: Event[], at = now) => events.reduce((s, e) => advance(s, e, at), state);
const happy: Event[] = [{ type: "agree", terms }, { type: "fund", terms, asset: "nep141:near", amount: "3000" }, { type: "convert", terms, quote },
  { type: "hold", terms }, { type: "approve", terms }, { type: "provider", terms, status: "SUCCESS" }];

test("a supplier is paid end to end through every stage, in order", () => {
  let state: State = request(terms);
  assert.equal(state.stage, "requested");
  const seen: string[] = [state.stage];
  for (const event of happy) { state = advance(state, event, now); seen.push(state.stage); }
  assert.deepEqual(seen, ["requested", "agreed", "funded", "converted", "held", "approved", "settled"]);
  assert.equal(progress("settled"), 6);
});

test("a request is not an agreement, and an approval is not a payment", () => {
  assert.equal(run(request(terms), [{ type: "fund", terms, asset: "a", amount: "1" }]).stage, "refused", "funding a mere request is refused");
  const approved = run(request(terms), happy.slice(0, 5));
  assert.equal(approved.stage, "approved");
  for (const status of ["PROCESSING", "SENT", "UNCERTAIN", "PENDING_APPROVAL", "anything"])
    assert.equal(advance(approved, { type: "provider", terms, status }, now).stage, "approved", `${status} does not settle`);
  assert.equal(advance(approved, { type: "provider", terms, status: "FAILED" }, now).stage, "failed");
});

test("stages cannot be skipped or repeated", () => {
  const converted = run(request(terms), happy.slice(0, 3));
  assert.equal(advance(converted, { type: "approve", terms }, now).stage, "refused", "approval needs a hold first");
  assert.equal(run(request(terms), [{ type: "agree", terms }, { type: "hold", terms }]).stage, "refused");
  assert.equal(run(request(terms), [{ type: "agree", terms }, { type: "agree", terms }]).stage, "refused");
});

test("changed terms are refused at every stage", () => {
  for (const change of [{ amount: "4999999" }, { supplier: "other.near" }, { asset: "nep141:usdt" }, { invoiceId: "inv-2" }, { until: "2026-10-28T00:00:00Z" }]) {
    const changed = { ...terms, ...change };
    for (let upTo = 0; upTo < happy.length; upTo++) {
      const before = run(request(terms), happy.slice(0, upTo));
      const event = { ...happy[upTo]!, terms: changed } as Event;
      const after = advance(before, event, now);
      assert.equal(after.stage, "refused", `${JSON.stringify(change)} at ${happy[upTo]!.type}`);
    }
  }
});

test("an expired order starts nothing new, but a sent payment still receives its outcome", () => {
  const late = Date.parse(terms.until) + 1;
  for (let upTo = 0; upTo < 4; upTo++) assert.equal(advance(run(request(terms), happy.slice(0, upTo)), happy[upTo]!, late).stage, "expired", happy[upTo]!.type);
  const approved = run(request(terms), happy.slice(0, 5));
  assert.equal(advance(approved, { type: "provider", terms, status: "SUCCESS" }, late).stage, "settled");
  assert.equal(advance(run(request(terms), happy.slice(0, 4)), { type: "approve", terms }, late).stage, "expired", "approval after the deadline is too late");
});

test("a conversion must produce the agreed asset, cover the amount, and stay under the cost cap", () => {
  const funded = run(request(terms), happy.slice(0, 2));
  const convert = (q: Partial<typeof quote>) => advance(funded, { type: "convert", terms, quote: { ...quote, ...q } }, now).stage;
  assert.equal(convert({}), "converted");
  assert.equal(convert({ asset: "nep141:usdt" }), "refused");
  assert.equal(convert({ amountOut: "4999999" }), "refused");
  assert.equal(convert({ costBps: MAX_COST_BPS + 1 }), "refused");
  assert.equal(convert({ costBps: MAX_COST_BPS }), "converted");
  assert.equal(convert({ costBps: Number.NaN }), "refused");
});

test("a finished order never changes again", () => {
  const settled = run(request(terms), happy);
  assert.equal(advance(settled, { type: "agree", terms }, now), settled);
  const refused = advance(request(terms), { type: "fund", terms, asset: "a", amount: "1" }, now);
  assert.equal(advance(refused, happy[0]!, now), refused);
});
