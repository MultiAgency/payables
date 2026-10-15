import { MultiAgencyLogo } from "../components/multiagency-logo";
import { useState } from "react";
import { ArrowRight, LockSimple, ShieldCheck, Wallet } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { SignIn } from "../app/session";

type Flow = "dao" | "po";
const scenarios = {
  dao: ["Agreed contractor", "New payee", "Over limit, unanimous approval"],
  po: ["Agreed supplier", "Changed supplier", "Changed amount", "Past the deadline"],
};
const stages = {
  dao: ["Request received", "Agreement checked", "First approval", "Quorum reached", "Payment recorded"],
  po: ["Order created", "Agent funded", "Invoice checked", "Payment recorded", "Grant expired"],
};

export function PayablesDemo() {
  const [flow, setFlow] = useState<Flow>("dao");
  const [scenario, setScenario] = useState(0);
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(false);
  const refused = started && scenario > 0 && step >= (flow === "dao" ? 1 : 2);
  const finished = started && step === 4;
  const select = (value: Flow) => { setFlow(value); setScenario(0); setStep(0); setStarted(false); };
  const restart = () => { setStep(0); setStarted(false); };
  const advance = () => { if (!started) setStarted(true); else setStep(value => Math.min(4, value + 1)); };
  const reason = flow === "dao"
    ? scenario === 1 ? "This payee is outside the signed agreement. A new policy and grant agreement must be signed before payment."
      : "The $750 request exceeds the $500 ceiling. Even five approvals cannot raise a signed spending limit."
    : scenario === 1 ? "The invoice names a different supplier. This order can pay only its agreed destination."
      : scenario === 2 ? "The invoice requests $1,500 against a $1,250 order. Its fixed amount cannot be changed by the intake process."
        : "The payment request arrived after the grant deadline. New submissions are refused; expiry does not undo an accepted payment.";
  const description = flow === "dao" ? [
    "A contractor submits a $250 invoice through the public intake page. The requester sees a reference, not council accounts.",
    "The example payee and amount match the signed policy and intake grant. The payout is held for approval.",
    "One of five approvers has voted. The payout remains held; one vote is not enough.",
    "Two approvals meet the threshold. Approval is permission to release this payout; it is not proof of settlement.",
    "This example ends with a simulated successful payment. A real payment is complete only when its recorded provider outcome confirms it.",
  ] : [
    "PO-1042 records one supplier, an exact $1,250 amount and a payment deadline. It has its own agent.",
    "The example agent receives exactly $1,250. It cannot spend from the main treasury, whose balance is never shown here.",
    "The supplier, amount and deadline match. The invoice retains one payment identity so retries follow the same operation.",
    "This example records one simulated payment after owner approval. The order budget is spent; the same invoice cannot create another payment.",
    "The grant window closes. No new payment may start under it. Expiry does not recall an accepted payment or automatically refund residual funds.",
  ];
  const action = !started ? flow === "dao" ? "Submit example invoice" : "Create example order"
    : flow === "dao" ? ["Check the agreement", "Record first approval", "Record second approval", "Show example outcome"][step]
      : ["Fund example agent", "Check example invoice", "Show approved example payout", "Close the grant window"][step];
  return <>
    <a href="#main" className="sr-only focus:not-sr-only">Skip to demo</a>
    <main id="main" className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-6 sm:px-10 sm:py-9">
      <nav aria-label="Main" className="flex flex-wrap items-center justify-between gap-4">
        <a href="https://multiagency.ai" className="flex items-center gap-2 font-heading text-sm font-semibold tracking-tight"><MultiAgencyLogo />multiagency.ai</a>
        <Button asChild variant="outline" size="lg"><a href="#create-agent">Create your agent</a></Button>
      </nav>
      <Separator />
      <header className="grid gap-6 py-3 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <h1 className="max-w-[18ch] font-heading text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">Payments with permission built in.</h1>
        <p className="max-w-prose text-base leading-relaxed text-muted-foreground">An invoice reaches the DAO without going through its members. A purchase order gets a budget of its own. Explore both, then set up your agent.</p>
      </header>
      <section aria-label="Choose a walkthrough">
        <ToggleGroup type="single" value={flow} onValueChange={value => { if (value === "dao" || value === "po") select(value); }} variant="outline" size="lg" spacing={3} aria-label="Walkthrough" className="grid w-full grid-cols-1 items-stretch sm:grid-cols-2">
          <ToggleGroupItem value="dao" className="h-auto min-h-20 justify-start gap-3 px-4 py-4">
            <LockSimple data-icon="inline-start" aria-hidden="true" />
            <span className="flex flex-col gap-1 whitespace-normal text-left"><span>Confidential DAO payments</span><span className="font-normal">Public intake. Agreed payees. Member approval.</span></span>
          </ToggleGroupItem>
          <ToggleGroupItem value="po" className="h-auto min-h-20 justify-start gap-3 px-4 py-4">
            <Wallet data-icon="inline-start" aria-hidden="true" />
            <span className="flex flex-col gap-1 whitespace-normal text-left"><span>Purchase-order agents</span><span className="font-normal">One supplier. One budget. One payment identity.</span></span>
          </ToggleGroupItem>
        </ToggleGroup>
      </section>
      <section aria-labelledby="preview-heading">
        <Card>
          <CardHeader>
            <CardTitle asChild><h2 id="preview-heading">Interactive preview</h2></CardTitle>
            <CardDescription>Example data · No wallet needed · No funds move</CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="grid gap-8 lg:grid-cols-[14rem_1fr]">
            <aside className="flex flex-col gap-6">
              <FieldGroup><Field>
                <FieldLabel htmlFor="demo-scenario">Try a scenario</FieldLabel>
                <NativeSelect id="demo-scenario" value={scenario} onChange={event => { setScenario(Number(event.target.value)); restart(); }}>
                  {scenarios[flow].map((label, index) => <NativeSelectOption value={index} key={label}>{label}</NativeSelectOption>)}
                </NativeSelect>
              </Field></FieldGroup>
              <ol aria-label="Walkthrough progress" className="flex flex-col gap-3">
                {stages[flow].map((label, index) => <li key={label} aria-current={started && index === step ? "step" : undefined} className={cn("flex items-center gap-3 text-sm", started && index === step ? "font-medium text-foreground" : "text-muted-foreground")}>
                  <Badge variant={started && index <= step ? "default" : "outline"}>{index + 1}</Badge>{label}
                </li>)}
              </ol>
            </aside>
            <div className="flex min-h-72 min-w-0 flex-col gap-6 lg:border-l lg:pl-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="text-sm text-muted-foreground">{flow === "dao" ? "Example invoice INV-018" : "Example purchase order PO-1042"}</p>
                  <p className="mt-2 text-4xl font-semibold tracking-tight">${flow === "dao" ? scenario === 2 ? "750" : "250" : scenario === 2 ? "1,500" : "1,250"} <span className="text-base font-normal text-muted-foreground">USDC</span></p>
                </div>
                <Badge variant={refused ? "destructive" : finished ? "default" : "outline"}>{refused ? "Refused in preview" : finished ? "Preview complete" : started ? stages[flow][step] : "Ready to explore"}</Badge>
              </div>
              <Separator />
              <dl className="grid gap-5 sm:grid-cols-2">
                <div><dt className="text-sm text-muted-foreground">{flow === "dao" ? "Approval threshold" : "Dedicated budget"}</dt><dd className="mt-1 font-medium">{flow === "dao" ? "2 of 5 members" : "$1,250 USDC"}</dd></div>
                <div><dt className="text-sm text-muted-foreground">{flow === "dao" ? "Requester can see" : "Authorized destination"}</dt><dd className="mt-1 font-medium">{flow === "dao" ? "Invoice reference and status" : "One agreed supplier account"}</dd></div>
              </dl>
              <Separator />
              <div aria-live="polite" aria-atomic="true">
                {refused ? <Alert variant="destructive"><AlertTitle>The agreement stops this request.</AlertTitle><AlertDescription>{reason}</AlertDescription></Alert> : <div className="flex flex-col gap-3">
                  <h3 className="text-lg font-medium">{!started ? flow === "dao" ? "Start with the contractor." : "Start with the purchase order." : stages[flow][step]}</h3>
                  <p className="max-w-prose leading-relaxed text-muted-foreground">{!started ? "Walk through the example one step at a time, or choose a refusal scenario to see where the request stops." : description[step]}</p>
                </div>}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-3 border-t pt-4 lg:justify-end">
            {!refused && !finished && <Button size="lg" onClick={advance}>{action}<ArrowRight data-icon="inline-end" aria-hidden="true" /></Button>}
            {started && <Button variant="outline" size="lg" onClick={restart}>Reset preview</Button>}
            {finished && scenario === 0 && <Button variant="outline" size="lg" onClick={() => select(flow === "dao" ? "po" : "dao")}>Explore {flow === "dao" ? "purchase orders" : "DAO payments"}</Button>}
          </CardFooter>
        </Card>
      </section>
      <Separator />
      <section id="create-agent" className="grid scroll-mt-8 gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-4"><ShieldCheck size={28} aria-hidden="true" /><h2 className="text-3xl font-semibold tracking-tight">Make the agent yours.</h2>
          <p className="max-w-prose leading-relaxed text-muted-foreground">Connect a regular NEAR account or a member wallet for your Sputnik DAO. Choose the owner, sign its policy and grant, then fund it when you are ready. Setup starts without moving funds.</p>
          <p className="max-w-prose text-sm text-muted-foreground">Inside your workspace, use Payments for invoices and Agreements for purchase orders. Real operations require owner signatures and use real funds.</p>
        </div>
        <SignIn daos={[]} selfService />
      </section>
      <details className="border p-5"><summary className="min-h-11 cursor-pointer content-center text-sm font-medium">What this demo does—and what remains unverified</summary>
        <div className="mt-4 flex max-w-prose flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
          <p>The preview illustrates the intended workflows. Its approvals, balances and outcomes are examples, not chain or provider evidence. The real workspace uses retained operation records and explicit signatures.</p>
          <p>Live flows currently use USDC and NEAR Intents recipient accounts. DAO membership is hidden from the intake interface; public DAO governance can still reveal membership. This demo does not prove that every observer is unable to reconstruct payment relationships.</p>
          <p>Purchase-order isolation and refusal paths have offline tests. The hosted lifecycle has not yet been observed end to end on mainnet. Supplier auto-conversion and nightly forwarding are not implemented. Grant expiry blocks new work; it does not recall an accepted payment.</p>
        </div>
      </details>
      <Separator />
      <footer className="flex flex-wrap justify-between gap-3 text-xs text-muted-foreground"><span>Built for NEAR account and DAO owners.</span><a href="https://multiagency.ai" className="underline underline-offset-4">multiagency.ai</a></footer>
    </main>
  </>;
}
