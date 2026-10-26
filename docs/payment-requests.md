# Reports and payment requests

Prepared locally. Hosted behavior and real-funds operation of this workflow remain unverified.

The owner records a signed Google Doc reference, contributor account, signature date, work period,
USDC ceiling and opening approved compensation. The application does not fetch or verify the document.
Opening compensation includes work already approved elsewhere, paid or unpaid. Each agreement has
its own ceiling; owners must not duplicate the same allowance across separate agreement records.
Recipient, period and opening amount cannot be amended. A changed ceiling or document reference
creates a new version, retaining prior terms. Policy inclusion of an agreed payee remains separate.

The contributor opens the owner-shared invoice link and follows **Report & payment requests** to
`/report` (or `/requests/pay-<identity>/report` on a gateway). The default submission is a work report:
Contributions, Assessment, evidence links and work dates, with no amount. An optional invoice includes
an already agreed billed amount. Local drafts remain scoped to the account and intake path; server
drafts require complete report fields. Submission never prepares or sends payment.

The owner sets compensation during review, within the remaining signed ceiling. An explanation is
required for amount-free reports, changes to a billed amount, requested changes and declines. The
original billed amount is preserved. Approval records the exact request/agreement versions and reserves
the approved amount in one SQLite transaction; retries cannot reserve it again. Changed agreement
versions require return and resubmission. Failed payments and refunds do not release compensation.

**Pay** prepares a dedicated isolated payout under the submission's retained identity and a separate
owner-selected payment deadline. The owner authorizes its agent and expiring grant, funds it, submits
its fixed invoice and separately approves the held payout using controls embedded in the reviewed record.
A partial or lost preparation reopens that same identity. New submissions are marked for isolated
payouts and cannot prepare shared payments through the API. Legacy records retain their existing
preparation, submission and recovery path.

Submission readiness requires the observed confidential balance to equal the approved amount. Excess
funding is shown for review and refuses a new submission; deposits themselves are not prevented.
This local pre-submission check is not a provider-enforced lifetime cap or proof of atomic funding
isolation against concurrent outside deposits. An attempted payout always follows its retained identity,
even after replenishment. Wrong amounts and recipients remain bound by the existing local dispatch
checks and signed policy. No new rule is added to `authorize.ts`.

Expiry stops new submissions, not accepted payments. The owner sees expired authority, retained payment
outcomes and observed residual funds together. Residual recovery requires separate owner authorization;
automatic return, loosening the supplier policy and automatic replacement payments are not implemented.
The contributor sees the isolated payout's recorded status on their submission without owner actions,
agent/grant identifiers or balances. Read failures remain unavailable, never paid.

## Access and agent clients

Contributor reads and writes require the existing NEP-413 recipient session. The report sign-in and
session endpoints do not require provider reads. Contributors see only their own records; owner
recording/reviewing accounts are replaced with `owner` in their read projection. The service returns
no roster. Sputnik membership is independently public on-chain. Document URLs and feedback may
themselves contain identities supplied by the owner; the application does not anonymize their text.

Contributor API, relative to the selected intake path:

| Endpoint | Behavior |
|---|---|
| `GET /api/compensation/schema` | Public version-2 JSON Schema and protocol description; no private reads |
| `GET /api/compensation/session` | Current contributor account or null |
| `POST /api/signin/challenge` | Existing host-bound challenge |
| `POST /api/compensation/signin` | Verify the signed challenge and open the contributor session |
| `GET /api/compensation` | Own agreements, submissions, revision history and shared/isolated payout status |
| `POST /api/compensation` | Save draft or submit a report using a stable request ID, command ID and expected version |

Invoice amounts and owner-approved compensation are integer strings in USDC's atomic units. The JSON Schema describes structural inputs;
server checks also enforce recipient binding, periods, state transitions and record sizes. Repeat a
command with the same ID and body after a lost response, or read the current request before revising.
Changed content under an old command ID conflicts. Unknown payment outcomes never permit a new
request as a replacement. Evidence links are HTTPS references, never fetched by this service.

Owner RPCs are `compensation/list`, `compensation/agreement`, `compensation/review`,
`compensation/prepare` and `compensation/send`. Existing authenticated gateway permissions apply:
members read; settings capability records terms; execution capability reviews, prepares and submits.
These application capabilities do not replace the owner's signed policy, grant or approval.
The gateway overwrites the actor header using its verified session. The loopback-only local dashboard
records `local-owner`. Approve-only hosts use the configured agreements bridge to their payout executor;
the bridge is parent-agent-bound and uses the existing server-only shared secret.

