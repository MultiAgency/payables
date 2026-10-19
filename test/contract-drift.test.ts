import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ownerCapabilities } from "@multiagency/sdk";
import { SDK, sdkMode } from "../scripts/release-mode.mjs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url));
const json = (path: string) => JSON.parse(read(path).toString("utf8"));
const mode = sdkMode();
// A dev build links Proto's SDK checkout and is checked by `pnpm contract:check`; a release candidate pins the tarball.
const releaseOnly = { skip: mode.mode === "release" ? false : "dev link: tarball, lockfile and provenance are checked on release candidates" };
const pin = json("vendor/contract-pin.json");

test("the release candidate installs the pinned tarball with its lockfile integrity and recorded provenance", releaseOnly, () => {
  assert.equal(pin.package, SDK);
  assert.equal(mode.spec, `file:vendor/${pin.tarball}`, "package.json installs the pinned tarball");
  const tarball = read(`vendor/${pin.tarball}`);
  assert.equal(createHash("sha256").update(tarball).digest("hex"), pin.sha256);
  const integrity = `sha512-${createHash("sha512").update(tarball).digest("base64")}`;
  assert.ok(read("pnpm-lock.yaml").toString("utf8").includes(`resolution: {integrity: ${integrity}, tarball: file:vendor/${pin.tarball}}`), "the lockfile resolves the pinned tarball by its integrity");
  assert.equal(json(`node_modules/${pin.package}/package.json`).version, pin.version);
  // Per-source hashes are compared with the source snapshot by `pnpm contract:check --proto <snapshot>`.
  const provenance = json(`vendor/${pin.provenance}`);
  assert.deepEqual(json(`node_modules/${pin.package}/provenance.json`), provenance, "installed provenance is the vendored record");
  assert.equal(provenance.snapshot.runDigest, pin.sourceSnapshot, "the package was built from the pinned snapshot");
  assert.deepEqual(provenance.dirtyPaths, [], "the package was built from a clean snapshot");
});

test("every capability the release manifest declares exists in the installed SDK's capability map", () => {
  const contract = json("web/public/contract.json");
  for (const name of [...contract.required, ...(contract.optional ?? [])]) assert.ok(name in ownerCapabilities, `unknown capability ${name}`);
  assert.equal(new Set([...contract.required, ...(contract.optional ?? [])]).size, contract.required.length + (contract.optional ?? []).length, "no capability is both required and optional");
});

test("the owner skill names the SDK package and version this release vendors", releaseOnly, () => {
  const skill = read("web/public/skill.md").toString("utf8");
  const version = skill.match(/^version: (.+)$/m)?.[1] ?? "";
  assert.ok(version.includes(`${pin.package} ${pin.version}`), `skill.md frontmatter version names ${pin.package} ${pin.version}`);
  // Every SDK package the skill mentions with a version is the pinned one.
  // Any form: `@multiagency/sdk 0.0.1`, `@multiagency/sdk@0.0.1` or `@multiagency/sdk v0.0.1`.
  for (const [mention, name, semver] of skill.matchAll(/`?(@multiagency\/[a-z-]+)`?(?:@|\s+v?)(\d+\.\d+\.\d+)/g))
    assert.equal(`${name} ${semver}`, `${pin.package} ${pin.version}`, `skill.md mentions ${mention}`);
});
