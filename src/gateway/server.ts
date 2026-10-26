import { platformAuthenticated, platformPayables, platformRequest, PlatformAccessDenied } from "./platform-payables.js";
import { contributorPortalPage } from "../contributor-portal-page.js";
import { signingHost } from "./signing-host.js";
import { HandoffTickets, TicketLimit } from "./handoff.js";
import { createHmac } from "node:crypto";
import { ProvisioningStore, provisioningEnv, reservationInput } from "./provisioning.js";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, request, type ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isIntervention, mayCall } from "./allowlist.js";
import { BadRequest, crossSite, readJson, SECURITY_HEADERS, sendFailure, sendJson as json, serveStatic } from "../http.js";
import { chainKeyLookup, challengeAnswer, clientAddress, hourlyLimit, parseSignIn, sessions, verifySignIn } from "../signin.js";
import { type AgentEntry, childEnv, hostOf, loadConfig } from "./config.js";
import { recentSignProposals } from "./proposals.js";
import { accessOf, ownerOf, resolveAccess, resolveAgentAccess } from "./roles.js";
import { appendSynced } from "../synced.js";

/**
 * The hosted dashboard: the one public process. It signs members in, decides per request what each
 * may do from each agent's owner (a DAO's own policy, or the owner account itself), and forwards
 * allowed calls to the agent servers, which keep
 * running on loopback exactly as they do locally, each with its own agent, grant, lock and logs. The
 * gateway itself holds no grant token.
 */

const config = loadConfig();
const provisioning = config.selfService ? new ProvisioningStore(".payables", config.selfService, config.agents) : undefined;
const reserved = new Map(provisioning?.list().map(a => [a.name, a]) ?? []);
const fleet = [...config.agents, ...reserved.values()];
const PORT = Number(process.env.PORT ?? 8800);
/** The host members sign in to; DASHBOARD_HOST overrides it, e.g. to test on a provider's domain before DNS moves. */
const HOST = hostOf(process.env.DASHBOARD_HOST || config.host);
const signInHost = signingHost(HOST, process.env.DASHBOARD_SIGNIN_HOSTS);
/** Where the app is installed, apart from the working directory, which holds the agents' state. */
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = join(APP, "web/dist");
// Signs every session: an empty or missing secret would let anyone forge one, so the gateway won't start.
const SECRET = process.env.SESSION_SECRET ?? "";
if (SECRET.length < 32) throw new Error("Set SESSION_SECRET to a random value of at least 32 characters before starting the gateway");
const session = sessions({ cookie: "dao_session", secret: SECRET, secure: true });

const INTERVENTIONS = join(".evidence", "interventions.jsonl");
/**
 * Recorded interventions since `since`, oldest first, and the line numbers that don't parse. An
 * unreadable line may have been a call, so it is counted, not skipped: the report can't claim none.
 */
function interventions(since: string) {
  const calls: { at: string; account: string; agent: string; path: string }[] = [];
  const corrupt: number[] = [];
  const text = existsSync(INTERVENTIONS) ? readFileSync(INTERVENTIONS, "utf8") : "";
  for (const [index, line] of text.split("\n").entries()) {
    if (!line.trim()) continue;
    try { calls.push(JSON.parse(line)); } catch { corrupt.push(index + 1); }
  }
  return { calls: calls.filter((i) => i.at >= since), corrupt };
}

/** The signed-in account and what it may do with each agent it may see, or null. */
async function viewer(req: IncomingMessage) {
  const account = session.account(req);
  if (!account) return null;
  const access = await resolveAccess(account, fleet);
  return config.selfService || Object.keys(access).length ? { account, access } : null;
}

/**
 * The agents a visitor may know of, each with its owner and whether that owner is a DAO (signing by
 * proposal): a signed-in viewer's own, or, signed out, only the DAOs' agents. Those are public already,
 * since every owner action is an on-chain proposal naming the agent; a wallet's agent is not.
 */
async function agentsView(me: Awaited<ReturnType<typeof viewer>>) {
  const visible = me ? fleet.filter(a => Boolean(me.access[a.name])) : config.agents;
  const all = await Promise.all(visible.map(async ({ name, owner, area }) => ({ name, owner, ...(area && { area }), ...(reserved.has(name) && { managed: true, invoices: `https://${HOST}/requests/${name}/` }), dao: (await ownerOf(owner)).policy !== null })));
  return all.filter(a => me || a.dao);
}

