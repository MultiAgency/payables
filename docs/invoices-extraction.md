# Standalone contributor app

The extraction gives the contributor app its own build and startup path in this repository.
It is locally prepared, not deployed. It does not yet create a separate repository or decouple
the shared backend into a remote payment API.

## Service boundary

| Service | Responsibility | State |
|---|---|---|
| Standalone Invoices | Contributor entry, scoped reports/invoices, owner review and its own self-service Payables workspaces | Separate volume; `/data/state/.payables/` and every nested instance directory |
| Existing legacy invoices executor | Existing payout agent, retained invoices, operations and held payouts | Existing volume and `/data` working directory, unchanged |
| Existing DAO gateway | Treasury executor and approve-only access to the legacy payout agent | Existing volume and `/data/state`, unchanged |

Use `Dockerfile.invoices` for the standalone app. It selects `/app/deploy/invoices.json` and
`deploy/invoices-entrypoint.sh`, serves `/health`, and requires one replica with a separate persistent
volume mounted at `/data`. Use the existing self-service infrastructure settings described in
[Payables self-service](payables-self-service.md), with a fresh session secret. Do not copy a legacy
agent's settings, grants, signing keys, restore variables or state into this service.

The entrypoint refuses known legacy agent-state paths at the volume root and `/data/state` before
starting the gateway. Registered owner instances beneath `.payables/` reopen normally. This catches
known layout collisions; it is not a complete volume provenance check or a backup procedure.

The gateway can start executors for its own newly authorized owner instances. This is a separate
product entrypoint, not a static frontend or a remote client of the legacy executor. It preserves the
existing single-host money path. One configured replica alone does not prove global executor uniqueness.

## Contributor flow

The root opens the contributor entry; `/owners` opens owner setup and review. An owner shares a
scoped `/requests/<workspace>/` link. Reports use `/requests/<workspace>/report`; schema version 2
and the existing contributor-session API remain scoped to that instance. Reports reserve no allowance
and send no payment. Owner approval records compensation; Pay follows the isolated work-order flow.
See [payment requests](payment-requests.md) for acceptance and agent-facing contracts.

Existing contributor links and retained invoices do not automatically appear in the new app. Keep
their legacy host available until an explicitly reviewed routing or migration plan exists. Do not
reserve a replacement for an existing agent or copy its live state to populate the new app.

## Owner-run rollout

1. Create the standalone service with its own volume and temporary HTTPS host. Select
   `Dockerfile.invoices` explicitly; retain the legacy executor service and its entrypoint.
2. Configure the temporary sign-in host explicitly. Verify public health, scoped sessions, owner and
   contributor access, and the report/review flow using separately authorized records. New agent and
   grant signatures, funding and payment require owner action.
3. Before assigning `invoices.multiagency.ai`, establish a stable HTTPS host for the legacy executor
   and all existing contributor links and private bridge routing. Verify the intended host bindings
   and access before changing DNS/domain ownership. The same hostname cannot route both independently
   without an explicit gateway plan.
4. Follow [stopped-volume preservation](releases/stopped-volume-access.md) for any existing-service changes.
   Keep old settings and state intact. No record conversion or cross-host executor transfer is part of
   this extraction.
5. Capture a new verified source candidate: this extraction changes the earlier frozen source identity.

No service creation, domain reassignment, shutdown, deployment or mainnet payout is performed by these
files. Domain cutover and legacy-link continuity remain release gates.

## Verification

`test/invoices-entrypoint.test.ts` runs the actual shell entrypoint with a harmless launcher. It covers
fresh startup, reopening nested owner workspaces and refusal of legacy state without modification.
Existing contributor gateway, compensation and provisioning suites cover the shared backend offline.
These checks do not establish hosted sign-in, live isolation or payment settlement.
