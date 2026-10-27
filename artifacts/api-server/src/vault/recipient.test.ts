import { test } from "node:test";
import assert from "node:assert/strict";
import { mainnetAddress, observeRecipient } from "./recipient";
const address = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
const stats = { funded_txo_sum: 200000, spent_txo_sum: 50000, tx_count: 12 };
const summary = { address, chain_stats: stats, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 3000, tx_count: 1 } };
const tx = { txid: "a".repeat(64), status: { confirmed: true, block_time: 1600000000 },
  vin: [{ prevout: {scriptpubkey_address: address, value: 10000} }],
  vout: [{scriptpubkey_address: address, value: 6000}] };
function fixture(data: unknown = summary, history: unknown = [tx]): typeof fetch {
  return async (input, init) => {
    assert.match(String(input), /^https:\/\/mempool\.space\/api\/address\/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa(?:\/txs)?$/);
    assert.equal(init?.redirect, "error");
    return Response.json(String(input).endsWith("/txs") ? history : data);
  };
}
test("mainnet recipient validates checksum and rejects test addresses, URLs and injected paths", () => {
  assert.equal(mainnetAddress(address), address);
  for (const value of ["", "tb1qtestaddress", "bcrt1qtestaddress", address.slice(0,-1)+"b", `bitcoin:${address}`, `${address}/txs`, "http://127.0.0.1"]) {
    assert.throws(() => mainnetAddress(value), /mainnet address/);
  }
});
test("indexer observation keeps exact sats, signed mempool delta and explicitly limited recent history", async () => {
  const result = await observeRecipient(address, fixture());
  assert.equal(result.confirmedSats, "150000");
  assert.equal(result.unconfirmedSats, "-3000");
  assert.equal(result.transactions[0]?.netSats, "-4000");
  assert.equal(result.transactionCount, 13);
  assert.equal(result.historyLimited, true);
  assert.equal(result.network, "main");
  assert.equal(result.provider, "mempool.space");
  assert.ok(Date.now() - result.observedAt.getTime() < 1000);
});
test("an unused address reports an observed zero rather than an error fallback", async () => {
  const zero = { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 };
  const result = await observeRecipient(address, fixture({address, chain_stats: zero, mempool_stats: zero}, []));
  assert.equal(result.confirmedSats, "0");
  assert.equal(result.historyLimited, false);
  assert.deepEqual(result.transactions, []);
});
test("bad upstream data never becomes a zero balance or a trusted observation", async () => {
  for (const data of [
    {...summary, address: "other"},
    {...summary, chain_stats: {...stats, spent_txo_sum: 300000}},
    {...summary, chain_stats: {...stats, funded_txo_sum: "200000"}},
    {...summary, chain_stats: {...stats, tx_count: -1}},
  ]) await assert.rejects(observeRecipient(address, fixture(data)), /could not be verified/);
  await assert.rejects(observeRecipient(address, fixture(summary, [{...tx, txid: "malformed"}])), /could not be verified/);
});
test("rate limiting, oversized response, connection loss and non-JSON fail explicitly", async () => {
  const responses = [
    async () => new Response("busy", {status: 429}),
    async () => new Response("x".repeat(2 * 1024 * 1024 + 1)),
    async () => { throw new Error("network lost"); },
    async () => new Response("<html>upstream error</html>"),
  ];
  for (const request of responses) await assert.rejects(observeRecipient(address, request), /unavailable|could not be verified/);
});
