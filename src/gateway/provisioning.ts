import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import lockfile from "proper-lockfile";
import { z } from "zod";
import { mkdirSynced, writeAtomic } from "../synced.js";

export const nearOwner = z.string().min(2).max(64).regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
export const reservationInput = z.strictObject({ owner: nearOwner, kind: z.enum(["wallet", "dao"]) });
export const provisioningOptions = z.strictObject({
  maxAgents: z.number().int().min(1).max(50),
  firstPort: z.number().int().min(1024).max(65000),
});
const recordSchema = reservationInput.extend({ name: z.string().regex(/^pay-[0-9a-f]{24}$/), port: z.number().int().min(1024).max(65535) });
const registrySchema = z.strictObject({ version: z.literal(1), agents: z.array(recordSchema) });
type Reservation = z.infer<typeof recordSchema>;
export type ProvisionedAgent = Reservation & { area: "payables"; executor: true; envFile: string; directory: string };

/** One gateway host, one durable registry. Missing instance settings never mean a fresh agent. */
export class ProvisioningStore {
  private readonly root: string;
  private readonly file: string;
  constructor(root: string, private readonly options: z.infer<typeof provisioningOptions>, private readonly configured: { name: string; port: number; owner: string }[]) {
    provisioningOptions.parse(options);
    this.root = resolve(root);
    mkdirSynced(this.root);
    this.file = join(this.root, "registry.json");
  }
  private expand(record: Reservation): ProvisionedAgent {
    const directory = join(this.root, record.name);
    return { ...record, area: "payables", executor: true, directory, envFile: join(directory, ".env") };
  }
  list(): ProvisionedAgent[] {
    if (!existsSync(this.file)) return [];
    const { agents } = registrySchema.parse(JSON.parse(readFileSync(this.file, "utf8")));
    const names = new Set(this.configured.map(a => a.name)), ports = new Set(this.configured.map(a => a.port)), owners = new Set<string>();
    return agents.map(record => {
      if (record.name !== this.name(record.owner) || names.has(record.name) || ports.has(record.port) || owners.has(record.owner))
        throw new Error("Conflicting Payables registry. Preserve state and review configuration.");
      names.add(record.name); ports.add(record.port); owners.add(record.owner);
      const agent = this.expand(record);
      if (!existsSync(agent.envFile)) throw new Error("Payables instance settings are missing. Restore its complete state before restarting.");
      return agent;
    });
  }
  private name(owner: string) { return `pay-${createHash("sha256").update(owner).digest("hex").slice(0, 24)}`; }
  reserve(owner: string, kind: "wallet" | "dao"): ProvisionedAgent {
    reservationInput.parse({ owner, kind });
    const release = lockfile.lockSync(this.root, { realpath: true, retries: 0 });
    try {
      const agents = this.list();
      const existing = agents.find(a => a.owner === owner);
      if (existing) {
        if (existing.kind !== kind) throw new Error("The existing owner's signer type differs. Review its original setup.");
        return existing;
      }
      if (this.configured.some(a => a.owner === owner)) throw new Error("This owner already has a configured workspace. Open it from Home.");
      if (agents.length >= this.options.maxAgents) throw new Error("This host has reached its Payables capacity. Contact the host owner.");
      const occupied = new Set([...this.configured, ...agents].map(a => a.port));
      let port = this.options.firstPort;
      while (occupied.has(port)) port++;
      if (port > 65535) throw new Error("No Payables port is available.");
      const record = { owner, kind, name: this.name(owner), port };
      const agent = this.expand(record);
      if (existsSync(agent.directory)) throw new Error("An unregistered Payables instance exists. Preserve and recover it before continuing.");
      mkdirSynced(agent.directory);
      writeAtomic(agent.envFile, `AUTOPILOT=off\n${kind === "dao" ? `TREASURY_ACCOUNT=${owner}\n` : ""}`, 0o600);
      writeAtomic(this.file, JSON.stringify({ version: 1, agents: [...agents.map(({ owner, kind, name, port }) => ({ owner, kind, name, port })), record] }), 0o600);
      return agent;
    } finally { release(); }
  }
}

/** Allowlist shared infrastructure only; never inherit another agent's grant, signer, schedule or invoice bridge. */
export function provisioningEnv(agent: ProvisionedAgent, parent: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "NODE_ENV", "NODE_OPTIONS", "NEAR_INTENTS_AGENT_API_KEY", "NEAR_INTENTS_AGENT_API_URL", "FASTNEAR_API_KEY", "NEAR_RPC_URL"])
    if (parent[key] !== undefined) env[key] = parent[key];
  return { ...env, ENV_FILE: agent.envFile, PORT: String(agent.port), DASHBOARD_AREA: "payables", AUTOPILOT: "off",
    HOSTED_OWNER_ACCOUNT: agent.owner, HOSTED_OWNER_KIND: agent.kind };
}

export function checkProvisionedCreation(action: { role?: string; owner?: { type: string; account_id?: string } }, signer: string, env: NodeJS.ProcessEnv = process.env) {
  if (!env.HOSTED_OWNER_ACCOUNT) return;
  if (action.role !== "payout") throw new Error("This workspace creates only a Payables agent.");
  if (signer !== env.HOSTED_OWNER_KIND) throw new Error("Use the reserved owner's signer.");
  if (signer === "wallet" && (action.owner?.type !== "near" || action.owner.account_id !== env.HOSTED_OWNER_ACCOUNT) ||
      signer === "dao" && env.TREASURY_ACCOUNT !== env.HOSTED_OWNER_ACCOUNT)
    throw new Error("The creation owner must match this workspace's reserved owner.");
}
