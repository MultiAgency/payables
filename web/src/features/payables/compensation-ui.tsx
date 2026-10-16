import type { ReactNode } from "react";
import type { CompensationReport, CompensationRequest } from "../../../../src/compensation-contract";
import { Field, FieldLabel, FieldDescription, FieldGroup } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";

/** getRandomValues also works on local development origins without randomUUID. */
export function newIdentity() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64; bytes[8] = (bytes[8]! & 63) | 128;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function usdc(raw: string) {
  const n = BigInt(raw), cents = (n % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${(n / 1_000_000n).toLocaleString()}${cents ? `.${cents}` : ""}`;
}
export function units(value: string) {
  if (!/^\d{1,12}(\.\d{1,6})?$/.test(value)) return "";
  const [whole, fraction = ""] = value.split(".");
  return (BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, "0"))).toString();
}
export const stateLabel: Record<CompensationRequest["state"], string> = {
  draft: "Draft", submitted: "In review", changes_requested: "Changes requested", approved: "Compensation approved", declined: "Declined",
};
export function RequestBadge({ state }: { state: CompensationRequest["state"] }) {
  return <Badge variant={state === "approved" ? "success" : state === "changes_requested" ? "warning" : state === "submitted" ? "info" : "secondary"}>{stateLabel[state]}</Badge>;
}
export function Labeled({ id, label, description, children }: { id: string; label: string; description?: string; children: ReactNode }) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel>{children}{description && <FieldDescription>{description}</FieldDescription>}</Field>;
}
export function ReportFields({ report, amount, onAmount, onChange, disabled = false }: {
  report: CompensationReport; amount: string; onAmount: (value: string) => void;
  onChange: (report: CompensationReport) => void; disabled?: boolean;
}) {
  return <FieldGroup>
    {report.amount !== undefined && <Labeled id="requested-amount" label="Amount requested · USDC" description="Request compensation for the work below. Your agreement ceiling is not a promise of payment.">
      <Input id="requested-amount" inputMode="decimal" value={amount} onChange={e => onAmount(e.target.value)} disabled={disabled} required />
    </Labeled>}
    <div className="grid gap-4 sm:grid-cols-2">
      <Labeled id="report-start" label="Work period starts"><Input id="report-start" type="date" value={report.start} onChange={e => onChange({ ...report, start: e.target.value })} disabled={disabled} required /></Labeled>
      <Labeled id="report-end" label="Work period ends"><Input id="report-end" type="date" value={report.end} onChange={e => onChange({ ...report, end: e.target.value })} disabled={disabled} required /></Labeled>
    </div>
    <Labeled id="contributions" label="Contributions" description="What did you deliver? Reference the authorized issues, pull requests, documents or other outputs.">
      <Textarea id="contributions" rows={7} maxLength={4000} value={report.contributions} onChange={e => onChange({ ...report, contributions: e.target.value })} disabled={disabled} required />
    </Labeled>
    <Labeled id="assessment" label="Assessment" description="Explain the impact, what you learned and any unfinished work or blockers.">
      <Textarea id="assessment" rows={5} maxLength={2000} value={report.assessment} onChange={e => onChange({ ...report, assessment: e.target.value })} disabled={disabled} required />
    </Labeled>
    <Labeled id="evidence" label="Evidence links" description="One HTTPS link per line, up to 12. Links are references; the service does not fetch their contents.">
      <Textarea id="evidence" rows={3} value={report.evidence.join("\n")} onChange={e => onChange({ ...report, evidence: e.target.value.split("\n") })} disabled={disabled} />
    </Labeled>
  </FieldGroup>;
}
export function ReportBody({ request }: { request: CompensationRequest }) {
  return <div className="flex min-w-0 flex-col gap-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><RequestBadge state={request.state} /><p className="tabular-nums text-sm text-muted-foreground">{request.report.start} – {request.report.end}</p></div>
    <div><h3 className="mb-3 text-lg font-semibold">Contributions</h3><p className="max-w-prose whitespace-pre-wrap break-words leading-7">{request.report.contributions}</p></div>
    <div><h3 className="mb-3 text-lg font-semibold">Assessment</h3><p className="max-w-prose whitespace-pre-wrap break-words leading-7">{request.report.assessment}</p></div>
    {request.report.evidence.length > 0 && <div><h3 className="mb-3 text-lg font-semibold">Evidence</h3><ul className="flex flex-col gap-3">{request.report.evidence.map((url, i) => <li key={i}><a className="break-all text-sm underline underline-offset-4" href={url} target="_blank" rel="noreferrer">{url}</a></li>)}</ul></div>}
    {request.feedback && <div className="border-t pt-5"><h3 className="mb-2 font-semibold">Owner feedback</h3><p className="whitespace-pre-wrap break-words text-sm leading-6">{request.feedback}</p></div>}
  </div>;
}
