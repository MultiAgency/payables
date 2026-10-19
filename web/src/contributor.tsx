import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { NearConnector } from "@fastnear/near-connect";
import { ArrowLeftIcon, ArrowUpRightIcon, FileTextIcon, PlusIcon } from "@phosphor-icons/react";
import { z } from "zod";
import { compensationView, reportCommand, requestRecord, type CompensationReport, type CompensationRequest } from "@multiagency/sdk";
import { Button } from "./components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./components/ui/card";
import { NativeSelect, NativeSelectOption } from "./components/ui/native-select";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Empty, EmptyTitle, EmptyDescription } from "./components/ui/empty";
import { Badge } from "./components/ui/badge";
import { Skeleton } from "./components/ui/skeleton";
import { Labeled, ReportBody, ReportFields, RequestBadge, units, usdc, newIdentity, shownAmount } from "./features/payables/compensation-ui";
import { MULTIAGENCY_ICON } from "./shared/brand";
import "./styles.css";

const base = location.pathname.match(/^\/requests\/pay-[0-9a-f]{24}/)?.[0] ?? "";
const connector = new NearConnector({ network: "mainnet", features: { signMessage: true }, manifest: "https://cdn.jsdelivr.net/gh/fastnear/near-connect@d277b41263a8ea0a6892236b22824d46c2c3c377/repository/manifest.json" });
const payment = z.object({ requestId: z.string(), id: z.string(), status: z.string() });
const viewSchema = compensationView.extend({ account: z.string(), history: z.array(z.object({ sequence: z.number(), actor: z.string(), record: z.unknown() })), payments: z.array(payment) });
type View = z.infer<typeof viewSchema>;
type Draft = { id: string; expectedVersion: number; amount: string; report: CompensationReport; attempt?: { commandId: string; fingerprint: string } };
const draftSchema = z.object({ id: z.uuid(), expectedVersion: z.number().int().nonnegative(), amount: z.string(), attempt: z.object({ commandId: z.uuid(), fingerprint: z.string() }).optional(), report: z.object({ agreementId: z.string(), amount: z.string().optional(), start: z.string(), end: z.string(), contributions: z.string(), assessment: z.string(), evidence: z.array(z.string()) }) });
async function api(path: string, body?: unknown) {
  const response = await fetch(`${base}/api/${path}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json" }, ...(body !== undefined && { body: JSON.stringify(body) }) });
  const value = await response.json();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) window.dispatchEvent(new Event("contributor-session-expired"));
    throw new Error(value.error ?? "Request unavailable. Refresh before retrying.");
  }
  return value;
}

function Contributor() {
  const [account, setAccount] = useState<string | null>(null), [ready, setReady] = useState(false);
  const [view, setView] = useState<View>(), [draft, setDraft] = useState<Draft>(), [selected, setSelected] = useState<string>();
  const [composing, setComposing] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const epoch = useRef(0);
  const scope = `${location.origin}${base}:${account}`;
  async function refresh(who = account) {
    if (!who) return;
    const generation = epoch.current;
    const next = viewSchema.parse(await api("compensation"));
    if (generation === epoch.current) {
      if (next.account !== who) { epoch.current++; setView(undefined); setDraft(undefined); setSelected(undefined); setAccount(next.account); }
      else setView(next);
    }
  }
  useEffect(() => {
    let active = true;
    api("compensation/session").then(s => { if (active) { setAccount(s.account); setReady(true); } }).catch(e => { if (active) { setError(String(e.message)); setReady(true); } });
    const expire = () => { epoch.current++; setAccount(null); setView(undefined); setDraft(undefined); setSelected(undefined); };
    window.addEventListener("contributor-session-expired", expire);
    return () => { active = false; expire(); window.removeEventListener("contributor-session-expired", expire); };
  }, []);
  useEffect(() => {
    epoch.current++; setView(undefined); setDraft(undefined); setSelected(undefined); setComposing(true);
    if (!account) return;
    try { const saved = draftSchema.safeParse(JSON.parse(localStorage.getItem(`report:${scope}`) ?? "null")); if (saved.success) setDraft(saved.data); } catch { setNotice("Your saved draft could not be read. Check existing requests before starting another."); }
    refresh().catch(e => setError(e.message));
  }, [account]);
  useEffect(() => { if (account && draft) { try { localStorage.setItem(`report:${scope}`, JSON.stringify(draft)); } catch { setNotice("Draft storage unavailable. Keep this page open until your request is saved."); } } }, [draft, account]);
  async function run(work: () => Promise<void>) { setBusy(true); setError(""); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Request unavailable."); } finally { setBusy(false); } }
  const agreement = view?.agreements.find(a => a.id === draft?.report.agreementId);
  const current = view?.requests.find(r => r.id === selected);
  function newRequest() {
    const a = view?.agreements[0]; if (!a) return;
    setComposing(true); setSelected(undefined); setDraft({ id: newIdentity(), expectedVersion: 0, amount: "", report: { agreementId: a.id, start: a.terms.start, end: a.terms.end, contributions: "", assessment: "", evidence: [] } });
  }
  async function save(submit: boolean) {
    if (!draft || !account) return;
    const generation = epoch.current;
    const input = { id: draft.id, expectedVersion: draft.expectedVersion, report: { ...draft.report, ...(draft.report.amount !== undefined && { amount: units(draft.amount) }), evidence: draft.report.evidence.map(s => s.trim()).filter(Boolean) }, submit };
    const fingerprint = JSON.stringify(input);
    const attempt = draft.attempt?.fingerprint === fingerprint ? draft.attempt : { commandId: newIdentity(), fingerprint };
    const command = reportCommand.parse({ ...input, commandId: attempt.commandId });
    const retained = { ...draft, attempt };
    setDraft(retained);
    try { localStorage.setItem(`report:${scope}`, JSON.stringify(retained)); } catch { setNotice("Retry identity could not be saved locally. Read the existing request after any lost response."); }
    const result = requestRecord.parse(await api("compensation", command));
    if (generation !== epoch.current) return;
    setDraft(undefined); localStorage.removeItem(`report:${scope}`); setSelected(result.id);
    setNotice(submit ? "Submitted for compensation review. Nothing has been sent for payment." : "Draft saved. It has not been submitted for review.");
    await refresh();
  }
  return <div className="min-h-screen bg-background text-foreground">
    <header className="border-b"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-10">
      <a href={`${base}/`} className="flex items-center gap-3 font-semibold"><span className="size-7" dangerouslySetInnerHTML={{ __html: MULTIAGENCY_ICON }} />MultiAgency <span className="font-normal text-muted-foreground">/ Invoices</span></a>
      {account && <div className="flex min-w-0 items-center gap-3"><span className="break-all text-xs text-muted-foreground">{account}</span><Button variant="ghost" disabled={busy} onClick={() => run(async () => { epoch.current++; setAccount(null); setView(undefined); setDraft(undefined); await api("signout", {}); await connector.disconnect(); })}>Sign out</Button></div>}
    </div></header>
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10 sm:px-10 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-5"><div className="max-w-2xl"><h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Report. Review. Receive.</h1><p className="mt-4 max-w-prose text-base leading-7 text-muted-foreground">Report your work and its impact. Follow the review, approved compensation and payment in one place.</p></div>{account && view && !draft && <Button disabled={busy || !view.agreements.length} onClick={newRequest}><PlusIcon data-icon="inline-start" />New report</Button>}{account && draft && !composing && <Button disabled={busy} onClick={() => { setSelected(undefined); setComposing(true); }}>Resume draft</Button>}</div>
      {error && <Alert variant="destructive"><AlertDescription>{error}<Button variant="outline" disabled={busy} onClick={() => run(async () => { if (account) await refresh(); else { const s = await api("compensation/session"); setAccount(s.account); } })}>Refresh records</Button></AlertDescription></Alert>}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      {!ready ? <Skeleton className="h-48 w-full" /> : !account ? <Card className="max-w-xl"><CardHeader><CardTitle>Sign in as the contributor</CardTitle><CardDescription>Use the NEAR account named in your agreement. Signing in sends no payment.</CardDescription></CardHeader><CardFooter><Button disabled={busy} onClick={() => run(async () => {
        const challenge = await api("signin/challenge", {}); await connector.connect(); const { wallet } = await connector.getConnectedWallet();
        const signed = await wallet.signMessage({ message: challenge.message, recipient: challenge.recipient, nonce: Uint8Array.from(atob(challenge.nonce), c => c.charCodeAt(0)) });
        const session = await api("compensation/signin", { accountId: signed.accountId, publicKey: signed.publicKey, signature: signed.signature, nonce: challenge.nonce, callbackUrls: [...new Set([location.origin + location.pathname, location.href.split("#")[0], location.origin + "/"])] }); setAccount(session.account);
      })}>{busy ? "Connecting…" : "Connect wallet"}<ArrowUpRightIcon data-icon="inline-end" /></Button></CardFooter></Card> : !view ? <Skeleton className="h-64 w-full" /> : draft && composing ? <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card><CardHeader><CardTitle>Report your work</CardTitle><CardDescription>The owner reviews your evidence and sets compensation under your signed terms.</CardDescription></CardHeader><CardContent><form id="request-form" onSubmit={e => { e.preventDefault(); void run(() => save(true)); }}><div className="mb-7 flex flex-col gap-5"><Labeled id="submission-type" label="Submission type"><NativeSelect id="submission-type" value={draft.report.amount === undefined ? "report" : "invoice"} disabled={busy || draft.expectedVersion > 0} onChange={e => { const { amount: _amount, ...report } = draft.report; setDraft({ ...draft, report: { ...report, ...(e.target.value === "invoice" && { amount: "" }) } }); }}><NativeSelectOption value="report">Work report</NativeSelectOption><NativeSelectOption value="invoice">Invoice for an agreed amount</NativeSelectOption></NativeSelect></Labeled><Labeled id="agreement" label="Work agreement"><NativeSelect id="agreement" value={draft.report.agreementId} disabled={busy || draft.expectedVersion > 0} onChange={e => { const a = view.agreements.find(a => a.id === e.target.value)!; setDraft({ ...draft, report: { ...draft.report, agreementId: a.id, start: a.terms.start, end: a.terms.end } }); }}>{view.agreements.map(a => <NativeSelectOption key={a.id} value={a.id}>{a.terms.title}</NativeSelectOption>)}</NativeSelect></Labeled></div>
          <ReportFields report={draft.report} amount={draft.amount} onAmount={amount => setDraft({ ...draft, amount })} onChange={report => setDraft({ ...draft, report })} disabled={busy} />
        </form></CardContent><CardFooter className="flex-wrap justify-between gap-3"><Button variant="ghost" disabled={busy} onClick={() => { setComposing(false); setSelected(undefined); }}>Back to requests</Button><div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={() => run(() => save(false))}>Save draft</Button><Button type="submit" form="request-form" disabled={busy}>{busy ? "Saving…" : draft.expectedVersion > 0 ? "Resubmit" : "Submit"}</Button></div></CardFooter></Card>
        <aside className="order-first flex flex-col gap-5 lg:order-last lg:sticky lg:top-8"><h2 className="text-lg font-semibold">Agreed boundaries</h2>{agreement && <><p className="break-words text-sm">{agreement.terms.title}</p><dl className="flex flex-col gap-4 text-sm"><div><dt className="text-muted-foreground">Remaining ceiling</dt><dd className="mt-1 text-3xl font-semibold tabular-nums">{usdc(agreement.remaining)} <span className="text-sm font-normal">USDC</span></dd></div><div><dt className="text-muted-foreground">Previously approved</dt><dd>{usdc(agreement.approved)} USDC</dd></div><div><dt className="text-muted-foreground">Work period</dt><dd>{agreement.terms.start} – {agreement.terms.end}</dd></div></dl><a className="text-sm underline" href={agreement.terms.document} rel="noreferrer" target="_blank">Signed agreement reference</a>{draft.report.amount !== undefined && units(draft.amount) && BigInt(units(draft.amount)) > BigInt(agreement.remaining) && <Alert><AlertDescription>Your request exceeds the remaining ceiling. It can be reviewed, but cannot be approved under these terms.</AlertDescription></Alert>}</>}<p className="border-t pt-4 text-sm leading-6 text-muted-foreground">The ceiling is a maximum, not guaranteed compensation. Review approval and payment completion are separate.</p></aside>
      </div> : current ? <div className="flex max-w-3xl flex-col gap-6"><Button variant="ghost" className="self-start" onClick={() => setSelected(undefined)}><ArrowLeftIcon data-icon="inline-start" />All requests</Button><div className="flex flex-wrap items-baseline justify-between gap-4"><h2 className="text-3xl font-semibold tabular-nums">{shownAmount(current) ? `${usdc(shownAmount(current)!)} USDC` : "Compensation in review"}</h2><span className="text-xs text-muted-foreground">Revision {current.version}</span></div><ReportBody request={current} />
        {["draft", "changes_requested"].includes(current.state) && <Button className="self-start" disabled={!!draft} onClick={() => { setComposing(true); setDraft({ id: current.id, expectedVersion: current.version, amount: current.report.amount ? usdc(current.report.amount).replaceAll(",", "") : "", report: current.report }); setSelected(undefined); }}>Revise</Button>}
        <PaymentNotice request={current} view={view} /><details><summary className="flex min-h-11 cursor-pointer items-center text-sm">Submission history</summary><div className="flex flex-col gap-4 py-4">{view.history.filter(h => (h.record as { id?: string }).id === current.id).map(h => <div key={h.sequence} className="border-t pt-3"><ReportBody request={requestRecord.parse(h.record)} /></div>)}</div></details>
      </div> : <div className="flex flex-col gap-3"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Your requests</h2><Button variant="ghost" disabled={busy} onClick={() => run(() => refresh())}>Refresh</Button></div>{!view.requests.length ? <Empty><FileTextIcon size={28} /><EmptyTitle>{view.agreements.length ? "Ready when your work is." : "An agreement comes first."}</EmptyTitle><EmptyDescription>{view.agreements.length ? "Submit your work report. The owner determines compensation under your signed terms." : "Ask the owner to record your signed agreement for this NEAR account."}</EmptyDescription></Empty> : view.requests.map(r => <button key={r.id} className="flex min-h-24 flex-wrap items-center justify-between gap-4 border-b px-1 py-5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" onClick={() => { setSelected(r.id); setNotice(""); }}><span className="flex min-w-0 flex-col gap-2"><span className="font-medium">{view.agreements.find(a => a.id === r.report.agreementId)?.terms.title ?? "Work agreement"}</span><span className="text-sm text-muted-foreground">{r.report.start} – {r.report.end}</span></span><span className="flex flex-wrap items-center gap-5"><RequestBadge state={r.state} /><span className="tabular-nums font-semibold">{shownAmount(r) ? `${usdc(shownAmount(r)!)} USDC` : "Amount after review"}</span><ArrowUpRightIcon aria-hidden /></span></button>)}</div>}
      <footer className="flex flex-wrap justify-between gap-3 border-t pt-6 text-xs text-muted-foreground"><span>Evidence first. Approval before payment.</span><a className="underline" href="https://payables.multiagency.ai/skill.md">For your coding agent</a></footer>
    </main>
  </div>;
}
function PaymentNotice({ request, view }: { request: CompensationRequest; view: View }) {
  const id = request.payment?.id;
  if (!id) return <p className="border-t pt-5 text-sm text-muted-foreground">{request.state === "approved" ? "Compensation approved. Payment has not been prepared." : "Nothing submitted for payment."}</p>;
  const recorded = view.payments.find(p => p.requestId === request.id);
  return <Alert><AlertDescription>{request.payment?.mode === "isolated" ? `Payment status: ${recorded?.status.replaceAll("_", " ") ?? "preparation incomplete"}.` : `Payment status: ${recorded?.status.replaceAll("_", " ") ?? "unavailable"}.`}<a href={`${base}/`} className="underline">Your payouts</a><span className="text-xs">Approval does not establish settlement. Unknown outcomes need reconciliation; do not submit a replacement request.</span></AlertDescription></Alert>;
}
const dark = matchMedia("(prefers-color-scheme: dark)");
document.documentElement.classList.toggle("dark", dark.matches);
dark.addEventListener("change", e => document.documentElement.classList.toggle("dark", e.matches));
createRoot(document.getElementById("root")!).render(<StrictMode><Contributor /></StrictMode>);
