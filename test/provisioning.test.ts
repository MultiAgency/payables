import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProvisioningStore, provisioningEnv, checkProvisionedCreation } from "../src/gateway/provisioning.js";
import { invoicePage } from "../src/invoice-page.js";
import { loadConfig } from "../src/gateway/config.js";

test("reservation is durable, repeatable and isolated by owner", () => {
  const root = mkdtempSync(join(tmpdir(), "provisioning-"));
  const store = new ProvisioningStore(root, { maxAgents: 2, firstPort: 19000 }, []);
  const first = store.reserve("alice.near", "wallet");
  assert.deepEqual(store.reserve("alice.near", "wallet"), first);
  const second = store.reserve("team.sputnik-dao.near", "dao");
  assert.notEqual(first.directory, second.directory);
  assert.notEqual(first.port, second.port);
  assert.match(readFileSync(second.envFile, "utf8"), /TREASURY_ACCOUNT=team.sputnik-dao.near/);
  assert.deepEqual(new ProvisioningStore(root, { maxAgents: 2, firstPort: 19000 }, []).list(), [first, second]);
  assert.throws(() => store.reserve("third.near", "wallet"), /capacity/);
  unlinkSync(first.envFile);
  assert.throws(() => store.list(), /missing/i);
});

test("managed children cannot inherit another executor's secrets or routing", () => {
  const store = new ProvisioningStore(mkdtempSync(join(tmpdir(), "provisioning-")), { maxAgents: 2, firstPort: 19000 }, []);
  const record = store.reserve("alice.near", "wallet");
  const env = provisioningEnv(record, { PATH: "/bin", NEAR_INTENTS_AGENT_API_KEY: "partner",
    AGENT_ID: "other", AGENT_GRANT_TOKEN: "secret", AGENT_OWNER_PRIVATE_KEY: "private", AGREEMENTS_URL: "https://other.test", INVOICES_PORT: "1234", AUTOPILOT: "on", WORK_ORDER_ID: "other" });
  assert.equal(env.NEAR_INTENTS_AGENT_API_KEY, "partner");
  for (const key of ["AGENT_ID", "AGENT_GRANT_TOKEN", "AGENT_OWNER_PRIVATE_KEY", "AGREEMENTS_URL", "INVOICES_PORT", "WORK_ORDER_ID"])
    assert.equal(env[key], undefined, key);
  assert.equal(env.AUTOPILOT, "off");
  assert.equal(env.HOSTED_OWNER_ACCOUNT, "alice.near");
});

test("creation is bound to the reserved owner, signer and Payables role", () => {
  const env = { HOSTED_OWNER_ACCOUNT: "alice.near", HOSTED_OWNER_KIND: "wallet" };
  assert.doesNotThrow(() => checkProvisionedCreation({ role: "payout", owner: { type: "near", account_id: "alice.near" } }, "wallet", env));
  assert.throws(() => checkProvisionedCreation({ role: "payout", owner: { type: "near", account_id: "bob.near" } }, "wallet", env), /owner/);
  assert.throws(() => checkProvisionedCreation({ role: "treasury", owner: { type: "near", account_id: "alice.near" } }, "wallet", env), /Payables/);
  assert.throws(() => checkProvisionedCreation({ role: "payout" }, "dao", env), /signer/);
  const dao = { HOSTED_OWNER_ACCOUNT: "team.sputnik-dao.near", HOSTED_OWNER_KIND: "dao", TREASURY_ACCOUNT: "team.sputnik-dao.near" };
  assert.doesNotThrow(() => checkProvisionedCreation({ role: "payout" }, "dao", dao));
  assert.throws(() => checkProvisionedCreation({ role: "payout" }, "dao", { ...dao, TREASURY_ACCOUNT: "other.near" }), /owner/);
});

test("a fresh self-service host needs no preconfigured agent; scoped intake uses its own paths", () => {
  // Self-service is a local and test capability; no deploy config here enables it on a production host.
  const file = join(mkdtempSync(join(tmpdir(), "self-service-")), "payables.json");
  writeFileSync(file, JSON.stringify({ host: "localhost", selfService: { maxAgents: 10, firstPort: 9000 }, agents: [] }));
  const config = loadConfig(file);
  assert.deepEqual(config.agents, []);
  assert.equal(config.selfService?.maxAgents, 10);
  const scope = "/requests/pay-" + "a".repeat(24);
  const page = invoicePage("Submit an invoice", scope);
  assert.ok(page.includes(`from "${scope}/invoice-browser.js"`));
  assert.ok(page.includes(`, "${scope}");`));
  assert.throws(() => invoicePage("Submit", '/requests/";fetch("https://bad.test")'), /scope/);
  assert.ok(invoicePage("Submit").includes('from "/invoice-browser.js"'), "legacy invoice hosts keep their paths");
});