MCP, OAuth or standalone personal-agent credentials for this workflow are not implemented. The
schema and API support clients operating within the existing authenticated session; loading a skill
does not establish that session or confer financial authority.

## State and rollout

Optional report amounts, isolated-payout markers and separate approved-compensation fields are additive record changes.
Existing approved invoices fall back to their retained billed amount; no stored records are converted.
Old readers require an upgrade before new amount-free reports are written.

The additive store is `.invoices/<agent-id>.compensation.sqlite` with an `.initialized` marker.
It uses synchronous SQLite transactions for current records, command receipts and history. Missing
initialized state or invalid records refuse reads/actions. It is single-host coordination, not
distributed fencing. No existing invoice database or agreement log is converted. Legacy invoices
retain their identities, outcomes and recovery rules.

Preserve the entire `.invoices/` directory, including compensation databases and markers, alongside
`.ops/`, `.owner-intents/`, `.strategy/`, `.plans/`, `.evidence/`, `.inbox/`, `.agreements/`, `.notify/`,
`.work-orders/` and `.payables/`. Use the existing stopped-writer backup/deployment procedure.
Do not delete markers, rebuild an empty allowance or copy an active instance to a second executor.

The contributor React bundle is built as `contributor.html`; invoice listeners serve it at `/report`
and serve its `/static/` assets. Build and deploy the matching frontend and server together. Existing
invoice intake remains available, but new direct invoice submissions are refused for a contributor
who has a recorded period agreement. Existing retained invoice continuation remains available.
Manual owner payouts and independent work-order creation are outside this agreement ledger; include
outside approvals explicitly rather than assuming a universal lifetime spending cap.

## Verification and remaining work

Offline tests cover report authentication and privacy, exact command retries, revision conflicts,
ceiling amendments, concurrent approvals in real child processes, missing/corrupt SQLite state,
separate payment preparation and one submission through dispatch. Browser fixtures cover the report
composer, draft retention and resumption, returns/resubmission and owner review at desktop/mobile widths.
They also cover ceiling explanations, cancelled confirmations, lost preparation/submission responses,
and retained payment identities across held, unknown, failed and successful observations.
Report-first browser fixtures cover owner-set compensation, partial isolated preparation, exact
funding readiness and submission-response recovery. Provider
outcomes in these browser fixtures are simulated, not settlement evidence.
These observations do not establish hosted or mainnet behavior.

Document uploads, signature verification, approval reversal, partial approvals, report export,
dashboard integration and personal-agent authentication are not implemented. The contributor follows
isolated payment status on their submission; the owner-shared order invoice link remains available. Campaign winner validation,
automatic supplier conversion/forwarding and residual-fund return remain outside this change.


## Release acceptance walkthrough

Use the [release handoff](releases/release-report-payout.md) for candidate identity, state preservation,
production gates and recovery boundaries.

Prepare the matching server and frontend as one release. Before the owner deploys, complete typecheck,
offline tests, the compensation/invoices/agreements/payments/work-orders browser suites and evidence
consistency checks. Preserve state using the stopped-writer procedure above. This walkthrough does
not authorize deployment, a restart or a mainnet payment.

After the owner deploys, verify with the intended contributor and owner accounts:

1. Record one externally signed period agreement and confirm its ceiling, opening approved amount
   and remaining allowance. Verify unrelated accounts cannot see it.
2. Compose an amount-free report, leave it, resume it and reload. Submit once; confirm no payment was prepared.
3. Return it with feedback. Revise and resubmit under the same request identity. Owner-entered compensation above the ceiling must keep approval disabled with an explanation.
4. Set compensation, explain it and approve the accepted revision. Confirm the allowance changes once and no funds move.
5. Use Pay to prepare the isolated payout. Authorize the agent and grant, fund exactly its approved
   amount, then cancel its submission confirmation and verify nothing was submitted.
   Preparation and submission recovery must reopen the retained request/payment, never replace it.
6. Only when the owner separately authorizes a small real payment, submit under the reviewed policy,
   follow its held payout through owner approval and verify settlement from operation evidence.
   A vote or a successful HTTP response alone does not establish settlement.
7. If the outcome is unknown or failed, keep the retained identity and approval reservation. Do not
   create a replacement; reconcile using the existing operation controls.

Record hosted verification separately from dated mainnet observations. Keep transaction identities,
amounts and payees in the private release record; update canonical evidence only for observed claims.
