import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { sessionToken } from "../src/signin.js";

const secret = "offline-provisioning-session-secret-12345678";
const listen = (server: Server) => new Promise<number>(done => server.listen(0, "127.0.0.1", () => done((server.address() as AddressInfo).port)));
const unused = async () => { const s = createServer(); const port = await listen(s); await new Promise<void>(done => s.close(() => done())); return port; };

test("hosted owners reserve isolated Payables setup; unauthorized callers cannot provision or read it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "provisioning-http-"));
  let providerCalls = 0;
  const rpc = createServer((req, res) => {
    let body = "";
    req.on("data", chunk => body += chunk).on("end", () => {
      const { id, params } = JSON.parse(body);
      let value: unknown;
      if (params?.method_name === "derived_public_key") value = "ed25519:11111111111111111111111111111111";
      if (params?.method_name === "get_policy" && params.account_id === "team.sputnik-dao.near") value = {
        roles: [{ name: "council", kind: { Group: ["alice.near"] }, permissions: ["*:*"] }],
        default_vote_policy: { weight_kind: "RoleWeight", quorum: "0", threshold: [1, 2] }, proposal_bond: "1", proposal_period: "1", bounty_bond: "1", bounty_forgiveness_period: "1",
      };
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(value !== undefined
        ? { jsonrpc: "2.0", id, result: { result: [...Buffer.from(JSON.stringify(value))], logs: [], block_height: 1, block_hash: "11111111111111111111111111111111" } }
        : { jsonrpc: "2.0", id, error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_ACCOUNT", info: { requested_account_id: params?.account_id } }, code: -32000, message: "Server error" } }));
    });
  });
  const provider = createServer((_req, res) => { providerCalls++; res.writeHead(503).end(); });
  const rpcPort = await listen(rpc), providerPort = await listen(provider);
  const port = await unused(), agentPort = await unused();
  const config = join(dir, "dashboard.json");
  writeFileSync(config, JSON.stringify({ host: "payables.test", selfService: { maxAgents: 2, firstPort: agentPort }, agents: [{ name: "legacy", owner: "legacy.near", port: await unused() }] }));
  let gateway: ChildProcess | undefined;
  let stderr = "";
  const start = async () => {
    gateway = spawn(process.execPath, ["--import", import.meta.resolve("tsx"), join(process.cwd(), "src/gateway/server.ts")], {
      cwd: dir, env: { ...process.env, PORT: String(port), DASHBOARD_FILE: config, SESSION_SECRET: secret, PAYABLES_BRIDGE_SECRET: secret,
        NEAR_RPC_URL: `http://127.0.0.1:${rpcPort}`, NEAR_INTENTS_AGENT_API_URL: `http://127.0.0.1:${providerPort}` }, stdio: ["ignore", "pipe", "pipe"],
    });
    stderr = ""; gateway.stderr!.on("data", chunk => stderr += chunk);
    await new Promise<void>((done, fail) => {
      const timer = setTimeout(() => fail(new Error(`Gateway startup timed out: ${stderr}`)), 10_000);
      gateway!.stdout!.on("data", chunk => { if (String(chunk).includes("signing in to")) { clearTimeout(timer); done(); } });
      gateway!.once("exit", code => { clearTimeout(timer); fail(new Error(`Gateway exited ${code}: ${stderr}`)); });
    });
  };
  const stop = async () => { if (gateway && gateway.exitCode === null) { const exited = new Promise(done => gateway!.once("exit", done)); gateway.kill("SIGTERM"); await exited; } };
  const call = (path: string, account?: string, input?: unknown, origin?: string) => fetch(`http://127.0.0.1:${port}${path}`, {
    method: input === undefined ? "GET" : "POST", headers: { ...(account && { cookie: `dao_session=${sessionToken(account, secret)}` }),
      ...(input !== undefined && { "content-type": "application/json" }), ...(origin && { origin }) }, body: input === undefined ? undefined : JSON.stringify(input),
  });
  try {
    await start();
    const me = await (await call("/gw/me", "alice.near")).json();
    assert.equal(me.viewer.account, "alice.near"); assert.deepEqual(me.agents, []);
    assert.equal((await call("/gw/payables", undefined, { kind: "wallet", owner: "alice.near" })).status, 401);
    assert.equal((await call("/gw/payables", "alice.near", { kind: "wallet", owner: "bob.near" })).status, 403);
    assert.equal((await call("/gw/payables", "alice.near", { kind: "wallet", owner: "alice.near" }, "https://foreign.test")).status, 403);
    assert.equal((await call("/gw/payables", "bob.near", { kind: "dao", owner: "team.sputnik-dao.near" })).status, 403);
    const request = { kind: "wallet", owner: "alice.near" };
    const first = await call("/gw/payables", "alice.near", request);
    assert.equal(first.status, 200, await first.clone().text());
    const { url } = await first.json();
    assert.deepEqual(await (await call("/gw/payables", "alice.near", request)).json(), { url });
    assert.equal((await call(`${url}rpc/setup`, "bob.near", {})).status, 403);
    const setup = await (await call(`${url}rpc/setup`, "alice.near", {})).json();
    assert.equal(setup.json.agentId, null);
    const altered = await call(`${url}rpc/owner/prepare`, "alice.near", { json: { signer: "wallet", action: { type: "agent_create", role: "payout", owner: { type: "near", account_id: "bob.near", public_key: "ed25519:11111111111111111111111111111111" } } } });
    assert.equal(altered.status, 400); assert.match(await altered.text(), /reserved owner/);
    const platform = (body: unknown, token = secret) => fetch(`http://127.0.0.1:${port}/platform/payables`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    });
    const dao = await platform({ version: 1, action: "reserve", actor: "alice.near", kind: "dao", owner: "team.sputnik-dao.near" });
    assert.equal(dao.status, 200, `${await dao.clone().text()} ${stderr}`);
    const publicMe = await (await call("/gw/me")).json();
    assert.ok(!publicMe.agents.some((a: { name: string }) => a.name.startsWith("pay-")));
    const read = { version: 1, action: "status", actor: "alice.near", owner: "alice.near", kind: "wallet" };
    assert.equal((await platform(read, "wrong-secret")).status, 403);
    assert.equal((await platform({ ...read, actor: "bob.near" })).status, 403);
    assert.equal((await platform({ ...read, action: "pay" })).status, 400);
    assert.equal((await platform({ ...read, signedData: {} })).status, 400);
    const observed = await platform(read);
    assert.equal(observed.status, 200, await observed.clone().text());
    const result = await observed.json();
    assert.equal(result.owner, "alice.near");
    assert.equal(result.workspaceUrl, `https://payables.test${url}`);
    assert.equal(result.agentId, null);
    assert.equal(result.invoiceUrl, null);
    assert.deepEqual(result.payments, []);
    assert.equal(observed.headers.get("cache-control"), "private, no-store");
    assert.equal(providerCalls, 0, "reservation and rejected setup send no provider requests");
    await stop(); await start();
    assert.deepEqual(await (await call("/gw/payables", "alice.near", request)).json(), { url });
  } finally { await stop(); rpc.close(); provider.close(); }
});
