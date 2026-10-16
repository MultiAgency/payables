# Payables release procedure — 2026-10-15

**Prepared only.** This is the current procedure; it replaces GHCR/publication requirements in
older handoffs. Use Railway's existing source-upload workflow on the existing Payables service.
No registry, new token, new package, frontend build or state migration is required. R2 stays frozen;
signing-fix r1 stays superseded. No production action was taken for this revision.

Guidance used: [use-railway skill](/Users/jlwaugh/.codex/skills/use-railway/SKILL.md) and its
[deployment reference](/Users/jlwaugh/.codex/skills/use-railway/references/deploy.md).
Explicit no-deployment instructions take precedence over the skill's deploy-from-directory flow.

## Inputs and completed evidence

Reuse `.test-artifacts/payables-source-release-20261015/{maintenance,release,rollback}` unchanged.
Its existing `manifest.json` binds every upload file; no mutable checkout, `railway.json`, secrets,
state or node_modules symlinks are uploaded. Archive hashes are already recorded there.
[R2 evidence](standalone-signin-release-r2.md): typecheck, 732 offline tests, both-host synthetic
sign-in and 138 packaged runtime hashes passed. All 28 frontend files match deployed bytes.
[Preservation evidence](stopped-volume-access-artifacts.json): isolated synthetic backup/restore
passed ownership, permissions, links, ACLs/xattrs and real SQLite DB/WAL/SHM checks.
Original-byte rollback passed 137 runtime hashes. Reuse these results; no repackaging or repeat
suite is needed absent a change. Railway builds new images: record their identities and verify
packaged hashes, rather than claiming they are the previous local executable images.

## Authorized-window sequence

1. **Pin recovery and preserve configuration before stopping.** Reconfirm historical rollback is
   available to deployment `083e4cd0-c940-4480-a3c7-cf3756319edf`, image
   `sha256:83c83624bbba29aeb6a0eb62e34a8e08f85de56424b6a9fe07773fbfc0f5b9c0`.
   Review its configuration diff. This target was previously observed, not freshly verified here.
   The existing `rollback/` source context is the fallback original-application recovery route;
   it builds a new image, not the original OS/dependency image. Privately record current instance
   IDs, original volume ID/mount `/data`, settings, registrations and executor assignments.
   Preserve domains, secrets, region, replicas, build/start/health/retry settings and canonical
   `DASHBOARD_HOST=payables.multiagency.ai`. Reject unexpected drift, pending rollouts or overrides
   that would start application code in maintenance. Confirm sufficient backup/restore disk space
   and no uncaptured nested mounts/external symlink targets.

2. **Close intake; stop every writer; start maintenance only.** Stop the existing gateway and
   children; verify provider instances are stopped and cannot overlap or restart. Source-upload
   the existing `maintenance/` context to the same service/volume. Verify unchanged configuration,
   the original volume, reviewed helper hashes and tool versions, no application code/processes,
   and zero old writers. This brief maintenance deployment is needed because Railway file access
   requires a running container; it starts only `sleep infinity`, never an executor.

3. **Make a recoverable whole-volume backup.** On the verified maintenance replica run
   `/maintenance/backup.sh <new-window-id>`. Download the five files from
   `/tmp/payables-volume-backup/<new-window-id>/` using individual `railway service files ... download`
   calls: `whole-volume.tar`, `stopped-tree.json`, `acl.txt`, `xattrs.txt`, `SHA256SUMS`.
   Verify checksums and keep copies private/off-container before stopping maintenance.
   The reviewed helper captures all hidden state/settings, `.payables`, registrations, records,
   numeric owners, permissions, links, ACLs/xattrs and SQLite sidecars; require source before/after
   comparison to pass. Reads can affect access times. Restore into disposable Linux storage using
   the existing reviewed maintenance image, `/backup` read-only, `--network none`, and
   `/maintenance/restore-check.sh` with a fresh `/restore`. Require metadata/content comparison,
   SQLite quick/foreign-key checks, sidecar pairing and reference checksums to pass. Never mount
   production into the drill or start application code. Zero databases means zero coverage.
   Exact helper/transfer/drill commands remain in [stopped-volume access](stopped-volume-access.md);
   its obsolete registry prerequisites are superseded by this source-upload procedure.

4. **Apply the sole alias change and source-deploy r2.** After backup/restore pass, set only
   `DASHBOARD_SIGNIN_HOSTS=payables-production.up.railway.app` on the standalone gateway using
   `railway variable set ... --skip-deploys`. Stop maintenance, verify it exited, then upload the
   existing `release/` context. Capture the submitted deployment ID and wait for **that deployment's
   SUCCESS**; an upload/exit 0 is insufficient. Record the new image identity and check 138 runtime
   hashes. Confirm the original volume/configuration, retained settings/registrations and exactly
   one executor per existing agent, with approve-only assignments preserved. The lease is
   single-host coordination, not distributed fencing. Explain any startup record changes privately.

5. **Accept on both hostnames before reopening.** On `payables.multiagency.ai` and
   `payables-production.up.railway.app`, separately verify challenge recipient equals the visited
   hostname, fresh normal visible owner-controlled wallet sign-in, authenticated `/gw/me`, and
   existing private records/identities and selected-record reload. Signed-out private reads must
   refuse. Never export cookies or request keys. If authenticated but no agent exists, report
   **authenticated access verified; workspace empty; private agent-record access not established**;
   do not create/reserve an agent. Retain canonical supplier URLs, selected-agent `/i/<instance>/`
   links, query fields and exact workOrder IDs; missing links remain unavailable. Proto r2's static
   mapping stays `https://invoices.multiagency.ai/submit`. Do not submit anything or sign an owner
   action, grant or payment. Reopen only after acceptance and the owner's release decision.

6. **Recover on any failed gate.** Stop replacement/maintenance and all children; verify zero
   writers. Preserve the **current** original volume and post-start records. Prefer the pinned
   historical dashboard rollback after reviewing its image/variable diff. Otherwise restore the
   previous alias value/absence with `railway variable edit ... --skip-deploys` in a private terminal
   (review only that diff; no `--reveal`), then source-upload existing `rollback/`. Verify original
   runtime hashes, unchanged volume/settings/assignments, one instance, canonical sign-in and
   retained private access. The old generated-host limitation returns. Never overwrite current
   journals with the pre-window backup, discard unresolved records or retry attempted signatures.
   If recovery cannot preserve/read records, keep writers stopped and intake closed and report the
   outage for forward recovery. Native volume restore requires a separate reconciliation decision.

All future CLI operations must explicitly target project `0c5d641c-592a-47f4-8606-48d07a91d276`,
service `9a46b1a2-c1d7-4ff2-aede-f82846743243`, environment `production`. Source uploads use
`railway up <existing-context> --path-as-root --no-gitignore --project <id> --service <id>
--environment production -m <summary>`. Use the skill's caller/session telemetry prefixes, capture
returned IDs and poll the exact deployment. Never upload the mutable repository or operate sibling
Proto/Treasury/invoices services. No production commands are authorized by this document alone.

## What remains

There is no registry blocker. We still need an authorized downtime window to confirm rollback
availability, make the real stopped-volume backup and prove it restores correctly. Then the owner
must complete real sign-in on both hosts and check existing private access. These live checks have
not happened; healthy pages and synthetic tests do not replace them. No deployment, restart,
domain move, configuration change, volume change or money action occurred in this preparation.
