# Dashboard handoff

A user signed in at the dashboard reaches Payables without a second wallet prompt. No cookie is shared across origins.
Code: `src/gateway/handoff.ts` and the two routes in `src/gateway/server.ts`. Test: `test/dashboard-handoff.test.ts`.

## Flow

1. The dashboard's **server** calls `POST /platform/handoff` with `Authorization: Bearer <PAYABLES_BRIDGE_SECRET>` and
   `{ "account": "<signed-in NEAR account>" }`. It gets `{ ticket, expiresAt, url }`.
2. The dashboard sends the browser to `<url>?ticket=<ticket>` (an ordinary navigation).
3. `GET /gw/handoff?ticket=...` spends the ticket and opens **this host's own** session cookie for that account, then
   redirects to `/`.

## Guarantees

- A ticket is single-use, bound to one account, and valid for 60 seconds. At most 1,000 are open at once.
- Minting needs the bridge secret (at least 32 characters). Without it the routes answer 404, so the handoff is **off by default**.
- A browser request carrying another site's `Origin` (a page at the dashboard) is refused before routing, so a page cannot mint a ticket.
- The ticket grants a session and nothing else. The account's access to each agent is still resolved on every call, and a
  signed-in account that owns or belongs to nothing here is refused as at the normal sign-in.
- Owner signatures for money actions are unchanged: a handoff session cannot sign, approve or send.

## Trust and limits

- The dashboard is trusted to assert the account it signed in. This is the same trust Payables already extends to the
  bridge for `/platform/payables` reservations. A compromised dashboard server could open a session for any account that
  has access here, which exposes that account's reads and preparations, but never a signature or a send.
- Tickets are held in memory in one gateway process: a restart invalidates open tickets, and a second gateway instance
  would not honor them. The gateway runs one replica today.
- The mechanism follows the machine-interface decision in MultiAgency/sdk#3 (bearer secret, server-to-server, no shared
  cookies) but is its own mechanism: that interface is for programmatic RPC, this one is for a browser session. The
  dashboard side (MultiAgency/dashboard#78) has not been built, so no end-to-end run exists yet.
