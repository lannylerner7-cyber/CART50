import { test } from "node:test";
import assert from "node:assert/strict";
import { mainnetSync } from "./node-sync";

test("mainnet monitoring is isolated, read-only, and fails explicitly", async () => {
  const keys = ["MAINNET_MONITOR_URL", "MAINNET_MONITOR_TOKEN", "BITCOIN_NETWORK"];
  const previous = keys.map(k => process.env[k]);
  const originalFetch = globalThis.fetch;
  try {
    delete process.env.MAINNET_MONITOR_URL;
    delete process.env.MAINNET_MONITOR_TOKEN;
    process.env.BITCOIN_NETWORK = "signet";
    globalThis.fetch = async () => { throw new Error("must not contact Signet"); };
    assert.equal((await mainnetSync()).available, false);
    process.env.MAINNET_MONITOR_URL = "http://vault-mainnet-engine:9090";
    process.env.MAINNET_MONITOR_TOKEN = "test-only-token";
    let payload = {
      available: true, network: "main", observedAt: new Date().toISOString(),
      blocks: 511673, headers: 971911, verificationProgress: 0.216237977,
      initialBlockDownload: true, message: "Fresh observation",
    };
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(String(url), "http://vault-mainnet-engine:9090/sync");
      assert.equal(options?.method, undefined);
      assert.equal(options?.body, undefined);
      return Response.json(payload);
    };
    const results = await Promise.all([mainnetSync(), mainnetSync()]);
    assert.equal(calls, 1);
    assert.equal(results[0].verificationProgress, 0.216237977);
    assert.equal(results[0].initialBlockDownload, true);
    assert.equal(process.env.BITCOIN_NETWORK, "signet");
    payload = { ...payload, network: "signet" };
    assert.equal((await mainnetSync()).available, false);
    payload = { ...payload, network: "main", observedAt: new Date(Date.now() - 120000).toISOString() };
    assert.equal((await mainnetSync()).available, false);
    globalThis.fetch = async () => new Response("", { status: 404 });
    assert.equal((await mainnetSync()).available, false);
    globalThis.fetch = async () => { throw new Error("offline"); };
    const unavailable = await mainnetSync();
    assert.equal(unavailable.available, false);
    assert.equal(unavailable.verificationProgress, null);
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
  }
});
