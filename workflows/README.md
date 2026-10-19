# Payables workflow recipes

Step scripts that drive Proto's existing owner and payee surfaces against an isolated local Proto
with its simulated provider. Each story also says how to do its owner steps by hand on the Payables
screens (**On the owner's screens**), so a rehearser can follow it unaided. The recipes and their story inputs belong to Payables. Authority,
records and execution stay in Proto. Nothing here copies an executor, gateway or grant.

**Local only.** Wallet signatures (a generated test key), deposit arrival and settlement are
**simulated**, and so is the provider itself. The runner and every Proto process it starts refuse
non-loopback connections. A passing run is not evidence of mainnet or provider behaviour.

## Running

Pin every run to a frozen Proto snapshot, not a working checkout:

```sh
PROTO=/Users/jlwaugh/agencies/dao/proto/.test-artifacts/stack-snapshots/92815f4a75b45810eed815648f73769ea1a4b614b0ba66e137abbfa98389dd6f  # candidate, @multiagency/sdk 0.1.0
node workflows/purchase-order.mjs --proto "$PROTO"
```

- The runner starts Proto's own recipe stack (`test/e2e/stack.mjs`) as a separate process and drives it.
- Simulator actions (`fund`, `settle`, `dropTransferResponse`) go through the stack's file controls.
- Each run recomputes the snapshot's `runDigest` with the same algorithm as Proto's `test/e2e/run.mjs` and refuses to start if it does not match `SNAPSHOT.json`. Afterwards it records whether the snapshot is still unchanged.
- With a working checkout instead, the receipt records HEAD, a digest of the uncommitted diff and the untracked files, plus a warning.

Common options:
- `--scenario <file.json>`: the story inputs.
- `--fault <name>`: a failure case.
- `--pause`: wait for Enter before each step, for filming.
- `--keep`: leave the stack up at the end.
- `--browser headed|none`: Proto's stack opens owner and payee wallet contexts; the default is `none`.
- `--invoices-dist <abs dir>`: an Invoices release, staged and served by Proto's shared release server; its path and digest go in the receipt.
- `--payee-steps <invoices>/workflow/payee.mjs`: run payee submissions and filings through Invoices' UI-level steps on the actual Invoices page.
  - It is a separate process attached to the stack's browser over CDP, and needs `--invoices-dist` and a browser (default `headless`).
  - Its exit codes: 0 recorded, 1 refused, anything else an error.
  - The recipe's Proto reads still verify each result.
  - The receipt records the script's sha256. The page-minted identities are in `payee-<tab>.json`.
  - The step answers the page's filing confirm itself. `--human-confirm` (with `--browser headed`) leaves it for the person instead, as the filmed decision; this mode is not yet exercised with a person.
  - `--payee-fault lost-response` (sponsorship, contribution report) makes the browser miss Proto's answer to the submission. The page then resumes with its retained identity: same submission, or the same request and command id. Proto records one request and the story continues. This is distinct from `--fault lost-filing-response`, where the provider's answer to Proto is lost and the run stops.
  - Without this option (the default), payee calls use Proto's `payeeClient` (`@multiagency/sdk/payee`) from the vendored SDK package.

Pinned inputs for the UI path:

```sh
INVOICES=/Users/jlwaugh/agencies/dao/invoices/.test-artifacts/releases/7096493e44b4f8b5ab6608e73b5ff851c6befa9fffe91175973e372b9d381c33  # Invoices release I
node workflows/sponsorship.mjs --proto "$PROTO" --invoices-dist "$INVOICES" --payee-steps /Users/jlwaugh/agencies/dao/invoices/workflow/payee.mjs
```

Each run writes `.test-artifacts/workflows/<recipe>-<time>/receipt.json`, which holds:
- inputs and the Proto and Invoices provenance;
- every step's actor and retained identifiers;
- simulated parts;
- a completed, stopped or error outcome.

Exit codes:
- `0`: completed.
- `3`: stopped deliberately on an unknown outcome.
- `1`: error.

## Builder workflow: one period agreement (`contribution-report.mjs`)

The builder demo. One manually recorded agreement is also the work order: the builder, the signed document, the
period, the general scope and the earnings cap. Assignments arise during the period. Each one goes from report to
owner review, to an authorized payment, to a recorded settlement. Proto enforces the cap (`ceiling_exceeded`) and the
period (`outside_period`); the recipe shows both. The story is the scenario's `reports` array
(`scenarios/contribution-report.json`), so changing the story changes inputs, not code.

| # | Step | Actor | Recorded proof |
| --- | --- | --- | --- |
| 1 | Record the period agreement: cap 40 USDC, October, design scope (`compensation/agreement`) | owner | agreement id; remaining 40 |
| 2 | Report 1, an early assignment (`POST /api/compensation`, or the Invoices page with `--payee-steps`) | builder | request id and command id; one request on the agreement |
| 3 | Review report 1 at 25 USDC (`compensation/review`) | owner | approved at 25 for owner and builder; **no transfer** |
| 4 | Prepare report 1's isolated payout, then Sally's steps 2–7 (authorize, fund exactly, file, approve, settle) | owner, builder, *simulated provider* | order id = request id; exactly one transfer of 25 to the builder |
| 5 | The builder reads report 1 | builder | approved 25, paid through its order; remaining **15** for owner and builder |
| 6 | Report 2, a later assignment on the same agreement | builder | a second request; two on the agreement |
| 7 | Review report 2 at 20 USDC | owner | **refused `ceiling_exceeded`**; request unchanged; no transfer |
| 8 | Review report 2 at 15 USDC, then pay and settle as in step 4 | owner, builder, *simulated provider* | paid 15; remaining **0** |
| 9 | A report for November work | builder | **refused `outside_period`**; no request recorded; nothing sent |

**On the owner's screens** (isolated orders, the default payout path). Owner pages are under `/a/<agent>/`.
1. **Agreements** → *Record a signed agreement*: title, contributor NEAR account, signed document URL, signed-on date, work period, *Upper limit · USDC* 40, *Already approved outside this system* 0, scope → **Record signed terms**.
2. **Payments** → *Reports & payment requests* → select the builder's request (badge *In review*). Enter *Compensation · USDC* and *Review feedback* → **Approve** → **Approve compensation**. Nothing is paid.
3. The same card shows **Isolated order (default)**: choose *Isolated order payment deadline (UTC)* → **Prepare isolated order** → **Prepare payout**.
4. The retained work order appears below the card (or `/payees?order=<request id>`): **Authorize work order** and **Authorize invoice grant** (each opens the wallet; simulated), then *Fund this work order* with exactly the amount (simulated deposit).
5. The builder files the invoice on the Invoices page. The held payout appears in **Payments**: open it (*Review payment*, or `/follow/payment?payment=<correlation id>`) → **Sign approval** → **Continue to wallet**.
6. Settlement is simulated. The request card then reads *Payment: SUCCESS*, and the agreement shows the remaining cap.
7. To see the cap enforced, enter more than the remaining cap in step 2: the card says *Compensation exceeds the remaining ceiling by …* and **Approve** stays disabled. Proto also refuses it (`ceiling_exceeded`).

Identities are stable throughout: a resumed report keeps its request and command ids, and a refiled order keeps its invoice.
Review is not payment, and payment is not settlement: every review step asserts that no transfer moved.
Faults: `--payee-fault lost-response` (report 1's answer is lost, and the page resumes the same command),
`--fault lost-filing-response` (report 1's filing outcome is unknown, so the run **stops**: no new send),
`--fault short-funding`.

## Builder workflow on the shared payout agent (`shared-builder.mjs`)

The same builder story paid from the **shared** payout agent: one-time setup, then each report needs only its
review, shared preparation, submission, one owner approval and settlement. No new agent, grant or deposit is created per report.
Shared is an explicit owner choice, not the default. **Tradeoff:** if one send's reply is lost, every shared payout pauses
until that payment is reviewed.

```sh
A5=/Users/jlwaugh/agencies/payables/.test-artifacts/releases/b027732acd421070195a4564aacaff1a64e73467f36e51802d6f250de120d282  # Payables release A5
node workflows/shared-builder.mjs --proto "$PROTO" --owner-app "$A5" --setup ui \
  --invoices-dist "$INVOICES" --payee-steps /Users/jlwaugh/agencies/dao/invoices/workflow/payee.mjs [--payee-fault lost-response | --fault lost-filing-response]
```

- `--owner-app <frozen release dir>`: the stack serves that Payables release at `/a/payout/` (the recipe passes it to Proto's stack as `--payables-release`). Its digest goes in the receipt. **Every owner step goes through its screens**, driven by `owner-ui.mjs` in its own process (attached to the stack's loopback browser). Use a frozen release such as A5; a development build in `web/dist` also works but is not a release.
- `--setup ui`: the builder starts outside the payout policy and the payout agent unfunded, and the owner performs both setup steps on the screens. The recipe passes Proto's stack flags `--builder <payee>` (an account not yet agreed in the payout policy) and `--payout-funding 0`, and funds through the stack's `fundPayout` control after the owner reads the deposit instructions.
- Without it, the stack pre-provisions the setup.
- Receipt steps carry a `phase`: `agreement`, `setup`, `report n`.

**On the owner's screens.**
1. **Agreements** → record the period agreement, as in the isolated story.
2. **Setup, once.**
   - **Payees** → *Add a payee without agreement terms* → the builder's account → **Add**. The owner signs the policy update in the wallet (simulated).
   - **Balances & funding** → *Receive funds*: deposit to the shown address. In the local stack the arrival is simulated (`fundPayout`).
   - **Payments** → *Shared payouts · optional setup, once* then shows *Ready* for the payout agent, the builder in the signed policy, the payout grant and funding.
3. **Per report.**
   - **Payments** → select the request → approve with an explicit amount → open **Shared payout instead** → **Prepare shared payout** → confirm.
   - The card's steps then mark *3. Send it for approval*: **Review payment submission** → **Send payment**.
   - Step *4*: **Review the held payout** → **Sign approval** → **Continue to wallet**.
   - Settlement is simulated. *5. Settlement recorded*.
4. If a send's reply is lost, the card says *Outcome unknown: this shared payout may have been submitted. Shared payouts wait until it is reviewed. Nothing is sent again.* Do not send a replacement. The next shared send is refused (*Payment was not submitted by this call … Nothing was changed or sent.*) until the operator reviews the unknown payment.

| # | Step | Phase | Recorded proof |
| --- | --- | --- | --- |
| 1 | Record the agreement on Agreements | agreement | agreement id; remaining 40 |
| 2 | Add the builder to the payout policy (one owner signature) | setup | policy revision +1; one signed `policy_update` |
| 3 | Fund the payout agent | setup | balance = cap |
| 4 | The setup screen shows Ready ×4 | setup | the owner's screen text. Two items are the owner's (steps 2–3); the payout agent and its grant are **provisioned by the stack**, not set up by the owner |
| 5 | Report 1: submitted → approved 25 → shared prepared → sent → one approval → settled | report 1 | one transfer of 25; remaining 15; no new agent, grant or deposit |
| 6 | Report 2: 20 blocked on screen and refused `ceiling_exceeded` → approved 15 → paid | report 2 | remaining 0; one approval; one transfer |
| 7 | November report | report 3 | refused `outside_period`; nothing recorded or sent |

Faults:
- `--payee-fault lost-response`: report 1's submission answer is lost and the page resumes the same command.
- `--fault lost-filing-response`: report 1's **shared send** answer is lost. The payment stays `UNKNOWN` with one submission and no resend; report 2's send is refused with nothing sent; the run **stops** (exit 3).

## Sally's purchase order (`purchase-order.mjs`)

**Story.** Riverside Commons orders 200 printed programmes from Sally Prints at fixed terms. These are display labels on the fixture accounts `owner.near` and `payee.near`.

**Inputs** (`scenarios/sally.json`):
- `payee`, `payeeLabel`, `ownerLabel` (`payee` is also read by Invoices' `workflow/payee.mjs`)
- `amountUsdc`: up to 6 decimals.
- `note`: at most 200 characters.
- `until`: ISO time, in the future and within 365 days. `deadlineDays` works instead.

Another order changes only these values. `scenarios/translation.json` is a second example.

| # | Sequence | Actor | Proto surface | Recorded |
| --- | --- | --- | --- | --- |
| 1 | **Request**: fixed terms | owner | `workOrders/create` | order id, payee, amount, until |
| 2 | **Human decision**: authorize the dedicated order agent | owner, *simulated signature* | `workOrders/prepare create` → `submit` | owner-action correlation; order agent; policy matches the order |
| 3 | **Human decision**: authorize its invoice grant until the deadline | owner, *simulated signature* | `workOrders/prepare grant` → `submit` | correlation; grant id; expiry = `until` |
| 4 | **Agent action**: exact funding | owner + *simulated deposit* | `workOrders/deposit` | deposit correlation; balance = amount |
| 5 | **Payee action**: file the order's invoice, then file again | payee | `POST /api/work-orders/:id/file` (empty body) | same invoice id twice; one provider transfer; held |
| 6 | **Human decision**: approve the held payout | owner, *simulated signature* | `workOrders/prepare approve` → `submit` | payout correlation, approval id, vote correlation; payee sees `paying`, not paid |
| 7 | **Result**: recorded payment | *simulated settlement* | payee and owner reads | both see `paid` for the same invoice; one transfer; order balance 0 |

**On the owner's screens.**
1. **Payees** → *Create a work order*: *Work order payee*, *Fixed amount (USDC)*, *Agreed work*, *Work order deadline (UTC)* → **Save work order**.
2. On the order: **Authorize work order** → **Authorize invoice grant** (wallet signatures, simulated) → *Fund this work order* with exactly the amount (simulated deposit). The order then reads *Next: submit the fixed payout*.
3. The payee files on the Invoices page (or the owner uses **Submit payout**).
4. **Payments** → open the held payout → **Sign approval** → **Continue to wallet**.
5. Settlement is simulated. The order's invoice then reads *paid* for both owner and payee.

Failure cases:
- `--fault short-funding`: the owner funds one atomic unit short. The order is not ready, and no transfer or invoice exists. The owner then tops up exactly the 1-unit shortfall (still simulated) and the story continues to `paid`.
  - Over HTTP, filing is refused with 409 `work_order_not_ready`: "This order can't be filed yet… Nothing was sent…". The recipe asserts that.
  - Through the Invoices page, the page reads `ready: false` and files nothing (`not_ready`). The 409 is therefore asserted only on the HTTP path.
- `--fault lost-filing-response` (this story's **unknown-outcome** variant): the provider's answer **to Proto** is lost, not the payee's reply. The provider accepts the payout but its response is lost. Filing is `unknown`, and a repeated identical filing returns the same invoice id. One provider transfer exists and no approval is offered. The run **stops** (exit 3) and names the invoice to keep observing. It never sends again or marks a stage successful.
- **Payee-side identity evidence:** in every run, step 5 files the order's invoice twice (two tabs). The second filing returns the same invoice with one provider transfer. **Limit:** a lost payee-side reply on order filing is not separately demonstrated; Invoices' order-filing step has no lost-response fault.

**Video outline (about 90 s).**
1. Riverside Commons records the order: 200 programmes, 12.50 USDC, deadline.
2. Owner signs (simulated) to create an order agent that can pay only Sally, at most 12.50, with every payout held for approval.
3. Owner authorizes the grant and funds exactly 12.50 (simulated). The order is "ready".
4. Sally files. A second click returns the same invoice. The payout is held.
5. Owner approves (simulated). Sally still sees "paying".
6. Settlement (simulated). Both sides show paid, with one transfer.
7. Optional cuts: short funding refused, then topped up; lost response stops with "observe, don't resend".

## Community sponsorship (`sponsorship.mjs`)

**Story.** Riverside Commons (the owner and sponsor) pays Northside Garden (the community recipient) 20 USDC for its November meetup. Northside Garden requests the payment; Riverside Commons decides whether to release the confidential payout. The names are display labels on the fixture accounts `owner.near` and `payee.near`.

**Prerequisite (not shown as a step).** Northside Garden is already an owner-agreed confidential destination in the payout agent's signed policy. In the local stack this is a fixture policy. The recipe prints it at the start and records it in the receipt. Adding a recipient to the policy is a separate owner action that this recipe does not demonstrate.

**Outcome wording.** The recipient's view says `paid` or `failed`; the owner's record holds the provider status `SUCCESS` or `FAILED`. Both describe one outcome, printed as "paid (provider SUCCESS)" or "rejected (provider FAILED)".

**Inputs** (`scenarios/sponsorship.json`): `payee`, `payeeLabel`, `amountUsdc`, `note`.

| # | Sequence | Actor | Proto surface | Recorded |
| --- | --- | --- | --- | --- |
| 1 | **Request**: payment request under a caller-supplied submission id | recipient | `POST /api/invoices` | invoice id; `waiting` |
| 2 | **Agent action**: the payout agent submits a confidential transfer, which the provider holds for owner approval | payout executor | (inside 1, guarded dispatch) | one held transfer |
| 3 | **Human decision**: approve (or reject) the held payout | owner, *simulated wallet signature* | `held` → `owner/prepare approval_vote` → `owner/submit` | payout correlation, approval id, vote correlation; recipient does not see paid |
| 4 | **Result** | *simulated settlement* | recipient invoice read; owner `paymentStatus` | `paid` / `SUCCESS`, one transfer |

**On the owner's screens.** The recipient's request appears as a held payout in **Payments**. Open it (*Review payment*) → **Sign approval** (or **Sign rejection**) → **Continue to wallet**. Settlement is simulated. The page then reads the payment outcome.

Failure cases:
- `--fault owner-rejects`: the owner signs a rejection. The payout is recorded as `failed` / `FAILED` with `rejected_by_owner`, and nothing settles. The simulated rejection outcome is Proto's modelling assumption, not observed provider behaviour.
- `--fault lost-filing-response`: the request outcome is `unknown`, and the retry returns the same invoice id. The run stops and observes.

**(a) Does the intended proposal experience work end to end locally?** Only for a **wallet owner**.
- The owner (`owner.near`) signs one NEP-413 approval with a simulated wallet.
- Proto checks it against the exact held payout, submits it and records the owner action as succeeded.
- After simulated settlement, the payment record reads `SUCCESS`.

The **DAO proposal experience is not in the local stack.** A Sputnik DAO owner would file the same approval as a DAO proposal (`signer: "dao"`, members vote, Proto watches the chain for the signature). The local stack has no DAO account, no Sputnik contract and no chain simulation for it, so that path is unexercised.

**(b) Confidential payment versus private proposal.**
- What is confidential here is the **payment**: a confidential transfer to the recipient, held by the provider until the owner approves.
- The **approval decision** is a separate owner action.
- When a DAO makes that decision, it does so through a Sputnik proposal, and current Sputnik proposals are **public**. No private DAO proposal is implemented or demonstrated, and this recipe makes no such claim.
- Hiding DAO membership from requesters, chat-agent proposal filing (Trezu, City Nodes, Roster) and DAO voting are proposed integrations, not features here.

**Video outline (about 60 s).** On screen: Northside Garden is already an agreed destination in Riverside Commons' signed policy. The request arrives. The confidential payout is held. The owner reviews the exact recipient and amount and approves (simulated signature); the recipient still sees "paying". Settlement is simulated: "paid (provider SUCCESS)". Cut: the owner rejects, and the payout is recorded as rejected with nothing moved.

## Gaps

- Owner steps go through the Payables screens only in `shared-builder.mjs` (`--owner-app`). The other recipes drive the owner's Proto API. Their **On the owner's screens** steps describe the same actions by hand, and are not executed by those recipes. Payee steps go through the actual Invoices page only with `--payee-steps`; the default drives the payee routes with the SDK's payee client.
- Only wallet owners are exercised. DAO proposals, votes and private proposals are not in the stack. **Open outcome:** a wallet-owner sponsorship does not show that a DAO can authorize the same payout. DAO authorization of sponsorship remains unproven.
- Signatures, deposits, settlement and the provider are simulated. The rejection outcome is modelled.
- Accounts are the fixture accounts. Labels are display text only.
- Payee calls without `--payee-steps` use Proto's `payeeClient` from the installed vendored SDK package (`vendor/contract-pin.json`). The receipt records its version, tarball hash and source snapshot. Filmed payee steps use Invoices' `workflow/payee.mjs` through `--payee-steps`.
