---
name: multiagency-builder-onboarding
description: Onboard a builder using their own coding agent to MultiAgency, identify assigned work and confirm work-order terms before starting. Use when connecting a personal Codex, Claude Code or other coding agent to MultiAgency work.
---

# MultiAgency builder onboarding

Help the builder reach one concrete outcome: a confirmed work order and a clear first deliverable in their own development environment.

## Connection status

The report-and-payment-request workflow is now prepared locally. On a deployment that exposes it,
open the owner-shared invoice link and follow **Report & payment requests**. The owner manually records
the signed agreement and ceiling. Submit Contributions, Assessment, evidence links and work dates
as an amount-free report. The owner sets compensation with an explanation. Use the optional invoice
form only when billing an already agreed amount. Respond to feedback by revising the same submission. Approval, payment preparation and
payment completion remain separate. Hosted availability has not been verified.

Relative to that intake path, `GET /api/compensation/schema` provides the version-2 submission schema;
`GET /api/compensation` reads the authenticated contributor's records and `POST /api/compensation`
saves/submits a report. Commands require stable request/command UUIDs and the expected record version;
report `amount` is omitted for work reports and supplied as an atomic USDC string for invoices.
Approved compensation is recorded separately; do not add an amount just to satisfy an older client. Follow the deployment's host-bound sign-in flow. MCP/OAuth and
standalone personal-agent credentials for these endpoints are not yet implemented. Never export
browser cookies or put session credentials into a prompt to simulate an integration.

This skill is onboarding guidance, not an authenticated connection. It does not itself register an agent, grant access or start background work.

The proposed MultiAgency MCP connection and tools such as `list_my_work`, `get_work_order`, `post_update` and `submit_deliverable` are not established by this skill. Use them only if the connected service actually exposes them and documents their access rules. Do not invent an MCP URL, login command or API token flow.

Dashboard source exposes public builder/member reads; assignments and billing reads require authenticated access. Source is not proof of deployed availability. Dashboard identity, contributor access and Payables owner permissions are separate.

## Provider integration reference

The NEAR Intents Agent API demo documents an existing MCP/OAuth design for financial operations: one endpoint per agent account and a separate owner-signed grant per client. This is provider reference material, not an available MultiAgency work-order connection or evidence that Payables supports the same endpoint.

For builder onboarding, request assigned-work access through the dashboard connection when available. Do not substitute a financial grant for missing work-order access. A builder using their own Codex or Claude Code account does not need a partner API key just to onboard or read their assignment.

If the task is explicitly to implement a financial integration, consult the provider's integration skill and SDK below. Keep the partner API key and underlying grant tokens server-side, outside prompts and logs. Route Payables submissions through its existing dispatch and executor; do not use the provider demo or standalone examples as another send path for a Payables-managed agent. Preparing a grant or completing OAuth consent alone does not establish execution authority; the financial connection also requires the owner's signed grant.

Provider references reviewed on 2026-10-15, pinned to source commits; deployed behavior unverified:

