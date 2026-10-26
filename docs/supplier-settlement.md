# Supplier settlement (idea 03)

How a purchase order becomes a settled supplier payment. The flow is defined and proven offline as a pure model:
`src/supplier-settlement.ts`, tested by `test/supplier-settlement.test.ts`. It is **not yet connected** to work-order
dispatch (`src/work-orders.ts`, `src/work-order-binding.ts`), so nothing here changes how money moves today.

## Flow

`requested` → `agreed` → `funded` → `converted` → `held` → `approved` → `settled`, with terminal `expired`, `refused`, `failed`.

| Stage | Meaning | What leaves it |
|---|---|---|
| requested | The supplier asked. Binds nothing. | Only the owner's `agree` |
| agreed | The owner agreed; the terms (supplier, asset, amount, invoice, deadline) are fixed by digest | Funding arrives |
| funded | Inbound funds are in the order's own agent | A conversion quote that passes |
| converted | The inbound asset was swapped into the agreed asset | The forwarding payment is held |
| held | The forward to the supplier waits for the owner's approval | The owner's approval |
| approved | The owner released it; the provider is processing it | A proven provider outcome |
| settled | The provider reported `SUCCESS` | — |

## Rules the model enforces

- **A request is not an agreement.** Only `agree` leaves `requested`; funding a request is refused.
- **An approval is not a payment.** `approved` becomes `settled` only on a provider `SUCCESS`. `PROCESSING`, `SENT`,
  `UNCERTAIN` or any other status leaves it `approved`: an unknown outcome stays unknown. `FAILED` and `REFUNDED` become `failed`.
- **Changed terms are refused** at every stage: supplier, asset, amount, invoice or deadline.
- **Expiry:** after the deadline nothing new starts (funding, conversion, hold, approval). A payment already sent still receives its outcome.
- **Conversion** must produce the agreed asset, cover the agreed amount exactly or better, and cost at most 100 bps.
- **No skipping, no repeating,** and a finished order never changes.

## Mainnet status

Not observed. The model is offline-tested only. In the product, buyer work orders are offline-tested; funding and settlement
on a deployed work-order agent, supplier conversion and forwarding, and residual-fund return are all unobserved or unbuilt.

## To finish

1. Drive the model from the work-order agent: record each stage durably, and make dispatch refuse a forward whose stage is not `approved`-eligible.
2. Add conversion and forwarding to the offline E2E suite (`test/e2e`, `workflows/purchase-order.mjs`) against the simulator.
3. Observe one order on mainnet, separately authorized, and record it in `docs/mainnet-log.md`.
