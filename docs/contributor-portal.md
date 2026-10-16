# Invoices portal

Prepared locally, with offline tests; not deployed or observed on mainnet.

`invoices.multiagency.ai` serves contributors and payees, with a consolidated owner workspace as
a separate entry. `payables.multiagency.ai` remains an owner-facing entry. A subdomain does not
provide work-order isolation: the existing dedicated agent, signed policy, grant and executor
state provide that boundary.

## Contributor tasks

An owner shares the selected agent's contributor link. The contributor signs in with the receiving
NEAR account, requests an agreement or payout, reviews work orders, and follows recorded payment
status. Only that account's records are returned. No council roster or other payee list is exposed.

Contributors can also propose a work order: work description, fixed USDC total and deadline in UTC.
`POST /api/work-orders` records immutable terms in the existing `.work-orders/` format. It creates
no provider agent, grant, funding operation or payment. The owner reviews the record in Payables'
Agreements and uses the existing **Authorize work order** flow, then signs the grant and separately
funds the order. A contributor files against the order's fixed identity when it is ready; the payout
still requires owner approval. A request is not an accepted agreement or proof of payment.

The authenticated account determines the recipient. Extra authority or recipient fields are refused.
Request identities are scoped to the account; identical retries reopen the same record and changed
terms conflict. Drafts retain the original identity across reload and uncertain responses. Public
intake serializes requests in its executor process, limits unexpired orders to three per payee and
50 per parent agent, and uses the existing ten-attempt hourly submission limit. These controls are
offline-tested; they are not distributed fencing. Completed but unexpired orders still occupy slots.

## Consolidated owner view

The optional `portal: "invoices"` gateway configuration serves a static contributor entry at `/`
for visitors without an owner session, and at `/contributors` for everyone. `/owners` serves the
existing owner frontend: it discovers accessible agents through `/gw/me`, with the existing
per-agent permissions and owner-signature flow. An authenticated owner's `/` opens that same
workspace, preserving its existing navigation. Contributor cookies do not establish owner access.

The public entry reads no agent records and offers no public directory. Contributors paste an
owner-shared link on the same host. Per-agent intake remains `/requests/pay-<identity>/`.

## Deployment preparation

`deploy/invoices.json` is an opt-in gateway configuration for a new Invoices portal. Build the web
frontend and use the existing dashboard entrypoint with `DASHBOARD_FILE=/app/deploy/invoices.json`,
a strong `SESSION_SECRET`, and the persistent state volume. Gateway-managed invoice pages receive
an owner-workspace link to this host's `/owners`. The legacy single-agent `pnpm invoices` listener
continues to work and can link to an existing owner workspace through `INVOICES_OWNER_URL`; that
listener does not itself serve the consolidated owner frontend.

The supplied gateway config starts with no registered agents. It does not discover or combine
agents from another host. Register the intended agents and preserve their existing executor
ownership before shipping. Do not launch a second executor or provision replacement agents to
stand in for existing agents. Moving the existing Invoices host to this gateway requires a reviewed,
stopped-executor deployment and explicit configuration of its retained agent and state; this change
does not perform that migration, restart, DNS change or deployment.

There is no state-format conversion. Preserve `.work-orders/` and all child state, `.payables/`,
`.ops/`, `.invoices/`, `.owner-intents/`, `.strategy/`, `.plans/`, `.evidence/`, `.inbox/`,
`.agreements/` and `.notify/`. Existing owner-created work orders remain readable.

## Limits and verification

Contributor requests use the existing work-order record rather than a separate negotiated draft.
Editing, explicit owner decline, counteroffers, and archival of these requests are not implemented.
The owner accepts the proposed terms by authorizing the work order. No extra grant authority is
conferred by a contributor's session. Existing ordinary agreement ceilings/deadlines remain shown
to voters rather than automatically enforced. Work-order expiry stops new submissions; accepted
payments may finish later and residual funds are not automatically returned. Supplier conversion
and forwarding remain unimplemented.

Offline coverage: `test/work-order-http.test.ts` checks authentication, recipient binding, immutable
retries, concurrent limits and no provider-agent/payment creation. `test/contributor-gateway.test.ts`
checks entry routing and separate contributor/owner sessions. `test/browser/contributor-portal.cjs`
checks retained drafts, retries, session changes, owner links and mobile/desktop layout with synthetic
responses. These tests do not establish hosted or mainnet behavior.
