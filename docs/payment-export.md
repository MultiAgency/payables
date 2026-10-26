# Payment export

`paymentExport` is a read-only procedure (`/a/<agent>/rpc/paymentExport`, a member read) that returns one row per
payment this agent has recorded, for a consumer such as the dashboard that matches payments to DAO proposals and
budgets. It reads the local journal only: no provider call, no write, no money moved.
Code: `src/payment-export.ts`. Test: `test/payment-export.test.ts`.

## Shape

`{ version: 1, payments: [...] }`, newest first. Each row:

| Field | Meaning |
|---|---|
| `paymentId` | The journal's idempotency key, stable for the payment's life |
| `correlationId` | The provider's id; null until something was sent. How an invoice joins its payment |
| `recipient`, `asset`, `amount`, `confidential` | The request as recorded; null if the record omits it |
| `state` | `prepared`, `held`, `approved`, `completed`, `failed`, `refunded`, `refused` or `unresolved` |
| `providerStatus` | The provider's last recorded status, as received |
| `refusal` | The refusal code when `state` is `refused` |
| `proposalId`, `proposalState` | The Sputnik proposal id when known; see below |
| `invoiceId` | The invoice this payment settles, when there is one |
| `createdAt` | When it was first recorded. The journal keeps no later timestamp, so none is invented |

## States

`held` waits for the owner's or DAO's approval. `approved` means the approval released it and the provider is
processing it; it is **not** `completed`. `completed` is a proven `SUCCESS`. A send whose outcome nobody has proven,
or a status not listed here, is `unresolved`: it is never reported as completed or failed on a guess.

## DAO proposal id

`proposalState` is `linked` (with `proposalId`), `none` (proven to have no proposal, such as a wallet owner) or
`unknown`. The agent server alone cannot read the chain, so the procedure reports `unknown` for every payment today.
`exportPayments(lookup)` takes a lookup from correlation id to proposal id; wiring one from the gateway's decoded
proposals (`src/gateway/proposals.ts`, which already matches proposals to held payments by their signed hash) is the
remaining step before the dashboard can match on `proposalId`.

## Limits

- The schema lives in `src/payment-export.ts` (`paymentExport`, zod). Publishing it in `@multiagency/sdk` is done in the
  sdk repository and has not been done yet.
- Only transfers are exported; swaps and other money actions are not payments.
