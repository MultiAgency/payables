# Report-to-payout release handoff

This is a locally prepared candidate, not a deployment record. Deployment, writer shutdown/startup,
owner signatures, funding and mainnet payments remain owner actions. Use the exact captured candidate;
the Git base alone does not identify this working tree's uncommitted changes.

## Scope

- Contributors submit amount-free reports or invoices for already agreed amounts.
- Owners record compensation and explanations under the signed period ceiling. Approval reserves
  the approved amount once and sends no payment.
- Pay connects a newly approved submission to one isolated work-order identity. Agent authorization,
  grant, exact observed funding, invoice submission and held payout approval remain explicit.
- Partial preparation, lost responses, expiry and failed/unknown outcomes follow the same identity.
- Existing invoices, historical amounts and already bound shared payouts retain their recovery path.
- Header refresh retains keyboard focus while busy and ignores repeat requests until its read completes.
- Light-theme focus rings use the input contrast token; the form contrast regression checks both themes.
- Supplier conversion/forwarding, automatic residual-fund return and personal-agent OAuth/MCP are
  outside this candidate. Local tests do not establish hosted behavior or provider guarantees.

## Verification and candidate identity

Run `pnpm verify:candidate` before release. It copies the complete Git-visible working tree,
including untracked source/tests, without changing the index or creating a commit. It records file
hashes/modes, Git base, lockfile and Node identity under `.test-artifacts/candidates/`, then runs
`pnpm verify` against that snapshot with offline network guards. Dependencies are the existing local
installation, shared read-only; this is not a clean Linux container or reproducible dependency proof.

Keep the candidate's `manifest.json`, `result.json`, `verify.log` and source snapshot in the private
release record. The result must report successful checks, an unchanged snapshot and a matching working
tree. A failure is a blocker, not a passed release. Recheck source changes made after capture. No
production state, cookies, grant secrets or partner keys belong in the source archive or tracked docs.

## Before deployment

The contributor app now has a dedicated extraction path: see
[Standalone contributor app](invoices-extraction.md). `Dockerfile.invoices` is for the new app and a
separate volume; it must not replace the legacy payout executor's entrypoint. This changes the source
identity and requires a newly verified candidate before release.

The local candidate can be verified while these production gates remain outstanding:

1. Confirm the effective service build, start command, domain, volume mount, state working directory
   and executor mapping privately. The current root Dockerfile and Dockerfile.dashboard both start
   the gateway; `deploy/invoices.json` declares a self-service portal with no configured agents.
   Those files alone do not identify the running legacy payout executor. Do not deploy defaults over
   it or infer that its state lives at a particular path. Preserve the actual configured mapping.
2. Complete the existing [stopped-volume access gates](stopped-volume-access.md#release-blockers-and-limits).
   The maintenance/archive approach is tested locally; the provider handoff and production restore
   checks remain unverified. A live recursive file download is not a stopped-writer backup.
3. Confirm the required custom/generated-host sign-in configuration and its hosted acceptance,
   following [enforcement](enforcement.md). The documented alias remedy is not established as deployed.
4. Agree a maintenance window: no unattended observation/freeze conflict, new submissions, approvals,
   schedules or CLI writers. One executor per agent remains mandatory; the lease is single-host.
   Review retained owner intents before startup: a signature from a passed DAO vote can progress
   automatically. Schedule-off alone does not make startup status-only.

These are owner release gates. Preparing this handoff does not satisfy them or authorize deployment.

## Preserve state and upgrade together

Follow [Operations](operations.md#owner-run-rollout) and the stopped-volume procedure. Stop the payout
parent and every private work-order child, gateway-managed writers and relevant CLI processes before
backup. Preserve each service's actual complete state tree and settings, including:

`.ops/`, `.invoices/` with SQLite journals/databases/initialized markers, `.owner-intents/`,
`.strategy/`, `.plans/`, `.evidence/`, `.inbox/`, `.agreements/`, `.notify/`, `.work-orders/`,
`.payables/` and any legacy `.intake/` files.

Work-order JSON, companion env files and initialization markers must stay with their owner intents
and child-agent records. Missing initialized state refuses recovery; never recreate empty allowances
or remove evidence to unblock a payout. Preserve archive metadata, checksums and SQLite consistency
according to the linked maintenance procedure.

The compensation store is additive: `.invoices/<agent-id>.compensation.sqlite` and its initialized
marker. Optional report amounts, approved compensation and isolated-payout markers need no conversion
of existing records. Legacy approved invoices without the new fields retain their original billed
amount. New marked approvals refuse if their approved-compensation evidence is missing.

Ship the server, gateway permissions and frontend together from the same candidate. The web build
must contain `contributor.html`, its static assets and `skill.md`. Reload old browser tabs before
reopening submissions. Do not run old readers/writers after new-format reports or approvals are
written: they do not understand amount-free reports or separate approved compensation.

Preserve the existing invoice bridge URL/secret and parent-agent binding privately. Keep one replica
per executor service. Work-order capacity defaults to eight private subprocesses per parent and is
configured by `MAX_WORK_ORDER_EXECUTORS` (1–64). Open processes remain active until parent shutdown;
capacity refusal must not substitute a shared payout. Review expected usage before rollout.

## Hosted acceptance, in increasing order of authority

| Stage | Check | Boundary |
|---|---|---|
| Read-only | Compare health and the existing smoke snapshots before/after rollout. Verify contributor bundle, schema version 2 and skill content. | Health and public metadata do not prove private workflows or payment settlement. |
| Authenticated reads | Intended owner and contributor can sign in on approved hosts. Unrelated accounts cannot read the records. Existing invoices, held payouts and unresolved operations retain their identities. | Opening private records may refresh observations; it must not create new payment authority. |
| Review records | With owner-authorized test records, record signed terms, submit a report, request changes, resubmit and set compensation. Above-ceiling approval refuses. Approval reserves once and sends nothing. | These are durable application writes, not a read-only smoke check. |
| Payout preparation | Use Pay, interrupt/cancel where appropriate, then reopen the same isolated identity. Verify the separate payment deadline. | Agent creation and grant signatures require explicit owner action; do not sign merely to inspect the UI. |
| Mainnet demonstration | Only after separate authorization, authorize the agent/grant, fund the exact amount, submit once, approve its held payout and follow settlement evidence. | Funding and signatures are real operations. A vote, HTTP success or reported balance is not settlement proof. |

Use the detailed [acceptance walkthrough](payment-requests.md#release-acceptance-walkthrough).
Do not deliberately induce a production timeout, tamper with live terms or send funds to test a refusal;
those fault cases have offline coverage. An unexpected outcome stays on its retained identity.

Exact balance matching is a local pre-submission observation, not prevention of later deposits or a
provider lifetime cap. Expiry does not cancel accepted payments or return funds. Excess/residual funds
stay visible for separately authorized recovery; do not loosen supplier authority or create a replacement.

## If verification fails

Keep activity paused and preserve the latest state and logs. Prefer a reviewed forward correction.
Do not restore a pre-startup backup over later owner intents or operations, downgrade writers onto
new-format compensation records, or retry an attempted signature as a new action. An isolated restore
verification is separate from replacing a production volume. Reconcile retained operations first.

Record hosted verification and mainnet observations separately, with UTC time, source/deployment
identity and applicable proposal numbers. Keep amounts, recipients, operation IDs and transaction
hashes private. Update canonical evidence only for what was actually observed.
