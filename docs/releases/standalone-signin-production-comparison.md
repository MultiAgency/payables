# Standalone production comparison — 2026-10-15 EDT

Read-only capture: 2026-10-16 01:12–01:18 UTC (October 15 in America/New_York).
No deployment, restart, domain change, secret export or money action occurred.

Production deployment: `083e4cd0-c940-4480-a3c7-cf3756319edf` (created 2026-10-15 14:46:17.902 UTC).
Provider image digest: `sha256:83c83624bbba29aeb6a0eb62e34a8e08f85de56424b6a9fe07773fbfc0f5b9c0`.
Railway reported one running instance. The two gateway process entries are the tsx launcher and its
Node child in that instance, not evidence of two executors. No child agent-server entry was observed.
The original volume remains mounted at `/data`, gateway cwd `/data/state`; private identifiers are
retained in `.test-artifacts/production-baseline-20261015/` (directory mode 0700).

## Every captured runtime-file difference from r1

Compared every file under deployed `/app/src`, `/app/deploy`, `/app/web/dist`, plus package.json,
pnpm-lock.yaml, pnpm-workspace.yaml and tsconfig.json against the frozen r1 image manifest.
The [machine-readable comparison](standalone-signin-production-comparison.json) includes the
complete path inventory and full SHA-256 values for every difference. No other captured application
file differs. All backend files outside the three signing-fix paths match exactly; dependency inputs
and all deploy files match. Deployed backend bytes also match the recorded r1 Git baseline before
applying the signing fix.

| Path | Difference | Meaning |
|---|---|---|
| `src/gateway/config.ts` | changed | intended signing fix |
| `src/gateway/server.ts` | changed | intended signing fix |
| `src/gateway/signing-host.ts` | r1 only | intended signing fix |
| `tsconfig.json` | production only | missing from r1 image |
| `web/dist/index.html` | changed | frontend artifact difference |
| `web/dist/static/js/async/v.63de021612.js` | production only | frontend artifact difference |
| `web/dist/static/js/async/v.63de021612.js.LICENSE.txt` | production only | frontend artifact difference |
| `web/dist/static/js/async/v.87a72e6d24.js` | r1 only | frontend artifact difference |
| `web/dist/static/js/async/v.87a72e6d24.js.LICENSE.txt` | r1 only | frontend artifact difference |
| `web/dist/static/js/async/y.598233ed24.js` | production only | frontend artifact difference |
| `web/dist/static/js/async/y.dbec7a2f62.js` | r1 only | frontend artifact difference |
| `web/dist/static/js/b.62c95d023c.js` | r1 only | frontend artifact difference |
| `web/dist/static/js/index.93bed4ba17.js` | r1 only | frontend artifact difference |
| `web/dist/static/js/index.d9de5acfed.js` | production only | frontend artifact difference |
| `web/dist/static/js/lib-react.593e14ddf0.js` | production only | frontend artifact difference |
| `web/dist/static/js/lib-react.593e14ddf0.js.LICENSE.txt` | production only | frontend artifact difference |
| `web/dist/static/js/lib-react.ec66468247.js` | r1 only | frontend artifact difference |
| `web/dist/static/js/lib-react.ec66468247.js.LICENSE.txt` | r1 only | frontend artifact difference |
| `web/dist/static/js/r.9fb1a2093e.js` | production only | frontend artifact difference |

Renamed license files have identical content where their hashes match; their paths still differ.
No semantic equivalence is assumed for changed minified JavaScript. Both live hostnames independently
served all 28 deployed frontend files with matching hashes (56 public reads); no mismatch or HTTP
failure was observed. R1 therefore was not a backend-only artifact and is superseded by r2.

## Configuration comparison

| Setting | Observed production | r1 / planned difference |
|---|---|---|
| Canonical config host | `payables.multiagency.ai` | Same |
| `DASHBOARD_FILE` | `/app/deploy/payables.json` | Same |
| `DASHBOARD_HOST` | `payables.multiagency.ai` | Preserve explicit service value; r1 image does not set it |
| `DASHBOARD_SIGNIN_HOSTS` | Absent | Only planned environment addition: `payables-production.up.railway.app` |
| `PORT` | `8080` | Supplied by service; preserve |
| `NODE_ENV` / `TRUST_PROXY` | `production` / `true` | Same image defaults |
| `DASHBOARD_AREA`, `EXECUTOR`, `APP_DIR`, `DATA_DIR` | Absent | No change |
| Self-service | max 10, first port 9000 | Same file bytes |
| Static configured agents | Empty array | Same file bytes |
| Registry | `.payables/registry.json` absent | No migration or creation; preserve state as found |
| Node runtime | v24.22.0 | Same local image version |
| Build | Dockerfile, `/Dockerfile`, no build/start override | r1 relative `Dockerfile` resolves to same path |
| Replicas / region | One, `us-west2` | Retain existing region and one replica |
| Restart policy | `ON_FAILURE`, metadata retries 10 | r1 source says 5; r2 records 10 |
| Healthcheck | Provider service-manifest value null | r1 source says `/health`; r2 records null |
| Overlap/drain/predeploy/cron/start override | null in provider metadata | Preserve; stopped-writer sequence remains required |
| Domains | Both existing hostnames active, target port 8080 | No attachment or DNS change |

The provider also reports property-file mappings for build/deploy settings, but an empty
`fileServiceManifest`. The null healthcheck is reported as provider metadata, not inferred from the
existence of `/health`. Do not introduce a healthcheck/retry-policy change as part of sign-in: the
replacement uses the existing service configuration and records those metadata values in its
reference Railway file. A future source upload must recheck provider precedence before approval.
`SESSION_SECRET` presence was confirmed; its value and other credentials were not exported or
compared. They have no candidate replacement value and must remain unchanged.

Registry absence and the empty static list establish no retained registered agent in the captured
configuration; they do **not** establish authenticated access or an empty authenticated workspace.
Both public challenges still return recipient `payables.multiagency.ai`; generated-host sign-in
remains unfixed live. Acceptance still requires visible owner-controlled sign-in on both domains,
then existing private access or a separately reported empty authenticated workspace. Create nothing.

## Replacement r2

R2 is a minimal application backport onto the captured deployed bytes: replace only
`src/gateway/server.ts`, `src/gateway/config.ts`, and add `src/gateway/signing-host.ts`.
Every other captured runtime file, including all 28 frontend files and `tsconfig.json`, matches
production exactly. Supplier/bridge host construction, settings, registry format, money path and
executor assignment code remain byte-identical. No live registration/settings/payment file is
included in the package or changed on the server.

[Replacement release runbook](standalone-signin-release-r2.md) and its artifact record pin the
candidate. Typecheck and 732 offline tests passed; the image check passed 138 runtime hashes,
both signing hosts and two synthetic-state starts with external networking disabled. The original
r1 artifacts remain intact for audit and are not the recommended release.

Scope limits: this compares packaged application bytes, dependency inputs and the explicitly
reported configuration, not every operating-system/dependency-layer byte of the live image.
The deployed Dockerfile/frontend source were not present in the captured runtime; r2 reuses
compiled deployed frontend bytes and pinned build inputs rather than claiming source provenance.
It is a new image, not the previous provider image digest. Live state was not backed up or restored;
that requires the authorized stopped-writer window. No private-record acceptance is claimed.
