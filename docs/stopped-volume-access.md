# Railway stopped-writer volume access — review result

**Preparation only; r2 remains frozen. No production process, deployment, variable, domain or
volume attachment was changed.** No production backup or restore was attempted.

Registry destination selection now proposes
`ghcr.io/multiagency/payables-maintenance:20261015-r1` under the owner's selected MultiAgency
namespace, with private visibility. [Publication/authentication plan](maintenance-registry-publication.md):
publishing access/approval, Railway pull authentication and the immutable registry reference remain pending.
No push has occurred.

There is no verified direct accessor for a stopped/detached volume in the installed Railway CLI.
A supported alternative is a temporary **maintenance-only deployment on the original service and
volume**, after all application writers stop. Its container stays running for SSH/SFTP, but contains
no Payables application, SDK, gateway or executor. This is an additional production deployment that
needs explicit authorization; it was **not** performed here. The tools and preservation checks below
passed locally. The actual Railway handoff remains unverified and is a release gate.

If “no deployment of any kind while the volume is stopped” is required, the answer is **blocked**:
no documented, verified route meeting that stronger restriction was found. Do not resume the
ordinary application to make file commands work.

## Provider evidence

Installed CLI reports `railway 5.41.3`. The matching provider source tag resolves to
`e8e02a71bfc2afd85aa967e0b007107c016e2a54`. Source was fetched read-only into
`.test-artifacts/provider-access-review/railway-cli`; no provider account mutations were made.

| Candidate method | Finding |
|---|---|
| `railway volume files` / browser | Version-matched source requires an attached service with an active deployment. It is not detached/stopped-volume access. |
| Recursive file download | Recreates directories/files and copies bytes, without restoring UID/GID, mode, ACL, xattrs or hardlink identity. Symlink entries go through the file-copy path, rather than link recreation. Unsuitable as a whole-tree backup. |
| SSH / SFTP / SCP | Documented access to a running container and its mounted volume; usable with the maintenance-only container, not proof of offline volume access. |
| Native volume snapshot | Documented full-volume backup, including SQLite. Not documented as a portable metadata-preserving export or an isolated restore without service redeployment. |
| Maintenance-only image + SSH + tar | Composition of documented image deployment, runtime volume mounting and SSH. Source metadata stays inside a PAX archive; only archive bytes are transferred. No application executor starts. Locally tested; production mount/SSH handoff still pending. |

