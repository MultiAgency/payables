import { timingSafeEqual } from "node:crypto";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { z } from "zod";
import type { Router } from "../router.js";
import { nearOwner, type ProvisionedAgent } from "./provisioning.js";
import { accessOf, ownedBy, ownerOf } from "./roles.js";

export const platformRequest = z.strictObject({ version: z.literal(1), action: z.enum(["reserve", "status"]),
  actor: nearOwner, owner: nearOwner, kind: z.enum(["wallet", "dao"]) });

export function platformAuthenticated(header: string | undefined, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Narrow server-to-server bridge. Platform identity is trusted only for reservation and reads;
 * this endpoint has no signature, grant, transfer, retry-send or arbitrary RPC action. */
export async function platformPayables(raw: unknown, deps: {
  find: (owner: string) => ProvisionedAgent | undefined;
  reserve: (owner: string, kind: "wallet" | "dao") => ProvisionedAgent;
  host: string;
}) {
  const input = platformRequest.parse(raw);
  const owner = await ownerOf(input.owner);
  const access = accessOf(input.actor, owner);
  if ((input.kind === "dao") !== Boolean(owner.policy) || !access ||
      (input.action === "reserve" && !(access.canSign || access.canPropose)))
    throw new PlatformAccessDenied();
  const agent = input.action === "reserve" ? deps.reserve(input.owner, input.kind) : deps.find(input.owner);
  if (!agent || agent.owner !== input.owner || agent.kind !== input.kind) throw new Error("Payables reservation unavailable");
  const client: RouterClient<Router> = createORPCClient(new RPCLink({
    origin: `http://127.0.0.1:${agent.port}`, url: "/rpc", headers: { "x-gateway": "platform-read" },
  }));
  const readIdentity = () => client.ownerIdentity(undefined, { signal: AbortSignal.timeout(2_000) });
  let identity: Awaited<ReturnType<typeof readIdentity>> | undefined;
  const deadline = Date.now() + 10_000;
  for (;;) {
    try { identity = await readIdentity(); break; }
    catch (error) {
      if (input.action !== "reserve" || Date.now() >= deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  if (!identity) throw new Error("Payables ownership unavailable");
  if ((identity.agentId === null) !== (identity.owner === null) || !ownedBy(identity.owner, owner)) throw new PlatformAccessDenied();
  const records = identity.agentId ? await client.platformPayments(undefined, { signal: AbortSignal.timeout(5_000) }) : { payments: [], complete: true };
  return { name: agent.name, owner: input.owner, kind: input.kind, agentId: identity.agentId,
    workspaceUrl: `https://${deps.host}/a/${agent.name}/`,
    invoiceUrl: identity.agentId ? `https://${deps.host}/requests/${agent.name}/` : null,
    observedAt: new Date().toISOString(), ...records };
}

export class PlatformAccessDenied extends Error {}
