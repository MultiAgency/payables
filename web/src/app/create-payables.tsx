import { payablesReservation, reservationUrl, type Gateway } from "./gateway-contract";
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FieldGroup } from "../shared/form";
import { Button, ErrorBox, Spinner } from "../shared/ui";
import { errorMessage, gw } from "../shared/lib";

/** Reserves local setup only. Policy creation and grant issuance still require owner signatures. */
export function CreatePayables({ gateway }: { gateway: Gateway }) {
  const account = gateway.viewer!.account;
  const [kind, setKind] = useState<"wallet" | "dao">("wallet");
  const [dao, setDao] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    if (busy) return;
    setBusy(true); setError(undefined);
    try {
      const request = payablesReservation(gateway, kind, dao);
      const result = await gw<unknown>(request.path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request.body) });
      location.assign(reservationUrl(request.path, result));
    } catch (e) { setError(errorMessage(e)); setBusy(false); }
  };
  return <section aria-labelledby="create-payables-heading" className="flex max-w-2xl flex-col gap-5 border-b pb-8">
    <div className="flex flex-col gap-2">
      <h2 id="create-payables-heading" className="text-2xl font-semibold">Set up your Payables agent</h2>
      <p className="text-muted-foreground">Choose who owns it. The owner reviews and signs the policy and grant in the next steps. Continuing here moves no funds.</p>
    </div>
    <form onSubmit={e => { e.preventDefault(); void submit(); }} className="flex flex-col items-start gap-5">
      <FieldGroup>
        <ToggleGroup type="single" value={kind} onValueChange={value => { if (value === "wallet" || value === "dao") setKind(value); }} disabled={busy} variant="outline" aria-label="Agent owner">
          <ToggleGroupItem value="wallet">My NEAR account</ToggleGroupItem>
          <ToggleGroupItem value="dao">Sputnik DAO</ToggleGroupItem>
        </ToggleGroup>
        {kind === "wallet" ? <p className="break-all text-sm">Owner: <strong>{account}</strong>. You sign setup and approve held payouts with this account.</p> : <>
          <Field label="DAO account" value={dao} onChange={e => setDao(e.target.value)} required disabled={busy} placeholder="your-dao.sputnik-dao.near" autoCapitalize="none" spellCheck={false} />
          <p className="text-sm text-muted-foreground">You must be a member allowed to propose owner actions. The DAO authorizes setup through its voting rules. Its membership is public on-chain.</p>
        </>}
      </FieldGroup>
      <ErrorBox error={error} />
      <Button type="submit" disabled={busy || kind === "dao" && !dao.trim()}>{busy && <Spinner />}{busy ? "Opening setup…" : "Continue to Payables setup"}</Button>
      <p className="text-sm text-muted-foreground">One self-service Payables agent per owner on this host. Continuing again reopens the same setup.</p>
    </form>
  </section>;
}