/** Forwards a call to an agent server on loopback, streaming both ways (some procedures stream events). */
function forward(req: IncomingMessage, res: ServerResponse, agent: AgentEntry, path: string, account: string) {
  const headers = { ...req.headers, host: `127.0.0.1:${agent.port}`, "x-payables-actor": account };
  delete headers.origin;
  delete headers.cookie;
  const upstream = request({ host: "127.0.0.1", port: agent.port, path: `/rpc/${path}`, method: req.method, headers }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, { ...answer.headers,
      ...(["autopilot/log", "owner/actions", "paymentHistory", "strategy/get"].includes(path) && { "cache-control": "private, no-store" }) });
    answer.pipe(res);
  });
  upstream.on("error", () => json(res, 502, { error: `The ${agent.name} agent server is not answering` }));
  req.pipe(upstream);
}

/**
 * Sign-in challenges per connecting address per hour. The global cap in signin.ts bounds memory;
 * this keeps one client from filling it and locking every member out of sign-in.
 */
const CHALLENGES_PER_HOUR = 20;
const mayChallenge = hourlyLimit(CHALLENGES_PER_HOUR);
const handoffTickets = new HandoffTickets();

createServer(async (req, res) => {
  // On every answer: no other site may frame these pages (they trigger wallet signatures, so a hidden
  // frame could trick a click), types are taken as declared, no address leaks to linked sites, and
  // browsers keep to HTTPS once they have seen it.
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  try {
    const url = URL.parse(req.url ?? "/", "http://gateway");
    if (!url) throw new BadRequest("Malformed request.");
    const { pathname } = url;
    // State-changing requests must come from this site's own pages.
    if (req.method !== "GET" && crossSite(req)) return json(res, 403, { error: "Cross-site request" });

    if (pathname === "/health") return json(res, 200, { ok: true });
    if (config.portal === "invoices" && req.method === "GET" &&
        (pathname === "/contributors" || pathname === "/" && !session.account(req))) {
      return res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(contributorPortalPage());
    }

    if (pathname === "/gw/challenge" && req.method === "GET") return json(res, ...challengeAnswer(signInHost(req.headers.host), mayChallenge(clientAddress(req))));
    if (pathname === "/gw/session" && req.method === "POST") {
      const account = await verifySignIn(parseSignIn(await readJson(req)), signInHost(req.headers.host), chainKeyLookup).catch((error: Error) => error);
      if (account instanceof Error) return json(res, 401, { error: account.message });
      const access = await resolveAccess(account, fleet);
      if (!config.selfService && !Object.keys(access).length) return json(res, 403, { error: `${account} doesn't own any agent here, nor is a member of a DAO that does` });
      return json(res, 200, { account, access }, { "set-cookie": session.open(account) });
    }
    if (pathname === "/gw/logout" && req.method === "POST")
      return json(res, 200, {}, { "set-cookie": session.close() });

    if (pathname === "/gw/me") {
      const me = await viewer(req);
      return json(res, 200, { agents: await agentsView(me), invoices: config.invoices ?? null, viewer: me, ...(config.selfService && { selfService: true }) });
    }

    // Dashboard handoff (src/gateway/handoff.ts): the dashboard's server mints a one-use ticket with the bridge secret;
    // the browser then arrives here with it and gets this host's own session. Off unless the bridge secret is set.
    if (pathname === "/platform/handoff" && req.method === "POST") {
      const secret = process.env.PAYABLES_BRIDGE_SECRET;
      if (!secret || secret.length < 32) return json(res, 404, { error: "Not found" });
      if (!platformAuthenticated(req.headers.authorization, secret)) return json(res, 403, { error: "Platform authentication required" });
      try {
        const body = await readJson(req);
        return json(res, 200, { ...handoffTickets.issue(body.account), url: `https://${HOST}/gw/handoff` }, { "cache-control": "private, no-store" });
      } catch (error) {
        return json(res, error instanceof TicketLimit ? 429 : 400, { error: (error as Error).message }, { "cache-control": "private, no-store" });
      }
    }
    if (pathname === "/gw/handoff" && req.method === "GET") {
      const secret = process.env.PAYABLES_BRIDGE_SECRET;
      if (!secret || secret.length < 32) return json(res, 404, { error: "Not found" });
      const account = handoffTickets.consume(url.searchParams.get("ticket"));
      if (!account) return json(res, 401, { error: "This handoff link is unknown, used or expired. Open Payables again from the dashboard." });
      const access = await resolveAccess(account, fleet);
      if (!config.selfService && !Object.keys(access).length) return json(res, 403, { error: `${account} doesn't own any agent here, nor is a member of a DAO that does` });
      return res.writeHead(303, { location: "/", "set-cookie": session.open(account), "cache-control": "private, no-store" }).end();
    }

    if (pathname === "/platform/payables" && req.method === "POST") {
      const secret = process.env.PAYABLES_BRIDGE_SECRET;
      if (!provisioning || !secret || secret.length < 32) return json(res, 404, { error: "Not found" });
      if (!platformAuthenticated(req.headers.authorization, secret)) return json(res, 403, { error: "Platform authentication required" });
      const parsed = platformRequest.safeParse(await readJson(req));
      if (!parsed.success) return json(res, 400, { error: "Invalid Payables bridge request" });
      try {
        const result = await platformPayables(parsed.data, { host: HOST,
          find: owner => [...reserved.values()].find(a => a.owner === owner),
          reserve: (owner, kind) => {
            const agent = provisioning.reserve(owner, kind);
            if (!reserved.has(agent.name)) { reserved.set(agent.name, agent); fleet.push(agent); start(agent); }
            return agent;
          },
        });
        return json(res, 200, result, { "cache-control": "private, no-store" });
      } catch (error) {
        return json(res, error instanceof PlatformAccessDenied ? 403 : 503, { error: "Payables access or records could not be verified. Retry the retained connection." }, { "cache-control": "private, no-store" });
      }
    }

    if (pathname === "/gw/payables" && req.method === "POST") {
      const account = session.account(req);
      if (!account) return json(res, 401, { error: "Sign in first" });
      if (!provisioning) return json(res, 404, { error: "Self-service setup is not enabled on this host" });
      const parsed = reservationInput.safeParse(await readJson(req));
      if (!parsed.success) return json(res, 400, { error: "Choose a valid NEAR owner and signer type." });
      const { owner: accountId, kind } = parsed.data;
      // A wallet reservation never accepts an arbitrary owner; DAO membership and proposal rights
      // come from chain evidence, not from the requester's declaration.
      if (kind === "wallet" && accountId !== account) return json(res, 403, { error: "Use your signed-in account as owner." });
      const owner = await ownerOf(accountId);
      const access = accessOf(account, owner);
      if ((kind === "dao") !== Boolean(owner.policy) || !access || !(access.canSign || access.canPropose))
        return json(res, 403, { error: "Use your own NEAR account or a Sputnik DAO where you are a member allowed to propose owner actions." });
      const agent = provisioning.reserve(accountId, kind);
      if (!reserved.has(agent.name)) {
        reserved.set(agent.name, agent); fleet.push(agent); start(agent);
      }
      // A repeat after a lost response resumes the same record. Never create another agent here.
      for (let attempt = 0; attempt < 50; attempt++) {
        if (await resolveAgentAccess(account, agent)) return json(res, 200, { url: `/a/${agent.name}/` });
        await new Promise(done => setTimeout(done, 200));
      }
      return json(res, 503, { error: "Your Payables workspace is reserved but is still starting. Continue again to reopen the same setup." });
    }

    // A DAO's recent signing proposals, for a viewer who may see one of the agents it owns.
    if (pathname === "/gw/proposals") {
      const me = await viewer(req);
      if (!me) return json(res, 401, { error: "Sign in first", access: "session" });
      const dao = url.searchParams.get("dao") ?? "";
      const owned = fleet.filter((a) => a.owner === dao && me.access[a.name]);
      if (!owned.length) return json(res, 403, { error: `No agent here you may see is owned by ${dao || "that account"}`, access: "procedure" });
      if (!(await ownerOf(dao)).policy) return json(res, 400, { error: `${dao} is not a DAO` });
      return json(res, 200, await recentSignProposals(dao, owned));
    }

    // Intervention history, including old operator records, for agents this viewer may execute or manage.
    if (pathname === "/gw/interventions") {
      const me = await viewer(req);
      const operated = new Set(Object.entries(me?.access ?? {}).filter(([, a]) => a.canExecute || a.canManage).map(([agent]) => agent));
      if (!operated.size) return json(res, me ? 403 : 401, { error: "Execution or management permission required", access: me ? "procedure" : "session" });
      const { calls, corrupt } = interventions(url.searchParams.get("since") ?? "");
      // An unreadable line can't be attributed to an agent, so every eligible viewer is told it exists.
      return json(res, 200, { calls: calls.filter((c) => operated.has(c.agent)), corrupt });
    }
    // Every gateway path is listed above; anything else under /gw/ is no page either.
    if (pathname.startsWith("/gw/")) return json(res, 404, { error: "Not found" });

    const intake = pathname.match(/^\/requests\/(pay-[0-9a-f]{24})(\/.*)?$/);
    if (intake) {
      const agent = reserved.get(intake[1]!);
      if (!agent) return json(res, 404, { error: "No such invoice page" });
      if (!intake[2]) { res.writeHead(302, { location: `${pathname}/` }); return res.end(); }
      const path = intake[2];
      if (path !== "/" && path !== "/invoice-browser.js" && !path.startsWith("/api/")) return json(res, 404, { error: "Not found" });
      const upstream = request({ host: "127.0.0.1", port: agent.port, path: `/intake${path}${url.search}`, method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${agent.port}` } }, answer => {
        res.writeHead(answer.statusCode ?? 502, answer.headers); answer.pipe(res);
      });
      upstream.on("error", () => json(res, 503, { error: "This invoice page is unavailable. Ask the owner to finish setup." }));
      req.pipe(upstream); return;
    }

    const call = pathname.match(/^\/a\/([a-z0-9-]+)\/rpc\/(.+)$/);
    if (call) {
      const agent = fleet.find((a) => a.name === call[1]);
      if (!agent) return json(res, 404, { error: "No such agent" });
      const account = session.account(req);
      if (!account) return json(res, 401, { error: "Sign in first", access: "session" });
      const access = await resolveAgentAccess(account, agent);
      if (!access) return json(res, 403, { error: `${account} may not see the ${agent.name} agent`, access: "agent" });
      if (!mayCall(access, call[2]!)) return json(res, 403, { error: "This account does not have permission for this action", access: "procedure" });
      // Preserve which calls count as interventions: recorded before they run, or not run.
      if (isIntervention(call[2]!)) {
        try {
          mkdirSync(".evidence", { recursive: true });
          appendSynced(INTERVENTIONS, { at: new Date().toISOString(), account, agent: agent.name, path: call[2] });
        } catch {
          return json(res, 503, { error: "The action could not be recorded, so it was not run" });
        }
      }
      return forward(req, res, agent, call[2]!, account);
    }

    return serveStatic(res, DIST, pathname.replace(/^\/a\/[a-z0-9-]+/, "") || "/");
  } catch (error) {
    sendFailure(res, error);
  }
}).listen(PORT, () => console.log(`Dashboard for ${config.agents.map((a) => `${a.name} (${a.owner})`).join(", ")} on port ${PORT}, signing in to ${HOST}`));

const children = new Set<ChildProcess>();

/**
 * Runs an agent server on loopback, restarting it if it exits: soon after a crash, then backing off
 * up to 5 minutes while it keeps failing to start (such as when another server holds its agent).
 */
function start(agent: AgentEntry & { envFile: string }, delay = 5_000) {
  const started = Date.now();
  const child = spawn(join(APP, "node_modules/.bin/tsx"), [...(reserved.has(agent.name) ? [] : ["--env-file-if-exists=.env"]), join(APP, "src/server.ts")], {
    cwd: reserved.get(agent.name)?.directory,
    env: reserved.has(agent.name) ? { ...provisioningEnv(reserved.get(agent.name)!),
      INVOICES_PUBLIC_HOST: HOST, INVOICES_BASE_PATH: `/requests/${agent.name}`, INVOICES_SECURE: "true",
      ...(config.portal === "invoices" && { INVOICES_OWNER_URL: `https://${HOST}/owners` }),
      INVOICES_COOKIE: `invoices_${agent.name}`, INVOICES_SESSION_SECRET: createHmac("sha256", SECRET).update(`invoice:${agent.name}`).digest("hex"),
    } : childEnv(agent),
    stdio: ["ignore", "inherit", "inherit"],
  });
  children.add(child);
  child.on("exit", (code) => {
    children.delete(child);
    const next = Date.now() - started < 60_000 ? Math.min(delay * 2, 300_000) : 5_000;
    console.error(`Agent server ${agent.name} exited (${code}); restarting in ${next / 1000} s`);
    setTimeout(() => start(agent, next), next);
  });
}
for (const agent of fleet) if (agent.envFile) start({ ...agent, envFile: agent.envFile });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    for (const child of children) child.removeAllListeners("exit").kill(signal);
    process.exit(0);
  });
