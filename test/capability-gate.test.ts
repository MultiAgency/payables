import assert from "node:assert/strict";
import { test } from "node:test";
import { readGateway } from "../web/src/app/gateway-contract.js";
import { OWNER_TREASURY, PORTFOLIO, provides } from "../web/src/app/capability-sets.js";

const hosted = { protocol: "https:", hostname: "payables.multiagency.ai", pathname: "/a/payout/" };
const agents = [
  { name: "payout", owner: "owner.near", dao: false, area: "payables" },
  { name: "portfolio", owner: "owner.near", dao: false, area: "treasury" },
  { name: "treasury", owner: "owner.near", dao: false },
];
const me = (extra: Record<string, unknown>) => new Response(JSON.stringify({ agents, invoices: null, viewer: null, ...extra }),
  { headers: { "content-type": "application/json" } });
const neutral = ["gateway-session-v1", "agent-observe-v1", "agent-funding-v1", "owner-intents-v1", "owner-treasury-v1"];

test("a host that does not report Portfolio capabilities presents no Portfolio agents, including legacy area-less ones", async () => {
  for (const response of [me({}), me({ capabilities: [...neutral, "payables-payments-v1"] }), me({ capabilities: [...neutral, PORTFOLIO[0]] })]) {
    const gateway = await readGateway(response, hosted);
    assert.deepEqual(gateway?.agents.map(agent => agent.name), ["payout"]);
    assert.equal(provides(gateway, PORTFOLIO), false);
  }
  const full = await readGateway(me({ capabilities: [...neutral, ...PORTFOLIO] }), hosted);
  assert.deepEqual(full?.agents.map(agent => agent.name), ["payout", "portfolio", "treasury"]);
  assert.equal(provides(full, PORTFOLIO), true);
});

test("owner-treasury features need the host to report owner-treasury-v1", async () => {
  assert.equal(provides(await readGateway(me({}), hosted), OWNER_TREASURY), false, "an unreported capability is not provided");
  assert.equal(provides(await readGateway(me({ capabilities: neutral }), hosted), OWNER_TREASURY), true);
  assert.equal(provides(undefined, OWNER_TREASURY), false, "nothing is requested before the session is known");
});

test("without a gateway, the local agent server is the whole platform", async () => {
  const local = await readGateway(new Response("<!doctype html>", { headers: { "content-type": "text/html" } }),
    { protocol: "http:", hostname: "localhost", pathname: "/" });
  assert.equal(local, null);
  assert.equal(provides(local, PORTFOLIO), true);
  assert.equal(provides(local, OWNER_TREASURY), true);
});
