import { z } from "zod";

const name = z.string().regex(/^[a-z0-9-]{1,32}$/);
const supplier = z.url().refine(value => ["https:", "http:"].includes(new URL(value).protocol));
const access = z.object({ canSign: z.boolean(), canPropose: z.boolean(), canVote: z.boolean(), canExecute: z.boolean(), canManage: z.boolean() });
const schema = z.object({
  agents: z.array(z.object({ name, owner: z.string().min(1), dao: z.boolean(), area: z.enum(["payables", "treasury"]).optional(), managed: z.boolean().optional(), invoices: supplier.nullable().optional() })),
  invoices: supplier.nullable(),
  viewer: z.object({ account: z.string().min(1), access: z.record(z.string(), access) }).nullable(),
  selfService: z.boolean().optional(),
  setupAreas: z.array(z.enum(["payables", "treasury"])).optional(),
});
export type Gateway = z.infer<typeof schema>;
export type GatewayAgent = Gateway["agents"][number];
export const canSetupPayables = (gateway: Gateway) => gateway.selfService === true && (gateway.setupAreas === undefined || gateway.setupAreas.includes("payables"));

export async function readGateway(response: Response, location: Pick<Location, "hostname" | "protocol" | "pathname">): Promise<Gateway | null> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    const local = location.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) && !location.pathname.startsWith("/a/");
    if (response.ok && local) return null;
    throw new Error(`The hosted gateway returned an unexpected response (${response.status}).`);
  }
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error("The gateway returned invalid JSON."); }
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(body);
    throw new Error(error.success ? error.data.error : `The gateway answered ${response.status}.`);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error("The gateway returned invalid discovery data.");
  return parsed.data;
}

export function payablesReservation(gateway: Gateway, kind: "wallet" | "dao", dao: string): { path: `/gw/${string}`; body: Record<string, string> } {
  if (!gateway.viewer || !canSetupPayables(gateway)) throw new Error("Payables setup is not available on this host.");
  const owner = kind === "wallet" ? gateway.viewer.account : dao.trim();
  if (!owner) throw new Error("Enter the DAO owner account.");
  return gateway.setupAreas !== undefined
    ? { path: "/gw/agents", body: { owner, kind, area: "payables" } }
    : { path: "/gw/payables", body: { kind, owner } };
}

export function reservationUrl(path: string, result: unknown): string {
  if (path === "/gw/agents") {
    const parsed = z.object({ name }).safeParse(result);
    if (parsed.success) return `/a/${parsed.data.name}/`;
  } else {
    const parsed = z.object({ url: z.string().regex(/^\/a\/pay-[0-9a-f]{24}\/$/) }).safeParse(result);
    if (parsed.success) return parsed.data.url;
  }
  throw new Error("The workspace address could not be verified. Continue again to recover your setup.");
}

/** Shared intake belongs to the selected agent; a missing address never selects another owner. */
export function supplierUrl(gateway: Gateway | null | undefined, base: string): string | undefined {
  if (!gateway) return undefined;
  const current = gateway.agents.find(agent => `/a/${agent.name}` === base);
  if (gateway.setupAreas !== undefined || current?.managed || current?.invoices !== undefined) return current?.invoices ?? undefined;
  return gateway.invoices ?? undefined;
}
