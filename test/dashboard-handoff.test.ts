import assert from "node:assert/strict";
import { test } from "node:test";
import type { IncomingMessage } from "node:http";
import { HandoffTickets, MAX_TICKETS, TICKET_TTL_MS, TicketLimit } from "../src/gateway/handoff.js";
import { platformAuthenticated } from "../src/gateway/platform-payables.js";
import { crossSite } from "../src/http.js";
import { sessionAccount, sessionToken } from "../src/signin.js";

test("a ticket opens the named account once, and only within its lifetime", () => {
  const tickets = new HandoffTickets(), now = 1_000_000;
  const { ticket } = tickets.issue("owner.near", now);
  assert.equal(tickets.consume(ticket, now + 1), "owner.near");
  assert.equal(tickets.consume(ticket, now + 2), null, "a spent ticket never works again");
  const late = tickets.issue("owner.near", now).ticket;
  assert.equal(tickets.consume(late, now + TICKET_TTL_MS), null, "an expired ticket is refused");
  assert.equal(tickets.consume("not-a-ticket", now), null);
  assert.equal(tickets.consume(undefined, now), null);
  assert.notEqual(tickets.issue("a.near", now).ticket, tickets.issue("a.near", now).ticket);
});

test("only a NEAR account id can be handed off, and open tickets are bounded", () => {
  const tickets = new HandoffTickets();
  for (const bad of [undefined, 1, "", "UPPER.near", "has space.near", "a".repeat(70), "../x"]) assert.throws(() => tickets.issue(bad));
  for (let i = 0; i < MAX_TICKETS; i++) tickets.issue("owner.near", 5);
  assert.throws(() => tickets.issue("owner.near", 5), TicketLimit);
  assert.doesNotThrow(() => tickets.issue("owner.near", 5 + TICKET_TTL_MS), "expired tickets make room");
});

test("only the bridge secret mints a ticket, and a browser request from the dashboard's origin is refused", () => {
  const secret = "s".repeat(32);
  assert.equal(platformAuthenticated(`Bearer ${secret}`, secret), true);
  assert.equal(platformAuthenticated(`Bearer ${"x".repeat(32)}`, secret), false);
  assert.equal(platformAuthenticated(undefined, secret), false);
  assert.equal(platformAuthenticated(`Bearer short`, "short"), false, "a weak secret disables the bridge");
  const request = (origin?: string) => ({ headers: { host: "payables.multiagency.ai", ...(origin && { origin }) } }) as unknown as IncomingMessage;
  // The gateway refuses every non-GET with another site's Origin before routing, so a page at the dashboard cannot mint one.
  assert.equal(crossSite(request("https://dev.multiagency.ai")), true);
  assert.equal(crossSite(request("null")), true);
  assert.equal(crossSite(request()), false, "the dashboard's server sends no Origin");
});

test("the session a handoff opens is this host's own and names only the account", () => {
  const token = sessionToken("owner.near", "host-secret");
  assert.equal(sessionAccount(token, "host-secret"), "owner.near");
  assert.equal(sessionAccount(token, "another-hosts-secret"), null, "another host's secret does not accept it");
});