Pinned source: [volume target selection](https://github.com/railwayapp/cli/blob/e8e02a71bfc2afd85aa967e0b007107c016e2a54/src/commands/volume.rs#L298),
[active deployment check](https://github.com/railwayapp/cli/blob/e8e02a71bfc2afd85aa967e0b007107c016e2a54/src/controllers/project.rs#L296),
[SFTP byte-copy implementation](https://github.com/railwayapp/cli/blob/e8e02a71bfc2afd85aa967e0b007107c016e2a54/src/commands/volume/sftp.rs#L534).
These are source findings, not observations of the provider's private runtime implementation.

Provider documentation supports container deployment and volume mounting at runtime, plus SSH
file access. It also says a volume-backed service does not run overlapping mounted deployments.
Still explicitly verify old writers stopped; do not use that statement as distributed fencing.
[Services](https://docs.railway.com/services), [using volumes](https://docs.railway.com/volumes),
[volume constraints](https://docs.railway.com/volumes/reference), [SSH](https://docs.railway.com/cli/ssh).
Native restore stages another volume, retains the previous volume unmounted and redeploys the
service; it is not the isolated rehearsal below. [Backups](https://docs.railway.com/volumes/backups).

## Reviewed maintenance container

Sources: `deploy/volume-maintenance/`. Image: `payables-volume-maintenance:20261015-r1`.
Local image ID:
`sha256:f38941d9cf638f724a0d5c010c45fa62b7867a46107384374fab3248833ceec3`.
The separate maintenance artifact record pins the export and source hashes.

The image uses pinned Node 24 base bytes plus GNU tar, ACL/xattr tools and offline verification
helpers. Its normal command is `sleep infinity`, as root; the Node base entrypoint executes sleep.
The test observed PID 1 as sleep, with no `/app/src` or application dependencies, even with synthetic
`EXECUTOR=on` and `AUTOPILOT=on`. It starts no HTTP gateway, writes no bootstrap settings, reads no
service credentials and makes no provider/chain calls. Scripts are invoked explicitly over SSH.

Retain the existing service variables, source mode, region, one replica, start/build overrides,
restart policy, domain attachments and **same volume**. The captured start override and healthcheck
metadata were null. Before use, confirm there is no effective start override invoking app code,
no predeploy command touching state and no healthcheck requiring an HTTP listener. If any differ,
STOP: the sleep-only image cannot preserve those settings and satisfy that deployment contract.
Do not “fix” this by changing health/start configuration without separate review.

The provider mounts the volume read-write; no read-only mount capability is claimed. Backup tools
only read its files and metadata and never open its SQLite databases. Access times may change from
reads; ownership, modes, links, xattrs, ACLs and retained bytes are compared before/after the copy.
Original SQLite WAL/SHM are archived unchanged. SQLite checks run only on the isolated writable copy.
Native snapshots can be taken while the maintenance container runs, with no application writers.

## Local preservation proof

A default-start maintenance container and a **separate** restore container ran with `--network none`
and no production mount. A synthetic fixture included numeric UID 12345/GID 23456, mode 0640,
hardlink and symlink, named-user POSIX ACL, binary `user.*` extended attribute, a retained initialization
marker and real SQLite DB/WAL/SHM. Full-tree hash/owner/mode/link comparison, canonical ACL/xattr
comparison, SQLite read-only checks and archive checksums passed. ACL/xattr blocks are sorted so
directory enumeration order does not determine equality. Logs:

- `.test-artifacts/provider-access-review/backup-proof-final.log`
- `.test-artifacts/provider-access-review/restore-proof-final.log`
- `.test-artifacts/provider-access-review/make-fixture.mjs`

The earlier maintenance-helper drill separately refused tampered files and malformed SQLite.
No provider fixture or stopped production mount was exercised. `user.*` xattrs and POSIX ACLs were
tested; other namespaces, filesystem features, sparse allocation and timestamps are not universally
proven. Actual data must pass the same checks on a compatible Linux filesystem. Unsupported file
types, external symlink targets, nested mounts, insufficient `/tmp` space or unrestorable metadata
are blockers; never exclude them silently or loosen container privileges to force a pass.

## Future authorized sequence and exact commands

Use the existing [window checklist](standalone-signin-maintenance-checklist.md) for baseline,
writer-stop, r2 acceptance and rollback gates. This section replaces its unresolved raw stopped-volume
mount prerequisite with the **separately authorized maintenance deployment**. Commands below are
prepared only; none was run against Railway production.

1. Obtain approval for maintenance deployment/publication as well as the r2 release. Freeze the
   current service configuration and original deployment/volume identities. Verify both executable
   rollback routes before stopping writers. Publish and pin the maintenance image's immutable registry
   reference, checking its image configuration/layers against the local export; record it privately.
2. Stop the old gateway and every writer as in the window checklist. Verify zero old instances and
   no queued restart. Do not freeze policy, alter grants/schedules or move the volume to another service.
3. Deploy the approved maintenance image on the same standalone service/volume using the existing
   local-upload source mode and an image-only context. No `railway.json`, app files, secrets or service
   setting overrides belong in that context. Record the returned deployment and **instance** ID.
   Verify unchanged effective service configuration and volume ID, PID 1 sleep, no app code/processes
   and no other writer. Any config drift or unsuccessful maintenance deployment blocks backup/release.

The upload context's sole Dockerfile is `FROM <approved-maintenance-registry>@sha256:<digest>`;
the immutable reference is not available until authorized publication. It is deliberately not guessed.
After privately validating that reference and freezing the one-line context:

```sh
railway deployment up "$PAYABLES_MAINT_UPLOAD" --path-as-root \
  --project 0c5d641c-592a-47f4-8606-48d07a91d276 \
  --service 9a46b1a2-c1d7-4ff2-aede-f82846743243 --environment production \
  --message 'Approved stopped-writer maintenance; no gateway or executor'
```

Do not run a source build of the apt-installing Dockerfile and call it the frozen image; such a build
is a new candidate. After the provider build, verify returned image config/layers before backup.
`PAYABLES_MAINT_INSTANCE` is the verified maintenance replica ID, not the old replica or deployment ID.
`PAYABLES_WINDOW_ID` must contain only lowercase letters, digits and hyphens. Use a new ID on a failed
backup; no backup is overwritten. `/tmp` must have enough capacity for the entire uncompressed volume.

```sh
railway ssh --project 0c5d641c-592a-47f4-8606-48d07a91d276 \
  --service 9a46b1a2-c1d7-4ff2-aede-f82846743243 --environment production \
  --deployment-instance "$PAYABLES_MAINT_INSTANCE" -- \
  /maintenance/backup.sh "$PAYABLES_WINDOW_ID"
```

4. The backup script writes only ephemeral `/tmp/payables-volume-backup/<window>/`. It creates a
   complete numeric-owner PAX archive with ACL/xattrs, plus authoritative stopped-tree/ACL/xattr
   manifests and checksums. It rechecks source content and metadata before reporting success.
   A failed/partial run is not a backup. Native provider snapshot creation is a separate approved
   action; record its ID but do not invoke native restore for this rehearsal.
5. Download **individual archive/manifest files**, not the state directory. Before each transfer,
   confirm the only active standalone instance is still the recorded maintenance instance. The
   service-file command has no replica selector. Keep the download directory private and new:

```sh
set -eu
umask 077
mkdir -m 700 "$PAYABLES_BACKUP_DIR"
for PAYABLES_FILE in whole-volume.tar stopped-tree.json acl.txt xattrs.txt SHA256SUMS; do
  railway service files --project 0c5d641c-592a-47f4-8606-48d07a91d276 \
    --service 9a46b1a2-c1d7-4ff2-aede-f82846743243 --environment production \
    download "/tmp/payables-volume-backup/$PAYABLES_WINDOW_ID/$PAYABLES_FILE" \
    "$PAYABLES_BACKUP_DIR/$PAYABLES_FILE" --json
done
(cd "$PAYABLES_BACKUP_DIR" && shasum -a 256 -c SHA256SUMS)
```

The downloaded files' outer local modes/owners may differ; source metadata is inside the verified
archive/manifests. Transferring these bytes does not rely on SFTP tree-metadata preservation.
Do not stop/redeploy the maintenance container until copies and restore evidence are secured;
its `/tmp` artifacts are ephemeral. Never print backup contents, cookies, keys or `.env` values.

6. Isolated restore: use the exact exported maintenance image, only the downloaded reference bundle
   mounted read-only, and disposable Linux container storage. No original volume, no application
   image, no provider environment variables, no network. Keep the log private:

```sh
docker run --rm --platform linux/amd64 --network none \
  --mount type=bind,src="$PAYABLES_BACKUP_DIR",dst=/backup,readonly \
  --entrypoint sh \
  sha256:f38941d9cf638f724a0d5c010c45fa62b7867a46107384374fab3248833ceec3 \
  -c 'mkdir -m 700 /restore && exec /maintenance/restore-check.sh' \
  > "$PAYABLES_RESTORE_LOG" 2>&1
```

The scratch image must have enough ephemeral disk. This extracts into fresh `/restore`, compares
every retained path/hash, UID/GID, mode and link group/target, then compares ACL/xattrs. Only after
that does it open the **scratch** SQLite files read-only for quick/foreign-key checks and sidecar
pairing. It rechecks the reference checksums afterward. Empty DB/registry coverage is reported as
empty. All checks must pass; encrypted/private backup copies and restore logs survive the container.

7. If successful, stop maintenance, verify it exited, then proceed with the frozen r2 image and the
   single gateway alias addition under the existing window checklist. Verify both-host sign-in and
   existing private access, or report authenticated empty separately. Do not create an agent.

## Recovery from maintenance failure

Do not restart application code just to finish a backup. If archive transfer or restore fails, retain
maintenance mode and investigate, or perform the previously authorized **image recovery** below.
No alias was added during maintenance, so original variables remain unchanged at this stage.

Reconfirm the latest deployment is maintenance, then stop it and confirm zero instances:

```sh
railway down --project 0c5d641c-592a-47f4-8606-48d07a91d276 \
  --service 9a46b1a2-c1d7-4ff2-aede-f82846743243 --environment production
```

Preferred recovery is Railway's dashboard rollback to original deployment
`083e4cd0-c940-4480-a3c7-cf3756319edf`, digest
`sha256:83c83624bbba29aeb6a0eb62e34a8e08f85de56424b6a9fe07773fbfc0f5b9c0`,
if retention and exact image/variable restoration were verified before the window. Installed CLI
`redeploy` targets latest and is not an arbitrary historical rollback command.

Otherwise, the already approved, published [local rollback fallback](standalone-signin-rollback-artifacts.json)
must match image ID
`sha256:74d4ec2b6e653b9db3a549772f3690ddd7786c6e7f2436a54bd19fae526f4f29`.
`PAYABLES_ROLLBACK_UPLOAD` is a separately frozen image-only context referencing that published
immutable digest, with no settings overrides:

```sh
railway deployment up "$PAYABLES_ROLLBACK_UPLOAD" --path-as-root \
  --project 0c5d641c-592a-47f4-8606-48d07a91d276 \
  --service 9a46b1a2-c1d7-4ff2-aede-f82846743243 --environment production \
  --message 'Approved recovery from maintenance; retained original application bytes'
```

This **recovery** starts the original gateway and its existing executor assignments only after
maintenance stopped and explicit recovery approval; the backup/restore drill itself starts none.
Keep the same current volume and settings. Verify canonical sign-in/retained identities; expect
the known generated-host sign-in limitation to return. Never select superseded r1.

This is not volume data rollback. Never extract an old archive over the current production state.
Native snapshot restore changes the attached volume and redeploys; if data recovery is independently
authorized, first make the maintenance-only image current and keep all application writers stopped,
then review the provider's staged replacement/retained-original volume identities before applying
restore. Do not perform this as an isolated test or normal release rollback. Reconcile post-snapshot
records before any application startup. No undocumented `railway volume restore` command is supplied.

## Release blockers and limits

The raw stopped-volume CLI route is conclusively unsuitable per version-matched source. The
maintenance route uses documented provider primitives and locally verified preservation tools,
but has **not** been exercised on this Railway service or a disposable provider fixture. Approval,
immutable registry references, unchanged effective start/health configuration, actual no-overlap
handoff, metadata/space compatibility and real stopped-volume archive/restore checks remain gates.
If the provider cannot perform the image-only handoff without changing the retained service/volume
contract, or if those checks fail, the release stays **blocked**. Do not describe the gap as closed
on local proof alone. Provider support confirmation/test credentials were neither requested nor sent.
