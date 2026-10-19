import assert from "node:assert/strict";
import { test } from "node:test";
import { readGateway, payablesReservation, reservationUrl, payeeHostUrl, canSetupPayables, reportLink } from "../web/src/app/gateway-contract.js";
const location = { hostname: "payables.test", protocol: "https:", pathname: "/" };
const shared = { agents: [], invoices: null, viewer: { account: "alice.near", access: {} }, selfService: true, setupAreas: ["payables"] };
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
test("shared reservations bind authenticated wallet owner and accept DAO owner", async () => {
  const gateway = (await readGateway(response(shared), location))!;
  assert.deepEqual(payablesReservation(gateway, "wallet", "other.near"), { path: "/gw/agents", body: { owner: "alice.near", kind: "wallet", area: "payables" } });
  assert.deepEqual(payablesReservation(gateway, "dao", " team.near "), { path: "/gw/agents", body: { owner: "team.near", kind: "dao", area: "payables" } });
  assert.throws(() => payablesReservation(gateway, "dao", " "));
});
test("legacy optional fields and standalone reservation response remain supported", async () => {
  const legacy = { agents: [], invoices: null, viewer: null };
  assert.deepEqual(await readGateway(response(legacy), location), legacy);
  const gateway = (await readGateway(response({ ...shared, setupAreas: undefined }), location))!;
  assert.deepEqual(payablesReservation(gateway, "wallet", ""), { path: "/gw/payables", body: { kind: "wallet", owner: "alice.near" } });
  assert.deepEqual(payablesReservation(gateway, "dao", " team.near "), { path: "/gw/payables", body: { kind: "dao", owner: "team.near" } });
  assert.equal(reservationUrl("/gw/payables", { url: `/a/pay-${"a".repeat(24)}/` }), `/a/pay-${"a".repeat(24)}/`);
  assert.throws(() => reservationUrl("/gw/payables", { url: "https://evil.test/" }));
});
test("explicit area restrictions override legacy flags and sessions are required", async () => {
  for (const data of [{ ...shared, setupAreas: [] }, { ...shared, setupAreas: ["treasury"] }, { ...shared, selfService: false }, { ...shared, selfService: undefined }, { ...shared, viewer: null }]) {
    const gateway = (await readGateway(response(data), location))!;
    assert.throws(() => payablesReservation(gateway, "wallet", ""));
    if (data.viewer) assert.equal(canSetupPayables(gateway), false);
  }
});
test("shared names are routing identifiers, validated without a pay prefix", () => {
  assert.equal(reservationUrl("/gw/agents", { name: "own-123" }), "/a/own-123/");
  for (const name of ["", "../alice", "own/a", "x?y", "x#y", "a".repeat(33), "UPPER", null]) assert.throws(() => reservationUrl("/gw/agents", { name }));
});
test("payee host addresses stay selected-agent scoped, with explicit legacy fallback", async () => {
  const gateway = (await readGateway(response({ ...shared, invoices: "https://legacy.test/", agents: [
    { name: "own-alice", owner: "alice.near", dao: false, invoices: "https://payees.test/alice/" },
    { name: "own-bob", owner: "bob.near", dao: false, invoices: "https://payees.test/bob/" },
    { name: "own-empty", owner: "empty.near", dao: false },
  ] }), location))!;
  assert.equal(payeeHostUrl(gateway, "/a/own-alice"), "https://payees.test/alice/");
  assert.equal(payeeHostUrl(gateway, "/a/own-bob"), "https://payees.test/bob/");
  for (const base of ["/a/own-empty", "/a/missing", ""]) assert.equal(payeeHostUrl(gateway, base), undefined);
  assert.equal(payeeHostUrl({ ...gateway, setupAreas: undefined }, "/a/own-empty"), "https://legacy.test/");
  assert.equal(payeeHostUrl({ ...gateway, setupAreas: undefined, agents: [{ name: "pay-old", owner: "alice.near", dao: false, managed: true }] }, "/a/pay-old"), undefined);
});
test("hosted malformed discovery fails closed; only intentional HTTP loopback HTML is local", async () => {
  for (const body of [{}, { ...shared, agents: [{}] }, { ...shared, agents: [{ name: "../bad", owner: "alice.near", dao: false }] }, { ...shared, viewer: {} }, { ...shared, setupAreas: "payables" }, { ...shared, selfService: "true" }, { ...shared, invoices: "javascript:alert(1)" }]) await assert.rejects(readGateway(response(body), location), /gateway/i);
  for (const loc of [location, { ...location, hostname: "localhost" }, { ...location, hostname: "localhost", protocol: "http:", pathname: "/a/own-123/" }]) await assert.rejects(readGateway(new Response("<html>fallback</html>"), loc), /gateway/i);
  await assert.rejects(readGateway(new Response("{bad", { headers: { "content-type": "application/json" } }), location), /invalid JSON/);
  await assert.rejects(readGateway(new Response(JSON.stringify({ error: "Useful refusal" }), { status: 403, headers: { "content-type": "application/json" } }), location), /Useful refusal/);
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) assert.equal(await readGateway(new Response("<html>local</html>"), { ...location, hostname, protocol: "http:" }), null);
});

test("an agreement's report link opens its form under the root or a scoped intake entry", () => {
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  assert.equal(reportLink("https://invoices.test/", id), `https://invoices.test/report?agreement=${id}`);
  assert.equal(reportLink("https://invoices.test/i/own-0123456789abcdef01234567/", id), `https://invoices.test/i/own-0123456789abcdef01234567/report?agreement=${id}`);
  assert.equal(reportLink("https://invoices.test/i/own-0123456789abcdef01234567", id), `https://invoices.test/i/own-0123456789abcdef01234567/report?agreement=${id}`);
});
