# Payables → Proto shared-infrastructure release handoff

The separate [standalone sign-in release package r2](standalone-signin-release-r2.md) now freezes the
bounded backend fix against an explicit baseline, excluding unrelated working-tree backend edits.
Its [artifact record](standalone-signin-artifacts-r2.json) pins the source archive and exported image.
The [read-only production comparison](standalone-signin-production-comparison.md) established
that r2 retains every captured deployed runtime byte outside the three signing-fix paths.
That isolated candidate passed 732 offline tests; the 741-test result below describes this handoff's
earlier working-tree validation. Neither result establishes live acceptance or authorizes release.

2026-10-15 UTC. **Undeployed; domain moves remain blocked.** This repository prepares an
offline-tested fallback authentication remedy. It does not establish successful live fallback
authentication or private-record access. No deployment, restart, domain/DNS change, invoice
submission, owner action, grant or payment was performed.

## Fallback evidence and remedy

Retained standalone: `https://payables-production.up.railway.app`.
Canonical/shared target: `https://payables.multiagency.ai`.

- The existing visible `fallback-review-r2` Payables tab was inspected with agent-browser.
  Its public page offered wallet connection. A public `/gw/challenge` read returned 200 with
  recipient `payables.multiagency.ai`; the nonce was not retained in this handoff.
- The owner attempted normal visible wallet sign-in and reported **“The signed callback URL
  is not this site”**. This is owner-reported live evidence, independently reproduced offline.
- Before that attempt, a bounded `/gw/me` read returned 200, authenticated false and zero
  visible agents. That signed-out result does **not** establish that no private agent exists.
  Authenticated access and retained private records are both still unverified.
- The frontend offers its current page URL as a possible signed callback. The verifier refuses
  those candidates against a different configured recipient even for a wallet signing no callback.
  `test/proto-release.test.ts` reproduces this failure with synthetic keys and no network.

The remedy is opt-in `DASHBOARD_SIGNIN_HOSTS`, a comma-separated list of additional exact signing
hosts. With `DASHBOARD_SIGNIN_HOSTS=payables-production.up.railway.app` and canonical `HOST`
still `payables.multiagency.ai`, challenge and session verification select the incoming HTTP Host
only when it is one of those explicitly configured names. Unknown hosts refuse authentication;
forwarded-host headers are not used. Malformed aliases fail startup. Without aliases the existing
configured-host behavior remains unchanged. Cookies remain Secure, HttpOnly, SameSite=Strict and
host-only. Signatures for the custom host cannot authenticate on the fallback host.

The canonical `HOST`, supplier/bridge URLs, `.payables` registrations and executor assignments
are unchanged. This preserves custom-domain sign-in while enabling the explicit fallback after
release. Changing `DASHBOARD_HOST` alone would replace the signing host and is unsuitable here.
The alias is gateway-only and is excluded from child-agent environments.

`test/proto-signin-http.test.ts` starts the real gateway with an empty synthetic fleet and a
loopback chain-key fixture. It signs and verifies on both hosts, rejects an unknown host and a
cross-host signature, checks host-only cookies and the unchanged canonical supplier URL. It
reserves no workspace and creates no provider agent. Synthetic key ownership is not live evidence.

## Frozen Proto r2 compatibility

Reviewed `/tmp/proto-infrastructure-review-20261015-r2/review/REVIEW.md` and
`review/fallback-handoff.md`. R2 image ID:
`sha256:15a3552618b353a1745f403802c51d76e188107e34f3d17627a8178521f2b055`.
Its Payables asset path is `/app/frontends/payables`. The frozen r2 artifact remains unchanged.

The existing adapter accepts the explicit static payout mapping
`https://invoices.multiagency.ai/submit`. Managed mappings retain
`https://invoices.multiagency.ai/i/<instance>/`. On shared hosts, selected-agent `invoices` is
authoritative: missing/null mappings remain unavailable even if global `invoices` exists.
No global shared-host fallback was restored. Legacy standalone behavior remains covered.

Work-order presentation uses the selected intake and `URL.searchParams.set("workOrder", order.id)`.
The focused contract test covers static and managed paths, retained ordinary and repeated query
parameters, and exact decoding of an ID containing reserved characters. This is URL construction
coverage; it does not substitute for a hosted reload. Proto's frozen r2 review reports its separate
offline static/managed exact-record reload and proxy checks passed. No Proto files or runner were
changed or rerun here. Supplier enforcement remains Proto's contract responsibility.

## Files changed in this task

- `src/gateway/signing-host.ts`: explicit signing-host selection and alias validation.
- `src/gateway/server.ts`: use selected host for challenge and verification only.
- `src/gateway/config.ts`: exclude gateway signing aliases from child environments.
- `.env.example`: commented alias configuration example.
- `test/proto-release.test.ts`: callback reproduction and r2 supplier contract checks.
- `test/proto-signin-http.test.ts`: real gateway offline authentication regression.
- `docs/enforcement.md`: record the gap and undeployed remedy.
- `docs/releases/proto-release-handoff.md`: this handoff.