- [Integration skill](https://github.com/NEAR-Intents-Agent-API/skills/blob/0277bc66b3df208240093d9d0fbc348929f1a392/near-intents-agent-api/SKILL.md): lifecycle, credentials and recovery guidance for implementing integrations.
- [TypeScript SDK](https://github.com/NEAR-Intents-Agent-API/sdk-typescript/blob/4cdeb4e6597eb8084f9d3713f160fcbb76151820/README.md): backend client and operation-status handling. Check compatibility with the application's installed SDK before using examples.
- [Demo MCP/OAuth design](https://github.com/NEAR-Intents-Agent-API/demo/blob/ccddefbac9274b639b4e3d538de6887baf3f0ad0/README.md#mcp-authorization): account-bound client access, signed grants and revocation.
- [Runnable examples](https://github.com/NEAR-Intents-Agent-API/examples/blob/660ff0fd4842c44b2303b51a25a0cde6366b3011/README.md): read-only checks and explicitly gated writes. Do not run write examples as part of builder onboarding.

## Establish identity and access

1. Use the builder's chosen MultiAgency organization and project or work-order link. If missing, ask for the organization and assigned-work link together.
2. Direct the builder to sign in through the official dashboard at https://multiagency.ai. Let them complete wallet or account authentication themselves. Never request wallet keys, seed phrases, browser cookies or Codex/Claude account credentials.
3. If an authenticated connector is already available, inspect its actual tools and retrieve only the builder's authorized records. Request the narrowest supported scope needed for the assignment. Posting updates or submitting deliverables needs separate write access; read access is enough for onboarding.
4. Otherwise, have the builder open My work and share the relevant assignment and work-order terms. A pasted record is builder-provided context, not independently verified server evidence. A public profile does not establish agency membership, assignment or recipient authorization.
5. Confirm the intended repository and local checkout before changing files. Follow its AGENTS.md and other applicable project instructions.

Keep the builder's personal coding-agent account in their own environment. MultiAgency access authorizes access to MultiAgency records; it does not confer access to their model-provider account. Connecting a tool does not launch or schedule an autonomous session.

## Confirm the current work order

Keep these identifiers distinct and retain whichever are available:

- Organization and project ID or link.
- Builder identity and intended recipient NEAR account, with network.
- Assignment reference.
- Signed work-order reference and version.
- Payables parent agent and work-order ID, when explicitly linked.

Do not join records by display name, similar titles or matching amounts. Confirm an explicit reference; mark a missing link as unverified.

Summarize the deliverables, acceptance criteria, repository, agreed amount and asset, deadline with timezone, and who accepts the work. Record missing terms as missing. Ask the builder to resolve terms that affect the requested implementation before dependent work begins; independent repository orientation can continue.

MultiAgency's documented contributor work order is an external signed document. Its terms may include milestones and assets beyond the fixed-USDC Payables work-order flow. Do not convert it into a Payables order or imply the two are linked without a recorded mapping and owner authorization.

An assignment is not an accepted agreement. A contributor work-order request is not owner authorization. Payables work-order creation, policy, grant, funding and held payout approval are separate actions. Hosted end-to-end integration and mainnet work-order lifecycle are not verified by these instructions.

## Begin and report work

Once the builder authorizes implementation and the relevant terms are clear:

- Identify the first deliverable and its acceptance check.
- Work in the chosen repository under its existing contribution process.
- Retain the work-order reference with local progress notes or the proposed PR description.
- Report concrete evidence: commit or PR link, checks run, demo or artifact, remaining work and blockers.

When asked to post an update or submit a deliverable, use only an available authenticated tool with the required scope. If unavailable, prepare the text for the builder to submit. A prepared draft is not a posted update. Submission is not acceptance.

After an uncertain write response, read back the existing record using its retained identity before retrying. Do not claim success without returned or subsequently retrieved evidence.

## Payment boundary

New reports and invoices use a retained isolated payout. The owner separately authorizes its policy
and grant, funds it and approves its held payout. Contributors follow recorded payment status on the
submission; missing observations are unavailable. Exact observed funding is a local submission check,
not protection against all deposits or a provider lifetime cap.

Onboarding gives the coding agent no authority to approve or send payments, change a payout recipient, sign an owner policy or grant, or start another executor. Route those requests to the existing owner workflow.

Keep work progress, acceptance, invoice state, held payout approval and recorded payment outcome separate. Unknown payment outcomes remain unresolved; never suggest a replacement payment to bypass them. Work-order expiry stops new submissions; it does not prove accepted work stopped or residual funds returned.

## Finish onboarding

Give a concise handoff containing:

- Builder, organization, project, network and work-order reference.
- Access established and its scope, or the manual handoff used.
- Confirmed deliverables, acceptance check and deadline.
- First implementation step and any missing terms or unverified links.

If access or terms are missing, say exactly what remains needed. Do not report the agent as connected or the work order as authorized merely because this skill was loaded.

## Sources

Use current service documentation and actual connected tools when checking capabilities:

- Dashboard: https://multiagency.ai
- Dashboard source: https://github.com/multiagency/dashboard
- Contributor work-order description: https://multiagency.ai/docs/work-order
- Payables entry: https://payables.multiagency.ai

Ask the owner for the contributor link and deployment-specific documentation. Do not infer that a contributor portal or authenticated agent connection is available from the public entry alone.
