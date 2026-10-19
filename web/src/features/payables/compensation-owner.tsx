import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRightIcon, CheckIcon, FileTextIcon } from "@phosphor-icons/react";
import { client, BASE, failureKind } from "../../shared/client";
import { queries } from "../../shared/queries";
import { useCanCall } from "../../app/viewer";
import { useAgent } from "../../app/agent-context";
import { reviewedPolicyOf } from "../policy/policy-review";
import { PaymentReview, type PaymentReviewData } from "./payout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { FieldGroup } from "../../components/ui/field";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Empty, EmptyTitle, EmptyDescription } from "../../components/ui/empty";
import { Skeleton } from "../../components/ui/skeleton";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "../../components/ui/alert-dialog";
import { Labeled, ReportBody, RequestBadge, usdc, units, newIdentity, shownAmount } from "./compensation-ui";
import { approvedCompensation, agreementCommand, type CompensationRequest, type CompensationTerms } from "@multiagency/sdk";
import { WorkOrderPayment } from "./work-orders";
import { REPORT_STEPS, reportStep, sharedPayoutSetup, type SetupItem } from "./shared-payout";
import { Link, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ASSETS } from "@multiagency/sdk";

export function CompensationReview() {
  const allowed = useCanCall("compensation/list");
  return allowed ? <ReviewQueue /> : null;
}
function ReviewQueue() {
  const query = useQuery(queries.compensation);
  const canReview = useCanCall("compensation/review"), canPrepare = useCanCall("compensation/prepare"), canSend = useCanCall("compensation/send");
  const { data, setup } = useAgent();
  const cache = useQueryClient();
  const [compensation, setCompensation] = useState("");
  // A deep link (`/?request=<id>`) opens that request.
  const linked = (useSearch({ strict: false }) as { request?: string }).request;
  const [selected, setSelected] = useState<string | undefined>(linked), [feedback, setFeedback] = useState("");
  useEffect(() => { if (linked) setSelected(linked); }, [linked]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [payment, setPayment] = useState<PaymentReviewData>();
  const [showAll, setShowAll] = useState(false);
  const [orderDeadline, setOrderDeadline] = useState("");
  const [confirmation, setConfirmation] = useState<{ title: string; description: string; action: string; run: () => Promise<unknown> }>();
  const operation = useRef<{ fingerprint: string; commandId: string } | undefined>(undefined);
  const requests = query.data?.requests.filter(r => r.state !== "draft") ?? [];
  const current = requests.find(r => r.id === selected);
  const amount = units(compensation);
  const agreement = query.data?.agreements.find(a => a.id === current?.report.agreementId);
  function commandId(value: unknown) { const fingerprint = JSON.stringify(value); if (operation.current?.fingerprint !== fingerprint) operation.current = { fingerprint, commandId: newIdentity() }; return operation.current.commandId; }
  async function run(work: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await work(); operation.current = undefined; await reread(); }
    catch (e) {
      const kind = failureKind(e);
      setError(e instanceof Error ? `${e.message}${kind === "refused" ? " Nothing was changed or sent." : ""}` : "Review unavailable. Refresh before retrying.");
      // A refusal may come from records that changed; an unknown outcome may have taken effect. Show the current records, never repeat the action.
      if (kind === "refused" || kind === "unknown") await reread().catch(() => undefined);
    }
    finally { setBusy(false); }
  }
  async function reread() { await query.refetch({ throwOnError: true }); await cache.invalidateQueries({ queryKey: queries.orpc.workOrders.key() }); }
  async function decide(r: CompensationRequest, decision: "approved" | "changes_requested" | "declined") {
    const input = { id: r.id, expectedVersion: r.version, decision, feedback, ...(decision === "approved" && { approvedAmount: amount }) };
    await client.compensation.review({ ...input, commandId: commandId(input) });
  }
  const paymentRecord = query.data?.payments.find(p => p.requestId === current?.id);
  const setupFor = (payees: string[], amount?: string) => sharedPayoutSetup({ executor: setup.executor !== false, grant: setup.grant ?? null, policy: data.policy.policy, book: data.book, payees, amount, now: Date.now() });
  const sharedSetup = setupFor([...new Set(query.data?.agreements.map(a => a.terms.payee) ?? [])]);
  const currentSetup = current && setupFor([current.payee], current.state === "approved" && !current.payment ? approvedCompensation(current) : undefined);
  const sharedReady = currentSetup?.every(item => item.ready) ?? false;
  return <section className="flex min-w-0 flex-col gap-5" aria-labelledby="compensation-heading">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="compensation-heading" className="text-2xl font-semibold tracking-tight">Reports & payment requests</h2><p className="mt-2 text-sm text-muted-foreground">Review the work and compensation before preparing a payout.</p>{query.data && <p role="status" className="mt-2 text-sm font-medium">Awaiting your review: {query.data.requests.filter(r => r.state === "submitted").length}</p>}</div><Button variant="outline" disabled={busy || query.isFetching} onClick={() => run(async () => { await query.refetch({ throwOnError: true }); })}>Refresh requests</Button></div>
    {(error || query.error) && <Alert variant="destructive"><AlertDescription>{error || query.error?.message} Decisions wait for current records.</AlertDescription></Alert>}
    {query.data && linked && !query.data.requests.some(r => r.id === linked) && <p role="status" className="text-sm">This link names a request that isn't recorded for this agent. Nothing is selected.</p>}
    {query.data && <SharedSetup items={sharedSetup} />}
    {query.isPending ? <Skeleton className="h-32 w-full" /> : query.isError ? null : <div className="grid items-start gap-6 xl:grid-cols-[17rem_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-2"><Button variant="ghost" onClick={() => setShowAll(v => !v)}>{showAll ? "Show needs review" : "Show all requests"}</Button>{requests.filter(r => showAll || r.state === "submitted" || r.state === "changes_requested" || r.state === "approved").map(r => <button key={r.id} aria-pressed={selected === r.id} className="flex min-h-28 min-w-0 flex-col items-start gap-3 border p-4 text-left hover:bg-muted aria-pressed:bg-muted focus-visible:outline-2 focus-visible:outline-ring" onClick={() => { setSelected(r.id); setCompensation(r.report.amount ? usdc(r.report.amount).replaceAll(",", "") : ""); setFeedback(""); setOrderDeadline(""); setError(""); }}><span className="break-all text-sm font-medium">{r.payee}</span><span className="text-xl font-semibold tabular-nums">{shownAmount(r) ? `${usdc(shownAmount(r)!)} USDC` : "Report"}</span><RequestBadge state={r.state} /></button>)}{!requests.length && <p className="py-5 text-sm text-muted-foreground">No submitted requests.</p>}</div>
      {current ? <Card><CardHeader><CardTitle>{current.payee}</CardTitle><CardDescription>{agreement?.terms.title ?? "Agreement unavailable"} · Revision {current.version}</CardDescription></CardHeader><CardContent className="flex flex-col gap-7"><div className="flex flex-wrap items-end justify-between gap-5 border-b pb-6"><div><p className="mb-2 text-sm text-muted-foreground">{current.state === "approved" ? "Approved compensation" : current.report.amount ? "Invoice amount" : "Work report"}</p><p className="text-4xl font-semibold tracking-tight tabular-nums">{shownAmount(current) ? `${usdc(shownAmount(current)!)} USDC` : "For review"}</p></div>{agreement && <div className="text-sm"><p className="text-muted-foreground">Remaining agreement ceiling</p><p className="mt-2 font-semibold tabular-nums">{usdc(agreement.remaining)} USDC</p><a href={agreement.terms.document} rel="noreferrer" target="_blank" className="mt-2 inline-flex min-h-11 items-center gap-2 underline">Signed document<ArrowUpRightIcon aria-hidden /></a></div>}</div>
        {agreement && <dl className="grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">Agreement ceiling</dt><dd className="mt-1 font-medium tabular-nums">{usdc(agreement.terms.ceiling)} USDC</dd></div><div><dt className="text-muted-foreground">Approved compensation</dt><dd className="mt-1 font-medium tabular-nums">{usdc(agreement.approved)} USDC</dd></div><div><dt className="text-muted-foreground">Work period</dt><dd className="mt-1">{agreement.terms.start} – {agreement.terms.end}</dd></div></dl>}
        {current.state === "submitted" && agreement && amount && BigInt(amount) > BigInt(agreement.remaining) && <Alert><AlertDescription>Compensation exceeds the remaining ceiling by {usdc((BigInt(amount) - BigInt(agreement.remaining)).toString())} USDC. Choose a lower amount, or record amended signed terms in Agreements and ask the contributor to resubmit.</AlertDescription></Alert>}
        {current.state === "submitted" && agreement && agreement.version !== current.agreementVersion && <Alert><AlertDescription>The agreement changed after this report was submitted. Return the request and ask the contributor to resubmit against the current terms before approving.</AlertDescription></Alert>}
        <ReportBody request={current} />
        {current.payment?.mode === "isolated" && <p className="text-sm text-muted-foreground">Paid through an isolated order: its own agent, grant and funding.</p>}
        {current.payment?.mode === "shared" && paymentRecord?.status === "UNKNOWN" && <Alert variant="destructive"><AlertDescription>Outcome unknown: this shared payout may have been submitted. Shared payouts wait until it is reviewed. Nothing is sent again.</AlertDescription></Alert>}
        {current.payment?.mode === "shared" && <ReportSteps step={reportStep(current.state, current.payment, paymentRecord?.status)} payment={paymentRecord?.correlationId ?? undefined} />}
        {current.state === "submitted" && <Labeled id="approved-compensation" label="Compensation · USDC" description="Set compensation for the accepted work within the remaining signed ceiling."><Input id="approved-compensation" inputMode="decimal" value={compensation} disabled={busy} onChange={e => setCompensation(e.target.value)} /></Labeled>}
        {current.state === "submitted" && <Labeled id="owner-feedback" label="Review feedback" description="Explain the compensation decision or the changes needed. Required when setting compensation for a report, changing an invoice amount, or declining."><Textarea id="owner-feedback" rows={4} maxLength={2000} value={feedback} disabled={busy} onChange={e => setFeedback(e.target.value)} /></Labeled>}
        {current.state === "approved" && <Alert><AlertDescription>Compensation is approved and counted against the agreement ceiling. Payment preparation, owner approval and completion remain separate.{paymentRecord && <p>Payment: {paymentRecord.refused ?? paymentRecord.status}. <Link to="/follow/payment" search={paymentRecord.correlationId ? { payment: paymentRecord.correlationId } : { invoice: paymentRecord.invoiceId }} className="underline">Open this payment</Link></p>}{current.payment?.mode === "isolated" && <p>Open the retained work order below to authorize its agent and grant, fund it and follow payment. Order ID: {current.payment.id}.</p>}</AlertDescription></Alert>}
        {current.state === "approved" && current.payment?.mode === "isolated" && <WorkOrderPayment id={current.payment.id} disabled={!canPrepare || busy || !!query.error} onResume={() => run(() => { const input = { id: current.id, expectedVersion: current.version, mode: "isolated" as const, until: current.payment!.until! }; return client.compensation.prepare({ type: "prepare", command: { ...input, commandId: commandId(input) } }); })} />}
        {current.state === "approved" && !current.payment && <div className="flex flex-col gap-4 border-t pt-6 text-sm"><p className="font-medium">Isolated order (default)</p><p className="text-muted-foreground">A separate agent, grant and deposit for this report only.</p><Labeled id="order-deadline" label="Isolated order payment deadline (UTC)" description="Choose when new payment submission authority ends. This is separate from the period in which the work was performed."><Input id="order-deadline" type="datetime-local" value={orderDeadline} onChange={e => setOrderDeadline(e.target.value)} disabled={busy} /></Labeled><Button className="self-start" disabled={!canPrepare || busy || !!query.error || query.isFetching} onClick={() => {
          if (!orderDeadline || !Number.isFinite(Date.parse(`${orderDeadline}Z`))) { setError("Choose a payment deadline for this payout."); return; }
          const input = { id: current.id, expectedVersion: current.version, mode: "isolated" as const, until: new Date(`${orderDeadline}Z`).toISOString() };
          setConfirmation({ title: "Prepare this isolated payout?", description: `Record ${usdc(approvedCompensation(current))} USDC to ${current.payee}, authorized until ${input.until}. Next authorize its agent, fund it and submit the payout. Nothing is sent now.`, action: "Prepare payout", run: () => client.compensation.prepare({ type: "prepare", command: { ...input, commandId: commandId(input) } }) });
        }}>Prepare isolated order</Button></div>}
        {current.state === "approved" && !current.payment && <details className="text-sm"><summary className="min-h-11 cursor-pointer py-3 font-medium">Shared payout instead</summary><p className="mb-4 text-muted-foreground">Pays from the shared payout agent: no new agent, grant or deposit, and one approval per report. Tradeoff: if one send's reply is lost, every shared payout pauses until that payment is reviewed.</p>{currentSetup && !sharedReady && <Alert className="mb-4"><AlertDescription>The shared payout needs its one-time setup: {currentSetup.filter(item => !item.ready).map(item => item.detail).join(" ")}</AlertDescription></Alert>}<Button variant="outline" disabled={!canPrepare || busy || !!query.error || query.isFetching || !sharedReady} onClick={() => {
          const input = { id: current.id, expectedVersion: current.version, mode: "shared" as const };
          setConfirmation({ title: "Prepare this shared payout?", description: `Record ${usdc(approvedCompensation(current))} USDC to ${current.payee} from the shared payout agent. Next send it for your approval. Nothing is sent now.`, action: "Prepare shared payout", run: () => client.compensation.prepare({ type: "prepare", command: { ...input, commandId: commandId(input) } }) });
        }}>Prepare shared payout</Button></details>}
      </CardContent><CardFooter className="flex-wrap justify-end gap-3">
        {current.state === "submitted" && <><Button variant="ghost" disabled={!canReview || busy || query.isFetching || !!query.error || !feedback.trim()} onClick={() => run(() => decide(current, "declined"))}>Decline</Button><Button variant="outline" disabled={!canReview || busy || query.isFetching || !!query.error || !feedback.trim()} onClick={() => run(() => decide(current, "changes_requested"))}>Request changes</Button><Button disabled={!canReview || busy || query.isFetching || !!query.error || !agreement || agreement.version !== current.agreementVersion || !amount || BigInt(amount || "0") === 0n || BigInt(amount) > BigInt(agreement.remaining) || ((!current.report.amount || amount !== current.report.amount) && !feedback.trim())} onClick={() => setConfirmation({ title: "Approve compensation?", description: `Approve ${usdc(amount || "0")} USDC for ${current.payee}. This reserves the agreement allowance and sends no payment.`, action: "Approve compensation", run: () => decide(current, "approved") })}><CheckIcon data-icon="inline-start" />Approve</Button></>}
        {current.state === "approved" && current.payment?.mode === "shared" && paymentRecord?.status === "PREPARATION_INCOMPLETE" && <Button disabled={!canPrepare || busy || !!query.error} onClick={() => run(() => { const input = { id: current.id, expectedVersion: current.version, mode: "shared" as const }; return client.compensation.prepare({ type: "prepare", command: { ...input, commandId: commandId(input) } }); })}>Resume preparation</Button>}
        {current.payment?.mode === "shared" && paymentRecord?.status === "PREPARED" && <Button disabled={!canSend || busy || !!query.error || query.isFetching || !reviewedPolicyOf(data)} onClick={() => setPayment({ request: { recipient: current.payee, asset: ASSETS.USDC, amount: approvedCompensation(current), confidential: true }, expectedPolicy: reviewedPolicyOf(data), symbol: "USDC", decimals: 6, ownerApproval: data.policy.policy?.owner_approval })}>Review payment submission</Button>}
      </CardFooter></Card> : <Empty><FileTextIcon size={28} /><EmptyTitle>Evidence before execution.</EmptyTitle><EmptyDescription>Select a request to read the report, check the agreement and record your decision.</EmptyDescription></Empty>}
    </div>}
    {payment && current && <PaymentReview payment={payment} currentPolicy={reviewedPolicyOf(data)} permitted={canSend} onClose={() => setPayment(undefined)} onConfirm={request => run(() => client.compensation.send({ type: "send", id: current.id, expectedPolicy: request.expectedPolicy }))} />}
    <AlertDialog open={!!confirmation} onOpenChange={open => { if (!open) setConfirmation(undefined); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmation?.title}</AlertDialogTitle><AlertDialogDescription>{confirmation?.description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy || !!query.error || query.isFetching} onClick={() => { const snapshot = confirmation; setConfirmation(undefined); if (snapshot) void run(snapshot.run); }}>{confirmation?.action}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}

