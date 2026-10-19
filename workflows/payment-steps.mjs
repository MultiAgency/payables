// Reusable owner and payee steps over Proto's existing HTTP/RPC surfaces. Every call goes
// through the gateway (owner) or the payee origin; nothing here holds a grant or
// reaches an executor directly. Signatures come from the stack's simulated test-key wallet.
// Payee calls use Proto's platform contract client (`@multiagency/sdk`).
import { request as httpsRequest } from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { payeeClient } from '@multiagency/sdk/payee';

/**
 * An HTTPS session against one local origin, trusting only the stack's self-signed certificate.
 * `call` is for JSON owner routes; `fetch` is a fetch-compatible adapter for the contract client.
 * Both share one cookie jar.
 */
export function session(origin, stackDirectory) {
  const ca = readFileSync(join(stackDirectory, 'localhost.crt'));
  let cookie = '';
  const send = (method, path, headers, body) => new Promise((resolve, reject) => {
    const req = httpsRequest(new URL(path, origin), { method, ca, headers: { ...headers, ...(cookie && { cookie }) } }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        const set = res.headers['set-cookie'];
        if (set) cookie = set.map(c => c.split(';')[0]).join('; ');
        resolve({ status: res.statusCode, contentType: res.headers['content-type'], text });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
  async function call(method, path, body) {
    const r = await send(method, path, body === undefined ? {} : { 'content-type': 'application/json' }, body === undefined ? undefined : JSON.stringify(body));
    let value; try { value = r.text ? JSON.parse(r.text) : null; } catch { value = r.text; }
    return { status: r.status, body: value };
  }
  async function fetch(input, init = {}) {
    const r = await send(init.method ?? 'GET', input, Object.fromEntries(new Headers(init.headers).entries()), init.body ?? undefined);
    return new Response(r.text || null, { status: r.status, headers: r.contentType ? { 'content-type': r.contentType } : {} });
  }
  return { origin, call, fetch };
}

/** Answers a NEP-413 sign-in challenge with the simulated wallet. */
async function signedChallenge(challenge, account, sign) {
  const signed = await sign(account, { message: challenge.message, recipient: challenge.recipient, nonce: challenge.nonce });
  return { accountId: account, publicKey: signed.publicKey, signature: signed.signature, nonce: challenge.nonce, callbackUrls: [] };
}

function expectOk(response, what) {
  if (response.status !== 200) throw new Error(`${what} failed (${response.status}): ${JSON.stringify(response.body)}`);
  return response.body;
}

/** Owner: wallet sign-in at the gateway, then RPC under one agent's scope. */
export async function ownerSignIn(http, account, sign) {
  const challenge = expectOk(await http.call('GET', '/gw/challenge'), 'Owner challenge');
  return expectOk(await http.call('POST', '/gw/session', await signedChallenge(challenge, account, sign)), 'Owner sign-in');
}

export function ownerRpc(http, agent) {
  return async (path, input) => {
    const response = await http.call('POST', `/a/${agent}/rpc/${path}`, { json: input });
    if (response.status !== 200) {
      const error = new Error(`${path}: ${response.body?.json?.message ?? JSON.stringify(response.body)}`);
      // A typed refusal names its kind and code (for example `refused` / `ceiling_exceeded`): nothing was changed or sent.
      Object.assign(error, { status: response.status, kind: response.body?.json?.data?.kind ?? null, code: response.body?.json?.data?.code ?? null }); throw error;
    }
    return response.body.json;
  };
}

/**
 * One explicit owner action: prepare → wallet signature → submit, then observe the provider's
 * verdict on the owner's own signature (`ownerSucceeded`). For an approval this is the owner's
 * decision only; the released payment's outcome is observed separately.
 * A failed or ambiguous submission is followed by its correlation id, never signed or sent again.
 */
async function signedOwnerAction(transport, sign, owner, options) {
  const prepared = await transport.prepare();
  if (!prepared.intent || prepared.intent.standard !== 'nep413') throw new Error('Expected a wallet NEP-413 intent');
  const { publicKey, signature } = await sign(owner, prepared.intent.payload);
  let submitted;
  try { submitted = await transport.submit(prepared.correlationId, { ...prepared.intent, public_key: publicKey, signature }); }
  catch (error) { submitted = { error: error.message }; }
  const record = await observe(async () => (await transport.actions()).find(a => a.correlationId === prepared.correlationId),
    a => a?.ownerSucceeded || (a?.stage === 'settled' && a.status !== 'SUCCESS'), options);
  return { correlationId: prepared.correlationId, submitted, ownerSucceeded: record.value?.ownerSucceeded === true,
    stage: record.value?.stage ?? 'unknown', status: record.value?.status ?? null };
}

/** An owner action on the agent itself (for example, approving a held payout). */
export const ownerAction = (rpc, sign, owner, action, options) => signedOwnerAction({
  prepare: () => rpc('owner/prepare', { action, signer: 'wallet' }),
  submit: (correlationId, signedData) => rpc('owner/submit', { correlationId, signedData }),
  actions: () => rpc('owner/actions'),
}, sign, owner, options);

/** An owner action on one work order's dedicated agent. */
export const workOrderOwnerAction = (rpc, sign, owner, id, action, options) => signedOwnerAction({
  prepare: () => rpc('workOrders/prepare', { id, action, signer: 'wallet' }),
  submit: (correlationId, signedData) => rpc('workOrders/submit', { id, correlationId, signedData }),
  actions: async () => (await rpc('workOrders/get', { id })).ownerActions,
}, sign, owner, options);

/** Polls a read until `done` holds; returns the last observation either way. */
export async function observe(read, done, { timeoutMs = 30_000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value) && Date.now() < deadline) { await delay(intervalMs); value = await read(); }
  return { value, done: done(value) };
}

/**
 * Payee reads and sign-in through Proto's `payeeClient` (root intake or a scoped
 * `/i/<instance>` base). Mutations return the client's `Result` unchanged: it never mints or
 * replaces identities, never retries, and reports `unknown` for a sent mutation with no answer.
 */
export function payeeApi(http, base = '') {
  const client = payeeClient({ base, fetch: http.fetch });
  const value = async (what, pending) => {
    const r = await pending;
    if (!r.ok) throw new Error(`${what} failed: ${r.kind}${r.status ? ` ${r.status}` : ''}${r.error ? ` ${r.error}` : ''}`);
    return r.value;
  };
  return {
    client,
    async signIn(account, sign) {
      const challenge = await value('Payee challenge', client.signInChallenge());
      return value('Payee sign-in', client.signIn(await signedChallenge(challenge, account, sign)));
    },
    workOrder: id => value('Payee work-order read', client.workOrder(id)),
    invoices: () => value('Payee invoice read', client.invoices()),
    compensation: () => value('Payee compensation read', client.compensation()),
  };
}
