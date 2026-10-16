# Standalone Payables sign-in release — 2026-10-15 r2

**Frozen local candidate; not deployed, pushed, restarted or authorized to ship.** No domain/DNS
change or money action was performed. This release is separate from Proto's shared release.

## Exact candidate

Local image: `payables-standalone-signin:20261015-r2` (linux/amd64).
Image ID: `sha256:46531194c4490ca9629437cd5866fdc48e2ff9bc4ae34817709e25b7440b5edf`.
Pinned Node base: `node:24-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5`.

Review artifacts are under this repository's ignored `.test-artifacts/`:

- `payables-standalone-signin-20261015-r2.image.tar`: exact executable image export.
- `payables-standalone-signin-20261015-r2.source.tgz`: frozen source, packaged frontend bytes,
  Dockerfile, offline tests, review patch, file manifests, logs and this runbook.
- `payables-standalone-signin-20261015-r2.SHA256SUMS`: archive hashes, also recorded in the
  accompanying `docs/standalone-signin-artifacts-r2.json`. Verify these before loading, extracting or publishing.
- `standalone-signin-20261015-r2/review/`: readable local review material.

The backend baseline is Git `adf71a8f39d5a098fbad8f5ff9b4dcfd7615d031`, with exactly three runtime
file changes: `src/gateway/server.ts`, `src/gateway/config.ts` and new
`src/gateway/signing-host.ts`. `review/backend.patch` describes that delta. Money-path files match
the baseline. Unrelated contributor/integration backend edits remain in the working checkout and
are excluded from this candidate. No Git reset, commit or working-tree overwrite was used.

R2 copies all deployed application bytes captured read-only from deployment
`083e4cd0-c940-4480-a3c7-cf3756319edf`, provider image digest
`sha256:83c83624bbba29aeb6a0eb62e34a8e08f85de56424b6a9fe07773fbfc0f5b9c0`.
The backend before the signing fix matches that Git baseline byte-for-byte. All other captured
runtime files remain identical, including deployed `tsconfig.json` and all 28 frontend files.
Both public hostnames served those frontend files with matching hashes. No frontend is rebuilt.
The frontend source in the archive is baseline verification context; the image copies the exact
compiled deployed bytes. Additional gateway-contract source is verification-only.
See [every production/r1 difference](standalone-signin-production-comparison.md) and
`review/production-comparison.json`. R1 remains intact for audit and is superseded by this r2.

The archive manifest binds individual files; the image check verifies all 138 copied runtime files.
The Dockerfile selects the standalone config and preserves the existing stopped-state entrypoint.
The reference Railway config selects that Dockerfile, one replica, ON_FAILURE retries 10 and
a null healthcheck, matching the observed provider service-manifest values. Keep existing service
settings and region; do not add the unrelated r1 healthcheck/retry changes. Provider property-file
precedence must be rechecked before any future source upload; do not upload the mutable repository checkout.
Rebuilding produces a new image whose ID must be recorded and checked; the exported image is the
exact executable candidate reviewed here. No production state, settings files, credentials,
cookie exports or `node_modules` symlink are included in the source archive.

## Effective configuration change

Apply to the **standalone Payables gateway service only**, after authorization:

```text
DASHBOARD_SIGNIN_HOSTS=payables-production.up.railway.app
```

Keep `deploy/payables.json.host=payables.multiagency.ai`. Effective canonical `HOST` is
`hostOf(DASHBOARD_HOST || config.host)`; `DASHBOARD_HOST` must therefore remain absent/empty or name
`payables.multiagency.ai`, never the generated host. Candidate image default:
`DASHBOARD_FILE=/app/deploy/payables.json`. Retain the actual service's existing settings if they
match the reviewed standalone contract; do not replace an unknown production override blindly.

The canonical host remains the source of supplier and bridge URLs. Only `/gw/challenge` and
`/gw/session` select the exact request Host from the canonical name plus the explicit alias.
Unknown signing hosts refuse; forwarded-host headers do not choose signing authority. No alias
means legacy behavior. Session cookies stay host-only, Secure, HttpOnly and SameSite=Strict;
signatures cannot authenticate across the two hosts. The alias is excluded from child environments.

Preserve `SESSION_SECRET`, partner/provider origins and credentials, `PORT`, proxy settings,
self-service limits/ports, configured agents, nested owner settings and executor assignments.
Do not introduce restore/bootstrap variables, rotate secrets, alter schedules or change domains.
This is no state-format migration and does not import `.payables` into Proto `.hosted`.

## Validation of this isolated candidate

- `pnpm typecheck`: passed (local existing locked dependencies).
- `pnpm test`: **732 offline tests passed, zero failed**; log `review/offline-tests.log`.
  This count belongs to the isolated baseline plus release tests, rather than the earlier 741-test
  working-tree result, which included unrelated changes.
- Real-gateway offline sign-in verifies both hosts with synthetic keys and a loopback full-access
  key fixture; checks host-only cookies, cross-host refusal, unknown-host refusal and unchanged
  canonical supplier mapping. No reservation or provider agent is created.
- `docker build --platform linux/amd64`: passed with the pinned base and frozen lockfile.
- Packaged image check: **passed**, `--network none`, no production mount, synthetic `/tmp` state.
  It checks 138 hashes, both challenge recipients, health/static page bytes, unknown signing-host
  refusal and two entrypoint starts preserving empty `.payables` registry and synthetic settings/
  record sentinels. This is not a production backup/restore test or a populated-registry restore.
  Existing offline provisioning tests cover retained registrations; inspect the full suite log.
