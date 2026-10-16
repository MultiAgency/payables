# Standalone Payables maintenance window — r2

**Preparation only. No production action is authorized or recorded here.** Leave r2 artifacts and
their packaged review files unchanged. R1 is superseded, retained for audit and excluded from release.
[Release status](standalone-signin-release-status.json), [r2 artifacts](standalone-signin-artifacts-r2.json),
[production comparison](standalone-signin-production-comparison.md).

The [provider access review and commands](stopped-volume-access.md) rule out direct stopped-volume
CLI downloads and prepare a separate maintenance-only image on the original service/volume.
That route supersedes the hypothetical raw-mount commands below unless an independent supported
raw mount is established. It needs separate authorization and an actual Railway handoff check;
the local metadata-preservation proof alone does not close the release gate.

Record each gate's UTC time, operator and evidence in the private window record. An unchecked gate
means STOP. Scope is the standalone `payables` service in `agentic-treasury / production` only.
Proto/dao, Treasury and invoices, their domains and executors stay untouched.

## 0. Pin the release and rollback before choosing the window

- [ ] User has authorized this specific window, release image publication/deployment, gateway-only
  alias addition, stopped-writer backup and isolated restore. Name the operator and owner available
  for visible wallet sign-in; record window start/end and rollback decision deadline.
- [ ] Verify r2 source SHA-256
  `69a60aac1197c708873600be17f6107e68bd51ba9d8b771d93c9201f102d4d7d`
  and image-export SHA-256
  `2faa8ee52fc73ef73650ff3b98dac4a7222c39826404cfa7bcc113a6c69f174c`.
  Loading the export must yield image ID
  `sha256:46531194c4490ca9629437cd5866fdc48e2ff9bc4ae34817709e25b7440b5edf`.
  Publish only after authorization; privately pin and verify the returned registry digest and image
  configuration/layer identity. Do not rebuild, upload the mutable checkout or use r1.
- [ ] **Original rollback identity, verified by the prior read-only capture:** deployment
  `083e4cd0-c940-4480-a3c7-cf3756319edf`, provider image digest
  `sha256:83c83624bbba29aeb6a0eb62e34a8e08f85de56424b6a9fe07773fbfc0f5b9c0`.
  Capture showed SUCCESS, one running instance and `canRedeploy: true`. This verifies identity,
  not future image retention. Reconfirm the exact historical target and rollback availability in
  Railway before removing it; do not delete it from history.
- [ ] **Verified local rollback fallback:** `payables-standalone-rollback:20261015`, image ID
  `sha256:74d4ec2b6e653b9db3a549772f3690ddd7786c6e7f2436a54bd19fae526f4f29`;
  image-export SHA-256
  `dc8933bbfc0083f9b6106111b853af631e15e35e7bcb0035e05fe8509a4c78ca`.
  [Rollback artifacts](standalone-signin-rollback-artifacts.json) include its exact export and source.
  It passed all 137 deployed application hashes, original signing behavior, static assets and two
  synthetic-state starts with external networking disabled. It is a local rebuild with the deployed
  application bytes, **not** the original Railway image or a proof of identical OS/dependency layers.
  If it will be the recovery route, obtain approval and publish/pin it before stopping production.
