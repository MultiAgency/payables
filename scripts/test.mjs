import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { liveFiles, offlineFiles, offlineEnvironment, requireLiveConfiguration } from "./test-environment.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const live = process.argv[2] === "live";
const requested = process.argv.slice(3);
if (requested[0] === "--") requested.shift();
if (!["offline", "live"].includes(process.argv[2]) || live && requested.length) throw new Error("Usage: node scripts/test.mjs offline [test files] | live");
let env;
if (live) {
  const local = new URL("../.env", import.meta.url);
  env = { ...(existsSync(local) ? parseEnv(readFileSync(local, "utf8")) : {}), ...process.env, PROTO_TEST_MODE: "live" };
  // Match instance-specific configuration without importing application modules or printing values.
  if (env.ENV_FILE && env.ENV_FILE !== ".env") {
    for (const key of ["AGENT_ID", "AGENT_GRANT_TOKEN", "AGENT_GRANT_TOKEN_PENDING", "TREASURY_ACCOUNT", "TREASURY_CONFIDENTIAL", "AUTOPILOT"]) delete env[key];
    Object.assign(env, parseEnv(readFileSync(new URL(env.ENV_FILE, new URL("../", import.meta.url)), "utf8")));
  }
  requireLiveConfiguration(env);
} else env = offlineEnvironment();
const guard = fileURLToPath(new URL(live ? "../test/fixtures/live-network.cjs" : "../test/fixtures/offline-network.cjs", import.meta.url));
// Inherited by fixture subprocesses too. Never accept a caller's arbitrary preloads.
env.NODE_OPTIONS = `--require ${JSON.stringify(guard)}`;
const files = live ? liveFiles : offlineFiles(readdirSync(new URL("../test/", import.meta.url)), requested);
if (!files.length) throw new Error("No tests discovered");
// Failing tests name themselves in a file that outlives the console: an intermittent failure is never lost.
mkdirSync(new URL("../.test-artifacts/offline/", import.meta.url), { recursive: true });
const failures = fileURLToPath(new URL(`../.test-artifacts/offline/failures-${new Date().toISOString().replace(/[:.]/g, "-")}.log`, import.meta.url));
const reporters = ["--test-reporter=spec", "--test-reporter-destination=stdout", `--test-reporter=${fileURLToPath(new URL("./failure-reporter.mjs", import.meta.url))}`, `--test-reporter-destination=${failures}`];
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...reporters, ...files.map(name => `test/${name}`)], { cwd: root, env, stdio: "inherit" });
if (result.error) console.error(result.error.message);
if (existsSync(failures) && statSync(failures).size === 0) rmSync(failures);
else if (existsSync(failures)) console.error(`Failing tests recorded in ${failures}`);
process.exitCode = result.status ?? 1;