Existing dirty and untracked integration/contributor work was present before this task. The owner
confirmed nobody else was editing this repository. Existing changes were preserved, including
gateway contributor routing, frontend adapter, work-order links and their tests. The list above
describes this task's changes rather than claiming ownership of the entire working tree.

## Validation

- Final `pnpm typecheck`: passed.
- Initial full offline validation: 740 passed, zero failed, before the host remedy.
- Focused authentication and contract checks passed after adding the remedy.
- `node test/browser/run.cjs shared-gateway.cjs work-orders.cjs`: passed outside the sandbox;
  manifest/results `.test-artifacts/browser/run-uf4vK8/`. Existing built frontend assets were used;
  this task changes no frontend assets. The sandbox attempt failed at Chromium launch, with
  artifacts `.test-artifacts/browser/run-wFdgDJ/`; it is not reported as passing.
- Final `pnpm test`: 741 offline tests passed, zero failed, including the real-gateway remedy.
  The initial sandbox full-suite attempt hit loopback `listen EPERM` and was interrupted;
  both completed full-suite runs used approved execution outside the sandbox.
- All tests were offline; no live-funds tests were run. No credentials or cookies were exported.

## Required owner-controlled release actions

1. Review and freeze the standalone gateway remedy with its existing concurrent changes. Preserve
   the current canonical host and any current `DASHBOARD_HOST`; verify their effective value is
   `payables.multiagency.ai`. Add only the explicit generated hostname through
   `DASHBOARD_SIGNIN_HOSTS`. Do not apply this variable to sibling services or the frozen Proto image.
2. Before the standalone deployment/restart, privately capture its deployment digest, volume,
   settings, `.payables` inventory and executor identities. Review active writers, schedules,
   unresolved operations and attempted owner signatures. Agree on a maintenance window.
   Preserve the complete volume, nested settings, SQLite/WAL/SHM and all retained directories,
   including `.ops/`, `.invoices/`, `.owner-intents/`, `.strategy/`, `.plans/`, `.evidence/`, `.inbox/`,
   `.agreements/`, `.notify/`, `.work-orders/` and `.payables/`. No migration is required by this remedy.
3. The user deploys the reviewed standalone candidate with one replica and no executor overlap,
   retaining the original volume and executor assignments. Keep current domain attachments intact.
4. Perform normal visible wallet sign-in separately on generated and custom domains. Verify each
   challenge recipient matches that page. Confirm `/gw/me` has an authenticated viewer. If an
   existing agent is visible, open its existing private records read-only and privately compare
   retained identity/executor assignment to the baseline. If none exists, report authenticated
   access separately and leave private-record verification unestablished; create nothing.
5. Only after those checks may a separate shared-release decision consider domain moves. Follow
   Proto r2's maintenance/backup and executor plan, retaining static payout approve-only on dao
   and the existing payout executor on invoices. Keep standalone `.payables` on its original
   service/volume; importing it into Proto `.hosted` is outside this release.
6. After the authorized shared release, recheck host-bound owner access, private denials, selected
   static and managed supplier URLs, missing mappings and exact work-order reload read-only.
   Record deployment IDs and retained record comparisons privately. No test invoice or owner
   action is needed for acceptance.

## Rollback and blockers

For the standalone remedy, stop its replacement writer before restoring the privately pinned
previous image/configuration. Preserve the current volume and every post-release record. Restore
the previous alias setting; keep canonical host/domain attachments unchanged. The old image again
has the known generated-host sign-in limitation. Do not restore stale journals, remove unresolved
records, repeat attempted signatures or retry invoices because routing failed.

For a later shared rollout, stop the replacement dao writer before restoring Proto's pinned
previous image/configuration and original domain attachments. Keep each volume with its original
service and invoices' executor in place. Preserve newly accepted registrations and records; if an
older image cannot read them, disable new intake and prepare forward recovery. Expect fresh
host-bound sign-in after routing changes.

Open gates: deploy/restart approval for the standalone remedy; live owner-controlled fallback
and custom-domain sign-in; authenticated existing-record verification (or a verified empty
authenticated workspace); fresh maintenance-window state/backup/executor baseline; and the
separate shared-release decision. This handoff grants none of those approvals.

Guidance used: repository `AGENTS.md`, `CONTEXT.md`, `web/AGENTS.md`, and
`docs/shared-frontend-integration.md`; [agent-browser skill](/Users/jlwaugh/.codex/skills/agent-browser/SKILL.md),
its installed CLI core guide, and
[signed-in-browser-checks skill](/Users/jlwaugh/.codex/skills/signed-in-browser-checks/SKILL.md).
