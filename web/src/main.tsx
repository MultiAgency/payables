import { canSetupPayables } from "./app/gateway-contract";
import { clearAgentCapabilities, gatewayQueries, redactProposalCaches } from "./app/queries";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { StrictMode, Suspense, lazy, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { PublicHome } from "./public";
import { ErrorBox, Button, Loading } from "./shared/ui";
import { loadGateway, ownersOf } from "./app/session";
import { scopeOfKey, scopeQueries } from "./shared/queries";
import { confirmSession, sessionUnconfirmed, subscribeSession, watchSession } from "./shared/session-check";
import { BASE } from "./shared/client";
import { deniedAt, onAccessDenial, recheckAccess, useAccessState } from "./shared/access";
import "./styles.css";

const AuthenticatedApp = lazy(() => import("./app/authenticated-app").then(module => ({ default: module.AuthenticatedApp })));

// Follow the system theme.
const dark = matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => document.documentElement.classList.toggle("dark", dark.matches);
applyTheme();
dark.addEventListener("change", applyTheme);

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });
onAccessDenial(denial => {
  if (denial.scope === "procedure") clearAgentCapabilities(queryClient, denial.base);
  else {
    redactProposalCaches(queryClient);
    const affected = (query: { queryKey: readonly unknown[] }) => {
      const scope = scopeOfKey(query.queryKey);
      if (!scope) return false;
      return denial.scope === "session" || scope.base === denial.base;
    };
    // Discard late reads as well as cached observations; unrelated agents keep their records.
    void queryClient.cancelQueries({ predicate: affected }).then(() => queryClient.removeQueries({ predicate: affected }));
  }
  void queryClient.invalidateQueries({ queryKey: gatewayQueries.session.queryKey, exact: true });
});

// Agent reads are keyed by the signed-in account. When another account signs in on this host (for
// example in another tab), every earlier account's agent records and proposal lists leave memory.
queryClient.getQueryCache().subscribe(event => {
  if (event.type !== "updated" || event.action.type !== "success" || event.query.queryHash !== JSON.stringify(gatewayQueries.session.queryKey)) return;
  const account = (event.query.state.data as Awaited<ReturnType<typeof loadGateway>> | undefined)?.viewer?.account ?? null;
  // Rescope before confirming, so the first render with restored controls reads the new account's records.
  const rescoped = scopeQueries(account);
  confirmSession();
  if (!rescoped) return;
  const earlier = (query: { queryKey: readonly unknown[] }) => {
    const scope = scopeOfKey(query.queryKey);
    return scope ? scope.account !== (account ?? "") : query.queryKey[0] === "gw";
  };
  void queryClient.cancelQueries({ predicate: earlier }).then(() => queryClient.removeQueries({ predicate: earlier }));
});
watchSession(() => void queryClient.invalidateQueries({ queryKey: gatewayQueries.session.queryKey, exact: true }));
const NO_ACCESS = { canSign: false, canPropose: false, canVote: false, canExecute: false, canManage: false };

/**
 * Served by a local agent server, this is that agent's dashboard. Behind the hosted gateway, a
 * visitor sees the public examples and sign-in. Signed-in pages share a workspace frame;
 * `/a/<agent>/` retains that agent's client, cache and permissions.
 */
function GatewayPage({ activity }: { activity: boolean }) {
  const access = useAccessState();
  const query = useQuery(gatewayQueries.session);
  const unconfirmed = useSyncExternalStore(subscribeSession, sessionUnconfirmed);
  if (query.isPending) return <main className="mx-auto max-w-xl p-8"><Loading label="Loading dashboard…" /></main>;
  if (query.isError && query.data === undefined) return <main className="mx-auto flex max-w-xl flex-col items-start gap-4 p-8">
    <h1 className="text-xl font-semibold">Dashboard unavailable</h1>
    <ErrorBox error={`The dashboard can't load right now: ${query.error.message}`} />
    <Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}>{query.isFetching ? "Retrying…" : "Retry"}</Button>
  </main>;
  const gateway = query.data;
  const denied = deniedAt(access, BASE);
  const missing = gateway?.viewer && BASE && !gateway.viewer.access[BASE.slice("/a/".length)];
  if (gateway?.viewer && (denied || missing)) return <main className="mx-auto flex max-w-xl flex-col items-start gap-4 p-8">
    <h1 className="text-xl font-semibold">Access unavailable</h1>
    <p role="alert">{denied?.message ?? "This account may no longer access this agent."} Private records are hidden.</p>
    <Button variant="outline" onClick={recheckAccess}>Check access again</Button>
    <a href="/" className="underline">Return to Home</a>
  </main>;
  const hiddenAgents = gateway?.viewer && gateway.agents.some(agent => deniedAt(access, `/a/${agent.name}`));
  const visibleGateway = gateway?.viewer ? { ...gateway,
    agents: gateway.agents.filter(agent => !deniedAt(access, `/a/${agent.name}`)),
    // Until the gateway confirms who is signed in, the previous account's permissions enable nothing.
    viewer: { ...gateway.viewer, access: Object.fromEntries(Object.entries(gateway.viewer.access)
      .filter(([name]) => !deniedAt(access, `/a/${name}`)).map(([name, rights]) => [name, unconfirmed ? NO_ACCESS : rights])) },
  } : gateway;
  const content = gateway && !gateway.viewer ? (
    <PublicHome daos={ownersOf(gateway.agents)} invoices={gateway.invoices} selfService={canSetupPayables(gateway)} />
  ) : (
    <AuthenticatedApp gateway={visibleGateway} activity={activity} />
  );
  return <>
    {query.error && <div role="alert" className="flex flex-wrap items-center gap-3 border-b p-4 text-sm">
      <p>Workspace permissions could not be refreshed. Denied actions wait for refreshed permissions. Records for denied agents remain hidden.</p>
      <Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}>Retry permissions</Button>
    </div>}
    {unconfirmed && gateway?.viewer && !query.error && <div role="status" className="border-b p-4 text-sm">Checking which account is signed in. Actions are unavailable until it is confirmed.</div>}
    {hiddenAgents && !query.error && <div role="status" className="flex flex-wrap items-center gap-3 border-b p-4 text-sm">
      <p>Access to an agent changed. Its private records are hidden while permissions refresh.</p>
      <Button variant="outline" onClick={recheckAccess}>Check access again</Button>
    </div>}
    {content}
  </>;
}

const subscribeHash = (notify: () => void) => {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
};
function App() {
  const hash = useSyncExternalStore(subscribeHash, () => location.hash);
  return <GatewayPage activity={hash === "#activity"} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><QueryClientProvider client={queryClient}><Suspense fallback={<main className="p-8"><Loading label="Loading page…" /></main>}><App /></Suspense></QueryClientProvider></StrictMode>,
);
