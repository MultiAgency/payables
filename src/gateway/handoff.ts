import { randomBytes } from "node:crypto";

/**
 * Dashboard handoff: lets a user already signed in at the dashboard reach this host without a second wallet
 * prompt, with no cookie ever shared across origins. The dashboard's server, authenticated by the same bridge
 * secret as `/platform/payables`, asks for a ticket naming the account. The ticket is one-use, short-lived and bound
 * to that account; presenting it on this host opens this host's own session. A ticket grants a session and nothing
 * more: every call is still authorized per agent from the account, and owner signatures for money actions are
 * unchanged. The dashboard is trusted to assert the account it signed in, as it already is for reservations.
 */
export const TICKET_TTL_MS = 60_000;
export const MAX_TICKETS = 1_000;
const NEAR_ACCOUNT = /^(?=.{2,64}$)[a-z0-9]+([_-][a-z0-9]+)*(\.[a-z0-9]+([_-][a-z0-9]+)*)*$/;

export class TicketLimit extends Error {
  constructor() { super("Too many handoffs in progress. Try again shortly."); }
}

export class HandoffTickets {
  private readonly open = new Map<string, { account: string; expires: number }>();

  /** A ticket for `account`, or an error for an account that isn't a NEAR account id. */
  issue(account: unknown, now = Date.now()): { ticket: string; expiresAt: string } {
    if (typeof account !== "string" || !NEAR_ACCOUNT.test(account)) throw new Error("Name the NEAR account to hand off");
    for (const [ticket, { expires }] of this.open) if (expires <= now) this.open.delete(ticket);
    if (this.open.size >= MAX_TICKETS) throw new TicketLimit();
    const ticket = randomBytes(32).toString("base64url");
    this.open.set(ticket, { account, expires: now + TICKET_TTL_MS });
    return { ticket, expiresAt: new Date(now + TICKET_TTL_MS).toISOString() };
  }

  /** The account a ticket names, spending it; null if it is unknown, used or expired. */
  consume(ticket: unknown, now = Date.now()): string | null {
    if (typeof ticket !== "string") return null;
    const found = this.open.get(ticket);
    this.open.delete(ticket);
    return found && found.expires > now ? found.account : null;
  }
}
