import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { loadConfig } from "../src/gateway/config.js";

// Proto runs the production executors. No image or deploy config in this repository may start an
// executing agent anywhere: the configured host is not where it runs (DASHBOARD_HOST overrides it at
// runtime), and a second executor breaks "one executor per agent".
const root = new URL("../", import.meta.url);
const path = (name: string) => new URL(name, root).pathname;

/** Why a gateway configuration would execute, or nothing if it can't. */
function executors(file: string): string[] {
  const config = loadConfig(path(file));
  return [
    // `executor` defaults to true, so a configured agent executes unless it says otherwise.
    ...config.agents.filter(agent => agent.executor).map(agent => `${file}: agent ${agent.name} executes`),
    // Self-provisioned agents always run as executors.
    ...(config.selfService ? [`${file}: self-provisioned agents execute`] : []),
  ];
}

const deployConfigs = readdirSync(path("deploy")).filter(name => name.endsWith(".json")).map(name => `deploy/${name}`);
const dockerfiles = readdirSync(path(".")).filter(name => /^Dockerfile(\.[\w-]+)?$/.test(name));

test("no deploy config starts an executor, whatever its host", () => {
  assert.deepEqual(deployConfigs.flatMap(executors), []);
});

test("every image's default configuration exists and starts no executor", () => {
  for (const dockerfile of dockerfiles) {
    const file = readFileSync(path(dockerfile), "utf8").match(/DASHBOARD_FILE=\/app\/(\S+)/)?.[1];
    assert.ok(file, `${dockerfile} names its default configuration`);
    assert.ok(existsSync(path(file)), `${dockerfile}: ${file} exists`);
    assert.deepEqual(executors(file), [], dockerfile);
  }
});

test("every hosting target builds an image checked above", () => {
  // Railway's file builds a Dockerfile on push; production deploys come from Proto.
  for (const target of readdirSync(path(".")).filter(name => /^railway.*\.json$/.test(name))) {
    const dockerfile = JSON.parse(readFileSync(path(target), "utf8")).build?.dockerfilePath;
    assert.ok(dockerfiles.includes(dockerfile), `${target} builds ${dockerfile}`);
  }
});