- [ ] Confirm an executable recovery route is available: retained original image rollback or the
  approved published local fallback. A deployment ID or `canRedeploy` alone is insufficient.
  Railway's installed CLI redeploys the latest deployment; it has no arbitrary historical rollback
  selector. Do not use `railway redeploy` to try to select the old image after r2 becomes latest.
  Historical rollback uses the selected deployment's dashboard action and restores image **and**
  custom variables; availability depends on image retention.
  [Railway deployment actions](https://docs.railway.com/deployments/deployment-actions),
  [rollback guide](https://docs.railway.com/guides/roll-back-bad-deploy).

## 1. Refresh and preserve the production baseline

- [ ] Read-only confirmation still identifies the pinned deployment, application hashes, same volume
  and `/data` mount, gateway cwd `/data/state`, one instance and no deployment in progress. Unexpected
  drift aborts this checklist until separately reviewed; do not silently rebase frozen r2.
- [ ] Privately capture the full current configuration without printing credentials. Preserve:

| Item | Required value or action |
|---|---|
| Canonical host / `DASHBOARD_HOST` | `payables.multiagency.ai`, retain explicit service value |
| `DASHBOARD_FILE` | `/app/deploy/payables.json` |
| `PORT`, `NODE_ENV`, `TRUST_PROXY` | `8080`, `production`, `true` |
| Region / replicas | Existing `us-west2`, one replica |
| Restart policy | Existing `ON_FAILURE`; metadata retries 10 |
| Healthcheck | Preserve existing configuration; provider metadata reported null |
| Start/build/predeploy/cron/overlap/drain | Preserve all existing overrides and nulls |
| `SESSION_SECRET`, provider credentials/origins | Unchanged; never export to chat/tracked files |
| Settings / self-service | Existing settings, max 10, first port 9000 |
| Executor assignments / schedules | Preserve each existing assignment and setting |
| Domain attachments | Both existing hostnames, target port 8080; no DNS/TLS changes |
| Only planned environment addition | Gateway `DASHBOARD_SIGNIN_HOSTS=payables-production.up.railway.app` |

- [ ] Compare provider property-file precedence as well as displayed settings. Preserve the live
  service configuration rather than applying a new Railway configuration file. Do not introduce
  r1's `/health` or retry-limit changes. Alias must not reach sibling services or child executors.
- [ ] Inventory registrations, settings, agent identities, executor assignments, schedules, unresolved
  operations, attempted owner signatures and external writers privately. The earlier capture had
  static `agents: []`, no `.payables/registry.json` and no child agent server; absence must remain
  absence. If this changed, review the new state before continuing. Do not create a registry/agent
  or repair missing settings as part of this release.
- [ ] Establish a provider-approved read-only mount or metadata-preserving export of the **stopped**
  whole volume, including an authoritative stopped-tree manifest. This access route is not verified
  by the present preparation. Ordinary directory downloads are not assumed to preserve ownership,
  modes, hardlinks, ACLs or xattrs. If that route cannot be provided, STOP before taking down service.
  Do not restart the production application merely to obtain backup access.

## 2. Stop every writer; capture the backup

- [ ] Announce the approved outage and stop owner/intake activity. Confirm other sessions and
  external writers are quiescent. Do not sign a policy freeze, revoke grants, change schedules,
  submit an invoice or start a run for maintenance.
- [ ] Reconfirm that the current deployment is the pinned target, then gracefully remove/stop that
  standalone deployment using Railway's deployment action. Installed CLI equivalent, **only after
  authorization and confirming its latest-deployment target**, is:

```sh
railway down --project 0c5d641c-592a-47f4-8606-48d07a91d276 \
  --service 9a46b1a2-c1d7-4ff2-aede-f82846743243 --environment production
```

- [ ] Verify stopped/removed status, zero running standalone instances, all child writers exited,
  no queued restart/redeploy and no other process using this state. No new deployment starts yet.
  A closed browser, health failure, lease file or elapsed timeout is not proof that writers stopped.
- [ ] Through the approved stopped-volume access route, take a provider full-volume snapshot and
  record its ID/time/volume identity. Also produce the portable whole-volume archive below. Neither
  operation may exclude hidden files, nested settings or SQLite sidecars. Preserve `/data/state`,
  `.payables/` and any registrations, `.initialized` and `.sqlite.initialized` markers, `.ops/`,
  `.invoices/`, `.owner-intents/`, `.strategy/`, `.plans/`, `.evidence/`, `.inbox/`, `.agreements/`,
  `.notify/`, `.work-orders/` and every other retained file. Retain source ownership/modes and any
  ACLs/xattrs. Do not inject bootstrap/restore environment variables into production.

The following commands are **planned, not executed against production**. Run only once the stopped
volume is available as a verified read-only filesystem at `STOPPED_VOLUME_ROOT`. Set the other
paths to new private directories outside that filesystem; `PAYABLES_HELPER_DIR` contains the
reviewed [verify-stopped-state.mjs](../scripts/verify-stopped-state.mjs). Its SHA-256 is
`1e680845b923a78ff0b68ce2b14402edf940e008295c3fe742d51713f157f5de`.
Use the exact r2 image ID shown below. No app entrypoint starts.

```sh
umask 077
mkdir -m 700 "$PAYABLES_BACKUP_DIR"
docker run --rm --platform linux/amd64 --network none \
  --mount type=bind,src="$STOPPED_VOLUME_ROOT",dst=/volume,readonly \
  --mount type=bind,src="$PAYABLES_BACKUP_DIR",dst=/backup \
  --mount type=bind,src="$PAYABLES_HELPER_DIR",dst=/helpers,readonly \
  --entrypoint node \
  sha256:46531194c4490ca9629437cd5866fdc48e2ff9bc4ae34817709e25b7440b5edf \
  /helpers/verify-stopped-state.mjs snapshot /volume /backup/stopped-tree.json

docker run --rm --platform linux/amd64 --network none \
  --mount type=bind,src="$STOPPED_VOLUME_ROOT",dst=/volume,readonly \
  --mount type=bind,src="$PAYABLES_BACKUP_DIR",dst=/backup \
  --entrypoint tar \
  sha256:46531194c4490ca9629437cd5866fdc48e2ff9bc4ae34817709e25b7440b5edf \
  --format=pax --numeric-owner --acls --xattrs --one-file-system \
  -cpf /backup/whole-volume.tar -C /volume .

chmod 600 "$PAYABLES_BACKUP_DIR/whole-volume.tar"
shasum -a 256 "$PAYABLES_BACKUP_DIR/whole-volume.tar" \
  "$PAYABLES_BACKUP_DIR/stopped-tree.json" > "$PAYABLES_BACKUP_DIR/SHA256SUMS"
```

- [ ] Confirm there is no nested mounted filesystem omitted by `--one-file-system`; separately
  preserve it if found. State reached through symlinks outside the volume also requires separate
  preservation; the helper and archive do not follow symlinks. Inspect archive metadata, retain any ACL/xattr inventory and keep copies
  encrypted/private outside the original volume. Verify both hashes after transfer. Unsupported
  retained file types or unreadable files are failures, not exclusions. Writers remain stopped.

## 3. Isolated restore — before starting r2

- [ ] Use an empty private scratch directory, a network-disabled disposable container, no original
  production mount, no provider credentials and no application startup. The reference archive is
  mounted read-only. Do not use Railway's production **Restore** action for this rehearsal: its
  restore applies a volume change and redeploys the service. Provider backups are constrained to
  their project/environment; keep their restore separate from this local drill.
  [Railway backups](https://docs.railway.com/volumes/backups).

```sh
mkdir -m 700 "$PAYABLES_RESTORE_DIR"
docker run --rm --platform linux/amd64 --network none \
  --mount type=bind,src="$PAYABLES_BACKUP_DIR",dst=/backup,readonly \
  --mount type=bind,src="$PAYABLES_RESTORE_DIR",dst=/restore \
  --entrypoint tar \
  sha256:46531194c4490ca9629437cd5866fdc48e2ff9bc4ae34817709e25b7440b5edf \
  --numeric-owner --same-owner --same-permissions --acls --xattrs \
  -xpf /backup/whole-volume.tar -C /restore

docker run --rm --platform linux/amd64 --network none \
  --mount type=bind,src="$PAYABLES_BACKUP_DIR",dst=/backup,readonly \
  --mount type=bind,src="$PAYABLES_RESTORE_DIR",dst=/restore,readonly \
  --mount type=bind,src="$PAYABLES_HELPER_DIR",dst=/helpers,readonly \
  --entrypoint node \
  sha256:46531194c4490ca9629437cd5866fdc48e2ff9bc4ae34817709e25b7440b5edf \
  /helpers/verify-stopped-state.mjs compare /restore /backup/stopped-tree.json

docker run --rm --platform linux/amd64 --network none \
  --mount type=bind,src="$PAYABLES_RESTORE_DIR",dst=/restore \
  --mount type=bind,src="$PAYABLES_HELPER_DIR",dst=/helpers,readonly \
  --entrypoint node \
  sha256:46531194c4490ca9629437cd5866fdc48e2ff9bc4ae34817709e25b7440b5edf \
  /helpers/verify-stopped-state.mjs sqlite /restore
```

- [ ] Exact file/path, content-hash, numeric-owner, mode and link comparison passes. Independently
  verify retained ACLs/xattrs and timestamps where present; the helper does not check those metadata
  classes. The scratch filesystem must support original metadata; a platform that normalizes it
  is not an acceptable restore proof.
- [ ] Every SQLite header/named database is recognized and passes read-only quick/foreign-key
  checks, with WAL/SHM retained and paired. SQLite may use sidecars on the writable **scratch** copy;
  it never opens the original volume or reference archive. Do not checkpoint/repair the originals.
- [ ] Reverify immutable archive/manifest hashes after the drill, compare registry/settings/record
  inventory privately, and sign off restore evidence. Zero databases/registrations is reported as
  zero, not populated recovery coverage. Any mismatch leaves writers stopped and release blocked.

## 4. Start the approved candidate without changing service policy

- [ ] Old writers are still stopped; backup and restore gates passed; approved release and rollback
  registry digests are available. Apply only the gateway alias and exact r2 image as one controlled
  deployment. Preserve explicit canonical host, secrets, volume ID/mount, region, replica count,
  existing health/retry/start/build settings, registrations, settings and executor assignments.
  Do not apply the reference Railway file as a configuration reset or leave a pending extra rollout.
- [ ] Start one replacement on the same original volume. Confirm no old instance is running and no
  overlapping deployment can start. The money lease is single-host coordination, not distributed
  fencing. Compare retained files/settings and executor assignments with the stopped baseline.
  Expected startup observation writes must be identified privately; do not demand that startup
  leave mutable journals byte-identical or silently accept unexplained mutations.
- [ ] Record returned deployment/image identities and effective gateway/child configuration.
  Do not reopen owner/intake activity until acceptance and the user's release decision.

## 5. Both-host acceptance — read-only except wallet sign-in

Fill a separate result for each hostname; both columns must pass. Use normal visible NEP-413
sign-in only, an existing authenticated browser or a dedicated visible browser session. No cookies,
keys or auth headers are exported. A sign-in message is distinct from an owner action/transaction.

| Check | `payables.multiagency.ai` | `payables-production.up.railway.app` |
|---|---|---|
| TLS/routing; frozen deployed frontend bytes | [ ] | [ ] |
| Challenge recipient equals this exact hostname | [ ] | [ ] |
| Fresh owner-controlled visible sign-in succeeds | [ ] | [ ] |
| `/gw/me` has the expected authenticated viewer | [ ] | [ ] |
| Existing private records and identity match private baseline, or authenticated empty result below | [ ] | [ ] |
| Signed-out/outside-owner private access refused | [ ] | [ ] |
| Reload retains the selected existing record, if any | [ ] | [ ] |
| Canonical supplier/bridge URLs, existing query fields and exact work-order ID/reload retained, if any | [ ] | [ ] |

- [ ] For each existing agent, privately check its retained agent/owner identity, expected record
  identities and executor/approve-only assignment. No invoice submission, owner approval, grant,
  agent reservation/creation, payment, schedule change or recovery/retry action is part of acceptance.
  Missing per-agent supplier links remain unavailable; do not restore a shared-host global fallback.
- [ ] If there are no agents after verified sign-in, record separately on each host:
  **Authenticated access verified; workspace empty; private agent-record access not established.**
  No agent is created. Inapplicable record/link tests remain explicitly unverified, not passed.
  Earlier registry absence or signed-out discovery is not this authenticated result.
- [ ] Record UTC time, deployment/image digest, owner-controlled sign-in outcome and private-access
  results privately. Public notes omit account identities, amounts, payees, operation IDs and hashes.
- [ ] User reviews acceptance and decides to reopen intake. Domain moves and Proto's shared release
  still require separate authorization. Stop at the agreed deadline if either hostname cannot pass.

## 6. Rollback on a failed gate or acceptance

- [ ] Stop new activity and the r2 gateway plus all child writers first. Verify zero running writers
  and no queued restart. Preserve the **current** volume and all post-start observations/records;
  capture another stopped-state snapshot before recovery if any records changed.
- [ ] Use the already approved recovery route: exact historical Railway rollback target, if retained
  and verified, or the published local fallback matching image ID
  `sha256:74d4ec2b6e653b9db3a549772f3690ddd7786c6e7f2436a54bd19fae526f4f29`.
  Restore the prior absent alias; preserve all other current baseline service settings/secrets,
  domains, same current volume and executor assignments. Historical Railway rollback also restores
  custom variables, so review that diff before confirmation. Never select r1 as rollback.
- [ ] Start only one old-code instance after r2 writers stopped. Check canonical-host sign-in,
  private access/empty authenticated result, original frontend bytes and retained identities.
  Generated-host sign-in may again fail with the known callback mismatch; record that limitation.
- [ ] Do not overwrite current journals/registry with the pre-window backup, drop unresolved records,
  resubmit attempted signatures, or retry invoices because routing failed. If old code cannot read
  current records, leave intake closed and prepare forward recovery. Restoring a production backup
  is a separate reconciliation decision, not this normal image/config rollback.

## Evidence and remaining gates

R2 validation remains unchanged: typecheck, 732 offline tests, 138 packaged runtime hashes and two
network-disabled synthetic-state starts. Separate rollback check passed 137 deployed-file hashes.
The maintenance helper's isolated synthetic drill passed real SQLite/WAL/SHM and nested-settings
preservation, numeric ownership/modes and hardlink/symlink comparisons, plus refusal of file
tampering and malformed SQLite. Logs: `.test-artifacts/maintenance-checklist-20261015/restore-test.log`
and `.test-artifacts/standalone-signin-rollback-20261015/review/image-check.log`.

No production stop, snapshot, export, restore, configuration edit, deployment, restart, publication,
wallet sign-in or private-access acceptance was performed in this preparation. Open gates include
authorization/window, executable published recovery route or verified provider retention, the
provider-supported stopped-volume access method, actual stopped-writer backup/restore proof and
both-host acceptance. Do not convert these checkboxes into completed evidence before execution.
