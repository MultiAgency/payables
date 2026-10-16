import { BadRequest } from "../http.js";

/** Explicit aliases affect sign-in only; canonical supplier and bridge URLs stay unchanged. */
export function signingHost(primary: string, aliases = "") {
  const hosts = aliases.split(",").map(host => host.trim()).filter(Boolean);
  for (const host of hosts) {
    const url = URL.parse(`https://${host}`);
    if (!url || url.host !== host || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
      throw new Error("DASHBOARD_SIGNIN_HOSTS must contain comma-separated lowercase hostnames, optionally with ports");
  }
  const allowed = new Set([primary, ...hosts]);
  return (requestHost: string | undefined): string => {
    // Preserve the existing configured-host behavior until aliases are explicitly enabled.
    if (!hosts.length) return primary;
    if (!requestHost || !allowed.has(requestHost)) throw new BadRequest("Sign-in is not configured for this host.");
    return requestHost;
  };
}
