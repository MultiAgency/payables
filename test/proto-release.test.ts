import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKey, Near, type PrivateKey } from "near-kit";
import { issueChallenge, verifySignIn } from "../src/signin.js";
import { readGateway, supplierUrl } from "../web/src/app/gateway-contract.js";
import { signingHost } from "../src/gateway/signing-host.js";

test("fallback callback mismatch reproduces; matching signing host works for either hostname", async () => {
  const custom = "payables.multiagency.ai";
  const fallback = "payables-production.up.railway.app";
  async function attempt(host: string, pageHost: string) {
    const challenge = issueChallenge(host);
    const key = generateKey();
    const signer = new Near({ network: "mainnet", privateKey: key.secretKey as PrivateKey, defaultSignerId: "fixture.near" });
    const signed = await signer.signMessage({ ...challenge, nonce: Buffer.from(challenge.nonce, "base64") });
    return verifySignIn({ ...signed, accountId: "fixture.near", nonce: challenge.nonce,
      callbackUrls: [`https://${pageHost}/`] }, host, async () => "FullAccess");
  }
  // Current frontend offers its page URL even when the wallet signs no callback.
  await assert.rejects(attempt(custom, fallback), /callback URL is not this site/);
  assert.equal(await attempt(custom, custom), "fixture.near");
  assert.equal(await attempt(fallback, fallback), "fixture.near");
  const select = signingHost(custom, fallback);
  assert.equal(await attempt(select(custom), custom), "fixture.near");
  assert.equal(await attempt(select(fallback), fallback), "fixture.near");
  for (const host of [undefined, "evil.test", `${fallback}.evil.test`, `${fallback}:443`]) assert.throws(() => select(host), /not configured/);
  assert.equal(signingHost(custom)(fallback), custom, "legacy behavior remains opt-in");
  for (const alias of ["https://evil.test", "evil.test/path", "user@evil.test", "evil.test?x", "evil.test#x", "UPPER.test"])
    assert.throws(() => signingHost(custom, alias), /DASHBOARD_SIGNIN_HOSTS/);
});

test("Proto r2 explicit static mapping and scoped managed mapping preserve link queries", async () => {
  const gateway = (await readGateway(Response.json({ agents: [
    { name: "payout", owner: "fixture.near", dao: false, invoices: "https://invoices.multiagency.ai/submit?source=proto&tag=a&tag=b" },
    { name: "own-fixture", owner: "fixture.near", dao: false, managed: true, invoices: "https://invoices.multiagency.ai/i/own-fixture/?source=managed" },
    { name: "missing", owner: "fixture.near", dao: false },
  ], viewer: null, setupAreas: ["payables"], invoices: "https://wrong.test/" }),
  { hostname: "payables.multiagency.ai", protocol: "https:", pathname: "/a/payout/" }))!;
  for (const name of ["payout", "own-fixture"]) {
    const selected = supplierUrl(gateway, `/a/${name}`)!;
    const url = new URL(selected);
    const id = "exact-ID /+?&=#%";
    url.searchParams.set("workOrder", id);
    const reloaded = new URL(url.href);
    assert.equal(reloaded.searchParams.get("workOrder"), id);
    assert.equal(reloaded.pathname, new URL(selected).pathname);
    assert.equal(reloaded.searchParams.get("source"), name === "payout" ? "proto" : "managed");
    if (name === "payout") assert.deepEqual(reloaded.searchParams.getAll("tag"), ["a", "b"]);
  }
  for (const name of ["missing", "unknown"]) assert.equal(supplierUrl(gateway, `/a/${name}`), undefined);
  assert.equal(supplierUrl({ ...gateway, setupAreas: undefined }, "/a/missing"), "https://wrong.test/");
});
