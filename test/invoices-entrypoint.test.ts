import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const entry = new URL("../deploy/invoices-entrypoint.sh", import.meta.url).pathname;
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "invoices-entry-"));
  const app = join(root, "app"), data = join(root, "data");
  mkdirSync(join(app, "node_modules/.bin"), { recursive: true });
  mkdirSync(data);
  writeFileSync(join(app, "node_modules/.bin/tsx"), '#!/bin/sh\npwd\nprintf "%s\\n" "$1"\n', { mode: 0o700 });
  return { app, data, run: () => spawnSync("sh", [entry], { env: { PATH: process.env.PATH, APP_DIR: app, DATA_DIR: data }, encoding: "utf8" }) };
}
test("contributor extraction starts fresh and reopens its nested owner workspaces", () => {
  const f = fixture();
  const first = f.run();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, `${f.data}/state\n${f.app}/src/gateway/server.ts\n`);
  mkdirSync(join(f.data, "state/.payables/owner/.invoices"), { recursive: true });
  assert.equal(f.run().status, 0);
});
test("contributor extraction refuses legacy executor state without modifying it", () => {
  for (const base of ["", "state"]) for (const name of [".env", ".env.dao", ".env.payout", ".ops", ".invoices", ".owner-intents", ".work-orders"]) {
    const f = fixture();
    mkdirSync(join(f.data, base), { recursive: true });
    const file = join(f.data, base, name);
    writeFileSync(file, "retained evidence");
    const result = f.run();
    assert.equal(result.status, 1, `${base}/${name}`);
    assert.match(result.stderr, /separate volume/);
    assert.equal(result.stdout, "");
    assert.equal(readFileSync(file, "utf8"), "retained evidence");
  }
});
