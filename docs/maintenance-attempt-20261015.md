# Payables maintenance attempt — halted at prerequisite

October 15, 2026 America/New_York; final read-only endpoint observations at
2026-10-16 01:44:09.983835 UTC. **No production mutation or outage was initiated.**

The owner authorized the maintenance-only handoff, stopped-writer backup and isolated restore,
with an instruction to stop on any failed prerequisite. The first deployment prerequisite failed:
the reviewed maintenance image has no published immutable registry reference. Docker inspection
confirmed local image ID
`sha256:f38941d9cf638f724a0d5c010c45fa62b7867a46107384374fab3248833ceec3`
and `RepoDigests: []`. The release package also contains no approved published reference for its
image-only upload context. A registry destination/account has not been established in this session.

The reviewed procedure requires that immutable reference before stopping writers. Uploading the
apt-installing source Dockerfile would produce another candidate, rather than deploy only the
reviewed image, so it was not substituted. No registry publication was attempted.

## Reconfirmed baseline and availability

- Railway reports the original active deployment
  `083e4cd0-c940-4480-a3c7-cf3756319edf`, status SUCCESS, image digest
  `sha256:83c83624bbba29aeb6a0eb62e34a8e08f85de56424b6a9fe07773fbfc0f5b9c0`.
  There is one running instance, `canRedeploy: true`, and the original volume still mounted at `/data`.
  This reconfirms the current recovery identity, not future historical-image retention.
- Both `payables.multiagency.ai` and `payables-production.up.railway.app` returned HTTP 200 for
  `/` and `/health`; health returned `ok: true`.
- Both served the existing index bytes with SHA-256
  `62490ed33364d7c215717fbc44bfe738cc7ed90c6a6fdb8353e2a27ae59a518a`.
- Both public challenges returned HTTP 200 and recipient `payables.multiagency.ai`.
  The known generated-host sign-in limitation remains. No authenticated/private-access claim is made.

Writers were not stopped, the maintenance image was not deployed, and no production backup or
isolated production-data restore was attempted. No recovery was needed because the original service
was left running. No service configuration, domain, volume attachment, registration or setting was
changed; no owner/money action or sign-in-fix deployment occurred. R2 remains frozen and undeployed.

Evidence is private under `.test-artifacts/provider-access-review/`: `window-deployments.json`,
`window-status.json`, `window-availability.json` and `window-result.json`. Previous synthetic
preservation tests remain local evidence only and do not count as production backup/restore proof.

## Requirement to resume

Establish a registry destination/account accessible to Railway, publish the exact reviewed image,
and verify/pin its returned immutable registry reference against the local image configuration and
layers. No keys or credentials should be pasted into chat. Then repeat all live baseline, rollback
availability and writer-stop gates in [the reviewed runbook](stopped-volume-access.md) before
continuing the already authorized maintenance scope. Until that prerequisite passes, leave the
original service running and the release blocked.
