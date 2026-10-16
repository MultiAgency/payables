# Maintenance image publication — GHCR / MultiAgency

**Private destination selected; publishing access and publication approval remain pending.** The owner
selected GHCR under MultiAgency and private visibility. No image was pushed, rebuilt or deployed; no production writers,
configuration, domain or volume were changed. R2 remains frozen and undeployed.

## Exact proposed reference

```text
ghcr.io/multiagency/payables-maintenance:20261015-r1
```

Push only the reviewed local image ID
`sha256:f38941d9cf638f724a0d5c010c45fa62b7867a46107384374fab3248833ceec3`.
Its frozen export SHA-256 is
`8965b2895d1e5b3a7e44e62d6b0949c5c645970931cd070f8c7583b4a8d092c7`.
Tagging must not rebuild or add labels/layers. The final deployment reference will be
`ghcr.io/multiagency/payables-maintenance@sha256:<registry-manifest-digest>`; that digest does not
exist in this record before publication and must not be confused with the image configuration ID.

## Access discovery

- No existing registry destination is recorded in this repository or release package.
- Docker's credential-helper metadata lists no Docker Hub or GHCR accounts. A GHCR credential
  lookup likewise returned absent; no secret values were printed or saved.
- The existing GitHub session is authenticated as `jlwaugh` and can administer
  `MultiAgency/payables`. Its scopes do not include package access. Package discovery returned
  HTTP 403 requiring `read:packages`. Repository admin/push permission does not establish package
  creation or registry publishing permission.
- Read-only result: `.test-artifacts/registry-publication-review/access-result.json`.
  The scoped credential-check helper keeps credential/token responses in memory and reports only
  presence, status and granted actions when observable. No write operation is used as a probe.

Publishing access is therefore **not verified**. The selected namespace is a proposed destination,
not a discovered pre-existing package. MultiAgency package-creation policy and account package
permissions must permit it before proceeding.

## Authentication and visibility

For local GHCR publication, use normal Docker sign-in through its credential store with a GitHub
personal access token (classic) carrying `write:packages`, and organization SSO authorization if
required. Do not paste the token into chat, source files, command arguments or logs. The current
GitHub CLI OAuth session is not a substitute for this Docker registry credential. The owner can
complete an interactive local login and then report readiness:

```sh
docker login ghcr.io -u jlwaugh
```

The owner selected **private** visibility. Do not make the package public. Railway requires a
supported plan and approved registry pull credentials; GHCR read access normally uses a separate
classic token with `read:packages` and permission to read this package, plus organization SSO if
required. Enter pull credentials through Railway's registry-credentials UI after separate approval;
do not put them in application environment variables, command arguments or tracked files. No Railway
credential/configuration change is authorized by this preparation. Until these credentials and
provider plan support are established, private Railway pull access remains blocked.
[GHCR authentication and scopes](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry),
[visibility controls](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility),
[Railway registry requirements](https://docs.railway.com/guides/private-container-registry).

## After explicit publication authorization and successful access verification

1. Recheck the local image ID and frozen export checksum. Confirm the target tag is unused or
   explicitly approved for this exact candidate; do not overwrite an unrelated image.
2. Tag and push the existing image only:

```sh
docker tag sha256:f38941d9cf638f724a0d5c010c45fa62b7867a46107384374fab3248833ceec3 \
  ghcr.io/multiagency/payables-maintenance:20261015-r1
docker push ghcr.io/multiagency/payables-maintenance:20261015-r1
```

3. Record the registry manifest digest and immutable reference. Fetch the manifest/configuration,
   verify the config hash equals the reviewed image ID, and compare ordered layer descriptors to
   the exported image. A successful push or matching tag alone is insufficient. Do not rebuild,
   change architecture or add a repository-link label to force permissions.
4. Confirm the package remains private. Verify read-only manifest/config/blob retrieval using the
   separately approved pull credential. Check access from the existing
   Railway host using a bounded read-only registry client that starts no application/executor and
   writes no volume files. Record the immutable manifest/config/layer results, omitting all tokens.
5. Distinguish verified registry retrieval from the actual platform deployment pull: a real Railway
   deployment pull cannot be claimed from a local pull. No deployment or build is authorized in this
   task. If host-side retrieval cannot establish the required platform access, leave that gate open
   rather than deploy to test it.
6. Update the access runbook with the immutable reference and authentication/visibility evidence.
   Mark the publication prerequisite satisfied only when the recorded checks support that claim.
   Stopping writers, maintenance deployment, sign-in-fix deployment and volume actions remain outside
   this task even after publication.

Current blockers: local GHCR publishing authentication/package rights, explicit private publication
approval, registry manifest digest, compatible Railway plan and approved pull authentication,
and post-publication Railway access evidence. Private visibility is already selected.