- No live acceptance or live-funds tests were run. Real wallet/provider/CDN behavior remains unverified.

Reproduce the packaged image check after verifying and loading the exact image export:

```sh
docker load --input payables-standalone-signin-20261015-r2.image.tar
docker image inspect payables-standalone-signin:20261015-r2 --format '{{.Id}}'
# In the extracted source directory:
docker run --rm --platform linux/amd64 --network none \
  --mount type=bind,src="$PWD/review",dst=/review,readonly \
  --entrypoint node payables-standalone-signin:20261015-r2 /review/check-image.mjs
```

Do not run the production entrypoint against a live or copied production volume during review.
Offline source reproduction uses `pnpm install --frozen-lockfile`, `pnpm typecheck`, and `pnpm test`;
dependency installation may require network access, while tests use the offline network barrier.

## Stopped-writer release sequence — only after authorization

1. Privately pin the CURRENT standalone deployment ID/image digest, service/build/start overrides,
   complete effective configuration, volume ID/mount, domain attachments and executor assignments.
   Compare baseline backend and packaged frontend hashes to that deployment. Review all active
   writers, schedules, unresolved operations and attempted owner signatures. Resolve discrepancies
   before starting; do not infer production identity from Git HEAD or this empty fixture.
2. Agree on the maintenance window. Block new intake and owner actions; stop this standalone
   gateway **and every child writer** gracefully. Verify the old deployment cannot restart or
   overlap its replacement. Do not freeze policy on chain or disable grants for this procedure.
   Sibling Proto/dao, Treasury and invoices services retain their existing assignments.
3. With all relevant writers stopped, back up the **whole original volume**, including `/data/state`,
   permissions, nested `.env` settings, `.initialized`, `.payables/registry.json` and every registered
   instance directory. Preserve all SQLite databases and applicable WAL/SHM files, and every
   `.ops/`, `.invoices/`, `.owner-intents/`, `.strategy/`, `.plans/`, `.evidence/`, `.inbox/`, `.agreements/`,
   `.notify/`, `.work-orders/` and other retained file. Keep backups and identity inventories private.
   Hash the backup and demonstrate file/SQLite integrity in an isolated restore location with
   executors and external network disabled. A copy of active SQLite files is not this backup.
4. Apply only the signing alias to the standalone service; retain canonical host, volume mount and
   all existing settings. Publish the reviewed image after authorization, pin its returned registry
   digest, and verify it corresponds to this local image. If using a source build, freeze and
   separately validate the resulting image rather than calling it this executable candidate.
5. Start **one** replacement replica on the **same** original volume only after the old writers are
   proven stopped. Preserve each instance's executor/approve-only assignment. The lease coordinates
   one host; it is not distributed fencing. Verify settings/registrations/retained identities against
   the private baseline before reopening intake. Do not seed missing settings or create replacements.
6. Perform the read-only acceptance below. Keep intake closed on failure and decide rollback or
   forward repair. Reopen intake only after acceptance and the user's release decision.

## Acceptance after authorization

Use the existing authenticated browser or normal visible wallet sign-in. Never export cookies or
request keys. On **both** `payables.multiagency.ai` and `payables-production.up.railway.app`, verify:

- Challenge recipient equals the hostname visited, TLS/routing and static assets load, then a fresh
  owner-controlled sign-in succeeds and `/gw/me` returns an authenticated viewer.
- Existing private workspace/records open for the expected owner; privately compare agent identity,
  executor assignment and retained record identities with the stopped-writer baseline. Confirm
  unauthorized private access remains refused. A loaded shell or healthy endpoint is insufficient.
- If the authenticated workspace has no agents, record **authenticated access verified; workspace
  empty; private agent-record access not established**. Do not create an agent to fill the check.
- Canonical supplier/bridge URLs still use `payables.multiagency.ai` where configured; selected-agent
  links, retained query parameters, missing-link refusal and exact existing work-order IDs/reload
  remain intact. Do not submit an invoice or sign any owner action, grant or payment.

Record acceptance time, deployment digest and results privately; document only calibrated public
claims. Keep the known live sign-in failure until these observations supersede it. Domain moves and
the Proto shared release require their own authorization regardless of this result.

## Rollback

Stop new intake and the replacement gateway/child writers first; verify no overlap. Capture and
preserve the current post-release state. Restore the privately pinned previous image and previous
configuration (including prior absent/value of `DASHBOARD_SIGNIN_HOSTS`), on the **same current
volume** and with the original executor assignments. Keep domains and canonical host unchanged.
Start one replica only after replacement writers are stopped, then verify canonical sign-in and
retained records. The old image again has the generated-host sign-in limitation.

Never overwrite the current journal or registry with a stale backup, remove an unresolved record,
resubmit an attempted owner signature, or retry an invoice because routing failed. If the prior
image cannot read current records, preserve them, keep intake closed and prepare forward recovery.
Backup restoration requires a separate reconciliation decision; it is not the normal rollback.

Open release gates: approval; fresh production baseline confirmation (the read-only comparison passed); stopped-writer backup
and isolated restore; verified no-overlap rollout; live sign-in on both hostnames; and existing
private access or separately reported empty authenticated workspace.

Repository guidance: `AGENTS.md`, `CONTEXT.md`, `docs/operations.md`,
`docs/payables-self-service.md` and `docs/proto-release-handoff.md`. No additional skill was needed
for this local packaging task. Prior visible-wallet evidence used the browser skills cited in the
Proto handoff; live acceptance must follow those credential/session boundaries.