export function CompensationAgreements() {
  const allowed = useCanCall("compensation/list");
  return allowed ? <AgreementForm /> : null;
}
function AgreementForm() {
  const permitted = useCanCall("compensation/agreement");
  const query = useQuery(queries.compensation);
  const [editing, setEditing] = useState<string>(), [version, setVersion] = useState(0);
  const initial: CompensationTerms = { payee: "", title: "", document: "", signedOn: "", start: "", end: "", ceiling: "", openingApproved: "0", scope: "" };
  const [terms, setTerms] = useState(initial), [ceiling, setCeiling] = useState(""), [opening, setOpening] = useState("0");
  const identity = useRef(newIdentity());
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const stringField = (key: keyof CompensationTerms, label: string, type = "text") => <Labeled key={key} id={`terms-${key}`} label={label}><Input id={`terms-${key}`} type={type} required={key !== "scope"} disabled={busy || !!editing && ["payee", "start", "end"].includes(key)} value={terms[key]} onChange={e => setTerms({ ...terms, [key]: e.target.value })} /></Labeled>;
  return <section className="flex flex-col gap-5"><div><h2 className="text-2xl font-semibold tracking-tight">Period agreements</h2><p className="mt-2 text-sm text-muted-foreground">Record the signed document and the ceiling you agreed. Policy inclusion remains a separate owner action.</p></div>
    {query.error && <Alert variant="destructive"><AlertDescription>{query.error.message}<Button variant="outline" onClick={() => query.refetch()}>Refresh agreements</Button></AlertDescription></Alert>}
    {query.data?.agreements.map(a => <div key={a.id} className="flex flex-wrap items-center justify-between gap-4 border-b py-5"><div><h3 className="font-semibold">{a.terms.title}</h3><p className="mt-1 break-all text-sm text-muted-foreground">{a.terms.payee} · {a.terms.start} – {a.terms.end}</p></div><div className="flex flex-wrap items-center gap-5"><span className="text-sm tabular-nums">{usdc(a.remaining)} of {usdc(a.terms.ceiling)} USDC remaining</span><Button variant="outline" disabled={!permitted || busy || !!query.error} onClick={() => { setEditing(a.id); setVersion(a.version); setTerms(a.terms); setCeiling(usdc(a.terms.ceiling).replaceAll(",", "")); setOpening(usdc(a.terms.openingApproved).replaceAll(",", "")); identity.current = newIdentity(); }}>Record amended terms</Button></div></div>)}
    {permitted && <details open={!!editing}><summary className="flex min-h-11 cursor-pointer items-center font-medium">{editing ? "Amend the recorded agreement" : "Record a signed agreement"}</summary><Card className="mt-3"><CardHeader><CardTitle>Manual agreement entry</CardTitle><CardDescription>The signed document stays in your filing system. You are recording its terms and signature date, not asking the service to verify it.</CardDescription></CardHeader><CardContent><form id="period-agreement" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      try {
        const command = agreementCommand.parse({ commandId: identity.current, id: editing ?? identity.current, expectedVersion: version, terms: { ...terms, ceiling: units(ceiling), openingApproved: opening === "0" ? "0" : units(opening) } });
        await client.compensation.agreement(command); await query.refetch({ throwOnError: true }); setTerms(initial); setCeiling(""); setOpening("0"); setEditing(undefined); setVersion(0); identity.current = newIdentity();
      } catch (e) { setError(e instanceof Error ? e.message : "Agreement not saved. Read the existing record before retrying."); } finally { setBusy(false); }
    }}><FieldGroup><div className="grid gap-5 sm:grid-cols-2">{stringField("title", "Agreement title")}{stringField("payee", "Contributor NEAR account")}{stringField("document", "Signed Google Doc or document URL", "url")}{stringField("signedOn", "Signed on", "date")}{stringField("start", "Work period starts", "date")}{stringField("end", "Work period ends", "date")}<Labeled id="ceiling" label="Upper limit · USDC"><Input id="ceiling" inputMode="decimal" value={ceiling} required disabled={busy} onChange={e => setCeiling(e.target.value)} /></Labeled><Labeled id="opening" label="Already approved outside this system · USDC" description="Include earlier approved compensation in this period, paid or unpaid. This opening amount cannot be edited later."><Input id="opening" inputMode="decimal" value={opening} required disabled={busy || !!editing} onChange={e => setOpening(e.target.value)} /></Labeled></div><Labeled id="scope" label="Scope reference"><Textarea id="scope" maxLength={2000} value={terms.scope} disabled={busy} onChange={e => setTerms({ ...terms, scope: e.target.value })} /></Labeled></FieldGroup></form>{error && <p role="alert" className="mt-4 text-sm text-destructive-muted-foreground">{error}</p>}</CardContent><CardFooter className="justify-end gap-3">{editing && <Button variant="ghost" disabled={busy} onClick={() => { setEditing(undefined); setVersion(0); setTerms(initial); setCeiling(""); setOpening("0"); identity.current = newIdentity(); }}>Cancel amendment</Button>}<Button type="submit" form="period-agreement" disabled={busy || !!query.error}>{busy ? "Saving…" : "Record signed terms"}</Button></CardFooter></Card></details>}
  </section>;
}

