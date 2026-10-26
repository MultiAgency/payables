# Plan: the copied gateway and money-path code

Payables is a frontend and workflow on the shared backend (see the README decision). Its `src/` still holds a copy of
the gateway, executor and money path. This plan removes the copy without touching a running deployment or its state.
It describes steps; none has been carried out.

## Constraints

- Existing deployments and their state volumes (`.hosted`, `.ops`, `.work-orders`, `.owner-intents`, invoice storage)
  must keep working and keep their format. No grant moves to another executor, and no second executor starts.
- `Dockerfile`, `Dockerfile.dashboard` and `Dockerfile.invoices` build and run the copy today.
- About 114 of 122 offline tests import `src/`.

## Steps

1. **Settle ownership upstream.** Merge MultiAgency/sdk#1 so `sdk` is the named owner, and publish `@multiagency/sdk`
   (sdk#2).
2. **Account for drift.** Diff this repo's `src/` against `sdk`. Files only here (`compensation*.ts`,
   `contributor-portal-page.ts`, `payment-export.ts`, `src/gateway/platform-payables.ts`, ...) are either upstreamed to `sdk`
   by a reviewed change or stay here as workflow code. Nothing is deleted before this is decided file by file.
3. **Point the frontend at the gateway.** `web/` calls the hosted gateway through `@multiagency/sdk` clients, with a
   release candidate proving the same screens against the shared gateway on an isolated stack.
4. **Cut over per deployment, one at a time.** Deploy the frontend-only image; keep the old image and its volume
   untouched for rollback. Verify sign-in, private-record access and routing as in the existing release records.
5. **Remove the copy.** Only after a release has run on the shared backend: delete `src/gateway`, the executor and the
   money path here, move `test/send-path.test.ts` coverage to `sdk` only, and drop the backend Dockerfiles.

## Rollback

Each step is reversible until step 5: the previous image and volume are kept. Step 5 is a repository change and is
reverted with git.

## Not done

All steps. This repository's backend is unchanged.
