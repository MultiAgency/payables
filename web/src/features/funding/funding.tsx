import { TaskEvidence } from "../evidence/task-evidence";
import { Sweep } from "./sweep";
import { PayablesSchedule } from "../portfolio/automations";
import { Link, useLocation } from "@tanstack/react-router";
import { useAgent } from "../../app/agent-context";
import { Balances } from "./balances";
import { kindOf } from "../../shared/lib";
import { TreasuryPayees } from "../payables/payees";
import { ReturnFunds, TreasurySection } from "./treasury";
import { Details, Section } from "../../shared/ui";
import { OWNER_TREASURY, useProvides } from "../../app/capabilities";

export function Funding() {
  const { data } = useAgent();
  const hash = useLocation({ select: location => location.hash });
  const ownerTreasury = useProvides(OWNER_TREASURY);
  return <>
    <TaskEvidence task="funding" />
    <Balances />
    {ownerTreasury && <TreasurySection />}
    <section id="sweep" className="scroll-mt-24 flex flex-col gap-4" aria-label="Shield public funds">
      {/* A running schedule's stop control stays on every host (autopilot/get is an observation); it renders only while one is on. */}
      {kindOf(data) === "facilitator" && <PayablesSchedule />}
      {ownerTreasury && <Details summary="Shield public funds" open={hash === "sweep"}><Sweep /></Details>}
    </section>
    <Section title="Send funds" description="Outgoing payments use this agent’s policy and grant. Reported balances do not establish how much can be sent.">
      <ReturnFunds />
      {kindOf(data) === "treasury" ? <TreasuryPayees /> : <div className="flex flex-wrap gap-4 text-sm">
        <Link to="/" className="underline">Review held payouts</Link>
        <Link to="/payees" className="underline">Review agreements and payees</Link>
      </div>}
    </Section>
  </>;
}
