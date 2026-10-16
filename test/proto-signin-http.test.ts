import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKey, Near, type PrivateKey } from "near-kit";

test("real gateway signs in on explicit fallback and canonical hosts without reserving an agent", async () => {
  const custom = "payables.multiagency.ai", fallback = "payables-production.up.railway.app";
  const listen = (server: ReturnType<typeof createServer>) => new Promise<number>(resolve => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
  const rpc = createServer((req, res) => {
    let body = "";
    req.on("data", chunk => body += chunk).on("end", () => {
      const { id, params } = JSON.parse(body);
      assert.equal(params.request_type, "view_access_key");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id, result: { nonce: 1, permission: "FullAccess", block_height: 1, block_hash: "11111111111111111111111111111111" } }));
    });
  });
  const dir = mkdtempSync(join(tmpdir(), "payables-signin-"));
  const probe = createServer();
  const port = await listen(probe);
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const rpcPort = await listen(rpc);
  const config = join(dir, "dashboard.json");
  writeFileSync(config, JSON.stringify({ host: custom, selfService: { maxAgents: 1, firstPort: 9000 }, agents: [], invoices: "https://invoices.multiagency.ai/submit" }));
  const child = spawn(process.execPath, ["--import", import.meta.resolve("tsx"), join(process.cwd(), "src/gateway/server.ts")], {
    cwd: dir, env: { ...process.env, PORT: String(port), DASHBOARD_FILE: config, DASHBOARD_HOST: "", DASHBOARD_SIGNIN_HOSTS: fallback,
      SESSION_SECRET: "offline-signin-fixture-secret-0123456789", NEAR_RPC_URL: `http://127.0.0.1:${rpcPort}` }, stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Gateway startup timed out")), 15_000);
      child.stdout.on("data", data => { if (data.toString().includes("on port")) { clearTimeout(timer); resolve(); } });
      child.once("exit", code => { clearTimeout(timer); reject(new Error(`Gateway exited ${code}`)); });
    });
    const call = (host: string, path: string, body?: unknown) => new Promise<Response>((resolve, reject) => {
      const req = request({ hostname: "127.0.0.1", port, path, method: body ? "POST" : "GET", headers: { host, "content-type": "application/json" } }, res => {
        let text = "";
        res.on("data", chunk => text += chunk).on("end", () => resolve(new Response(text, {
          status: res.statusCode, headers: { "set-cookie": res.headers["set-cookie"]?.join(";") ?? "" },
        })));
      });
      req.on("error", reject);
      req.end(body ? JSON.stringify(body) : undefined);
    });
    const key = generateKey();
    const signer = new Near({ network: "mainnet", privateKey: key.secretKey as PrivateKey, defaultSignerId: "fixture.near" });
    for (const host of [custom, fallback]) {
      const challenge = await (await call(host, "/gw/challenge")).json();
      assert.equal(challenge.recipient, host);
      const signed = await signer.signMessage({ ...challenge, nonce: Buffer.from(challenge.nonce, "base64"), callbackUrl: `https://${host}/` });
      const response = await call(host, "/gw/session", { ...signed, accountId: "fixture.near", nonce: challenge.nonce, callbackUrls: [`https://${host}/`] });
      assert.equal(response.status, 200, JSON.stringify(await response.json()));
      assert.match(response.headers.get("set-cookie")!, /HttpOnly; SameSite=Strict;.*Secure/);
      assert.doesNotMatch(response.headers.get("set-cookie")!, /Domain=/i);
    }
    assert.equal((await call("evil.test", "/gw/challenge")).status, 400);
    const otherChallenge = await (await call(custom, "/gw/challenge")).json();
    const otherSigned = await signer.signMessage({ ...otherChallenge, nonce: Buffer.from(otherChallenge.nonce, "base64") });
    assert.equal((await call(fallback, "/gw/session", { ...otherSigned, accountId: "fixture.near", nonce: otherChallenge.nonce,
      callbackUrls: [`https://${fallback}/`] })).status, 401, "custom-host signatures cannot authenticate on the fallback host");
    const discovery = await (await call(custom, "/gw/me")).json();
    assert.equal(discovery.invoices, "https://invoices.multiagency.ai/submit");
    assert.deepEqual(discovery.agents, []);
  } finally {
    child.kill();
    await new Promise<void>(resolve => child.exitCode !== null || child.signalCode !== null ? resolve() : child.once("exit", () => resolve()));
    await new Promise<void>(resolve => rpc.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});
