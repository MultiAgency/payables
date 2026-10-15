# Self-service Payables candidate

This is a local implementation, not a deployment or mainnet observation. A host may opt in to
letting a signed-in regular NEAR account or a Sputnik DAO reserve its own Payables workspace.
The existing owner-intent flow then creates the agent, applies its policy and issues its grant,
using the owner's wallet signature or the DAO's proposals. Reservation itself makes no provider
request and moves no funds. A proposal or signature is not proof that setup or payment settled.

The prototype permits one self-service agent per owner on this host. A DAO requester must be a
group member with permission to propose FunctionCall owner actions; public Everyone permissions
alone do not admit a requester. A regular account must match the signed-in account. Setup is bound
to that owner and the payout role on the server. DAO membership remains public on-chain.

## Candidate deployment

Use a separate Railway service with `Dockerfile.dashboard`, one replica, `/health`, and a fresh
persistent volume at `/data`. Set `DASHBOARD_FILE=/app/deploy/payables.json`; the supplied configuration
uses `payables.multiagency.ai`, reserves loopback ports starting at 9000, and caps reservations at 10.
Set `RAILWAY_DOCKERFILE_PATH=Dockerfile.dashboard` as described in operations. Keep the gateway's
public `PORT` outside the reserved range.

Configure the partner API key and origin, FastNear credentials and a fresh `SESSION_SECRET` of at
least 32 characters server-side. Do not import existing executor settings, grants, owner keys or
restore archives into this fresh service. New owners authorize their own agents. Keep the existing
`dao` and `invoices` executors in place. The self-service feature is disabled on the existing
dashboard configuration.

Before DNS is ready, `DASHBOARD_HOST` may name the service's actual HTTPS host. Both dashboard
sign-in and scoped invoice sign-in use that configured host. An owner's invoice URL is
`https://<host>/requests/<reserved-name>/`; it reaches only that instance's intake, never its internal
agreement bridge. Each intake has a distinct session-cookie name and signing secret; saved browser
drafts are scoped by invoice path. The public invoice page is unavailable until its agent exists.

Restarting a host reopens registered instances from their settings. Repeating reservation recovers
the same workspace; startup delays return a retry message without reserving another agent. No
automatic funding is performed. Wallet compatibility, DAO voting windows, provider policy limits,
confidential recipient readiness and the other limitations in README still apply.

## State preservation and limits

Preserve **the entire `.payables/` directory** under `/data/state`, including `registry.json` and
every instance directory. Each instance includes its `.env` and all of its `.ops/`, `.invoices/`,
`.owner-intents/`, `.strategy/`, `.plans/`, `.evidence/`, `.inbox/`, `.agreements/`, `.notify/`, and
`.work-orders/` state. Follow the existing stopped-writer backup procedure. Never delete a
reservation or missing settings file to create a replacement agent. Missing settings, a damaged
registry, conflicting names or ports, and orphan instance directories refuse startup or reservation.

This is additive state; existing hosts require no conversion. Coordination is single-host, not
distributed fencing. Do not run a second gateway or copy an active instance to another host.
Do not create another instance for the same agent. Existing configured owners must use their
existing workspace. Separate installations are not coordinated for DAO delegate signing.

Capacity is a host-wide limit, not a Sybil-resistant admission system. An authenticated visitor can
consume a reservation without completing setup. This small prototype needs operator supervision;
billing, invitation quotas, automatic reclamation and fleet scaling are not implemented. The
workspace list can also be affected by a failed ownership read; it does not invent missing evidence.

## Verification

`test/provisioning.test.ts` covers persistent reservation, restart compatibility, capacity, missing
settings, environment isolation and owner/role binding. `test/provisioning-http.test.ts` runs a real
gateway and isolated agent processes against local chain/provider fixtures: wallet and DAO
reservation, access denials, changed-owner refusal before provider access, scoped discovery, and
restart recovery. `test/browser/create-payables.cjs` covers the owner choice and retry state at
mobile and desktop widths. Existing owner-signature, invoice and gateway regressions remain
applicable. These checks are offline only; hosted creation and scoped invoice settlement still
require owner-run verification before being recorded as mainnet observations.

Brief 03's supplier conversion and forwarding remain unimplemented. Provisioning an owner's
Payables agent does not establish the isolated purchase-order lifecycle or those supplier outcomes.

## Platform bridge candidate

`POST /platform/payables` is an optional server-to-server reservation and retained-status endpoint.
It is disabled unless self-service is enabled and `PAYABLES_BRIDGE_SECRET` has at least 32 characters.
Use an independent shared secret with the platform backend; never reuse a session secret or grant.
The platform is trusted to assert its authenticated linked NEAR account. The gateway additionally
checks owner/DAO access (DAO policy cache: at most 60 seconds) and freshly reads provider-backed
agent ownership before returning records. Startup retries repeat only ownership reads.

Only version-1 `reserve` and `status` requests are accepted. Signing, grant issuance, payout,
arbitrary RPC and provider submission retry are absent. `platformPayments` is an internal local
projection denied to every browser role. It returns up to 100 retained payment statuses and
operation identities, not amounts, recipients, policy or council data. Unknown outcomes remain
unknown. Held approval does not mean settlement. The platform must hide cached records when a
read fails and retain immutable owner bindings when a reservation response is lost.

The companion dashboard candidate is in `/tmp/multiagency-dashboard-review`; its
`docs/payables.md` describes configuration, trust, recovery and limitations. Neither candidate is
a claim of deployed integration. Reconcile this candidate with the shared repository's concurrent
hosted-agent changes before shipping. Preserve `.payables/` and every child state directory.
