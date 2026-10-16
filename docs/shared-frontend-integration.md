# Payables frontend gateway adapter

This is an independently built frontend candidate for Proto's per-host `frontendDist`.
Local offline tests cover the adapter and browser fixtures; cross-repository and deployed
verification remain unverified until the Proto session runs its integration runner against this build.
No gateway, executor, owner signing, grant, payment authorization or state format changes are included.

## Consumer contract

`GET /gw/me` requires `agents`, `viewer` (nullable), and `invoices` (nullable HTTP(S) URL).
Agents require `name`, `owner`, and `dao`; `area`, `managed`, and nullable `invoices` are optional.
Viewer requires an account and per-agent access records containing all five boolean capabilities.
Instance names match `^[a-z0-9-]{1,32}$`; they are routing identifiers, never authority evidence.
Optional `selfService` and `setupAreas` must have their declared types when present.
Unknown fields are ignored. Invalid JSON, malformed discovery, and hosted HTML stay unavailable.
Only successful non-JSON responses on HTTP loopback outside `/a/` retain trusted local development.
Gateway JSON errors retain their useful `error` message.

Shared setup requires `selfService: true` and `setupAreas` containing `payables`.
Presence of `setupAreas`, including an empty array, overrides the legacy setup flag.
For compatibility, an omitted `setupAreas` retains standalone `selfService` behavior: the frontend
cannot distinguish a legacy host from a shared host that omits its area advertisement. Proto must
include `setupAreas` on shared hosts, including when setup is disabled.

Shared reservation sends `POST /gw/agents` with `{ owner, kind, area: "payables" }`.
Wallet owner is always the authenticated viewer account. DAO owner is the trimmed member input.
The response is `{ name }`; a validated name navigates to `/a/<name>/`.
Standalone reservation retains `POST /gw/payables` with `{ kind, owner }` and its validated
`{ url: "/a/pay-<24 lowercase hex characters>/" }` response.
Reservation signs nothing; existing owner confirmation and signing flows remain separate.
RPC keeps `/a/<name>/rpc/*` on the frontend's own origin.

Shared supplier links use only the selected agent's `invoices`; missing or null means unavailable.
They never reconstruct `/requests/<name>/` or use the global intake as a shared fallback.
An explicitly provided per-agent URL also takes precedence on legacy hosts. Legacy managed
agents retain their per-agent behavior, and other legacy agents retain the configured global intake.
Work-order links add the exact existing `workOrder` ID to that same selected intake URL.

## Proto handoff

Build path: `/Users/jlwaugh/agencies/payables/web/dist`.
Run Proto's `scripts/test-shared-frontend.mjs` against that absolute path; Payables does not claim
that runner has passed. No deployment, restart, migration, grant copying, cross-origin cookies,
CORS changes, or `/platform/payables` bridge changes were performed.

Changed source files:

- `web/src/app/gateway-contract.ts`
- `web/src/app/session.tsx`
- `web/src/app/create-payables.tsx`
- `web/src/features/workspace/dao.tsx`
- `web/src/main.tsx`
- `web/src/features/payables/invoice-link.tsx`
- `web/src/features/payables/work-orders.tsx`

Tests: `test/shared-gateway.test.ts` and `test/browser/shared-gateway.cjs`.
Documentation: this file.

Isolation fixtures should advertise `setupAreas` and distinct per-agent supplier URLs for two
owners, plus an agent with no supplier URL while global `invoices` points elsewhere. Assert each
selected agent's link and unavailable state, preserve the exact work-order query ID, deny another
owner's agent and supplier intake at the gateway, and retain sibling-host session isolation.
Supplier URL presentation is not proof that the supplier endpoint enforces access; Proto owns that
cross-repository check. Wallet/provider/chain observations must remain offline fixtures with no
owner signing or money calls. The shared frontend browser fixture also tests a discovered `own-`
reservation whose access is missing, without issuing private reads.

## Local validation (2026-10-15 UTC)

- `pnpm typecheck`: passed.
- `pnpm test`: 735 offline tests passed, zero failures.
- `pnpm build:web`: passed independently in Payables.
- The initial sandbox run could not launch Chromium and stalled in child-process fixtures;
  successful checks used approved execution outside the sandbox with the same offline harness.
- No live-funds tests were run. Cross-repository and deployed checks remain unverified.
- Browser suites passed: `shared-gateway.cjs`, `create-payables.cjs`, `invoices.cjs`,
  `work-orders.cjs`, `access-expiry.cjs`, and `public-overview.cjs`.
- `workspace-navigation.cjs` initially failed its wallet-header "refresh retains keyboard focus"
  assertion, then passed the complete suite on an unchanged-source rerun. This intermittent
  focus assertion remains a validation concern; the initial run is not reported as passing.
  Initial manifest/results: `.test-artifacts/browser/run-UuRnek/`;
  passing navigation rerun: `.test-artifacts/browser/run-kOuQYJ/`.
