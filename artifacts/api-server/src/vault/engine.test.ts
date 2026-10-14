import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { operationalSettings } from "./engine";

test("policy comes from signer, never stale metadata; outages fail closed", async () => {
  let available = true;
  const server = createServer((req, res) => {
    assert.equal(req.url, "/settings");
    res.setHeader("Content-Type", "application/json");
    res.statusCode = available ? 200 : 503;
    res.end(JSON.stringify(available ? {
      sweepsPaused: false, feeRateCeiling: "2", totalFeeCeilingSats: "1000", hotExposureLimitSats: "100000",
    } : { error: "signer offline" }));
  }).listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const oldURL = process.env.VAULT_ENGINE_URL;
  const oldToken = process.env.VAULT_ENGINE_TOKEN;
  process.env.VAULT_ENGINE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.VAULT_ENGINE_TOKEN = "test-only-not-an-owner-credential";
  try {
    // No D1 call is needed even when metadata is unavailable after a policy update.
    const policy = await operationalSettings();
    assert.equal(policy.sweepsPaused, false);
    assert.equal(policy.feeRateCeiling, "2");
    available = false;
    await assert.rejects(operationalSettings, /signer offline/);
  } finally {
    if (oldURL === undefined) delete process.env.VAULT_ENGINE_URL; else process.env.VAULT_ENGINE_URL = oldURL;
    if (oldToken === undefined) delete process.env.VAULT_ENGINE_TOKEN; else process.env.VAULT_ENGINE_TOKEN = oldToken;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