/** Done once per payout agent, not per report. Each item links to the screen where it is set up. */
function SharedSetup({ items }: { items: SetupItem[] }) {
  return <Card><CardHeader><CardTitle>Shared payouts · optional setup, once</CardTitle><CardDescription>{items.every(item => item.ready) ? "Ready. A report paid this way needs only its review, preparation, submission and one approval." : "Complete these once to pay reports from the shared payout agent instead of an isolated order."} One lost send reply pauses all shared payouts until it is reviewed.</CardDescription></CardHeader>
    <CardContent><ul aria-label="Shared payout setup" className="grid gap-3 sm:grid-cols-2">{items.map(item => <li key={item.key} className="flex min-w-0 flex-col gap-1 border p-4"><span className="flex items-center justify-between gap-3 font-medium">{item.label}<span className="text-sm">{item.ready ? "Ready" : "Needed"}</span></span><span className="break-words text-sm text-muted-foreground">{item.detail}</span>{!item.ready && item.to !== "/" && <Link to={item.to} className="min-h-11 py-3 text-sm underline">Set up {item.label.toLowerCase()}</Link>}</li>)}</ul></CardContent></Card>;
}

/** The recurring steps for this report; the next one is marked current. The held payout is approved on its payment page. */
function ReportSteps({ step, payment }: { step: number; payment?: string }) {
  return <ol aria-label="Steps for this report" className="grid gap-2 text-sm">{REPORT_STEPS.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} className={index === step ? "font-semibold" : index < step ? "text-muted-foreground line-through" : "text-muted-foreground"}>{index + 1}. {label}{index === 3 && step === 3 && payment && <> · <Link to="/follow/payment" search={{ payment }} className="underline">Review the held payout</Link></>}</li>)}</ol>;
}
