import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { operationalSettings, engine } from "./engine";

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

test("wrong-network signer receives no mutations in either direction", async () => {
  const old = { url: process.env.VAULT_ENGINE_URL, token: process.env.VAULT_ENGINE_TOKEN, network: process.env.BITCOIN_NETWORK, allow: process.env.ALLOW_MAINNET };
  let network = "main", posts = 0;
  const server = createServer((req,res) => {
    if(req.method==="POST") posts++;
    res.setHeader("Content-Type","application/json");
    res.end(JSON.stringify({network}));
  }).listen(0,"127.0.0.1");
  await new Promise<void>(r=>server.once("listening",r));
  process.env.VAULT_ENGINE_URL=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.VAULT_ENGINE_TOKEN="disposable-testing-token";
  try {
    process.env.BITCOIN_NETWORK="signet";
    await assert.rejects(engine("/payments/send",{reviewId:"test",confirmed:true}),/network mismatch/);
    network="signet"; process.env.BITCOIN_NETWORK="main"; process.env.ALLOW_MAINNET="true";
    await assert.rejects(engine("/wallets/create",{label:"test",count:1}),/network mismatch/);
    assert.equal(posts,0);
  } finally {
    for (const [key,value] of Object.entries({VAULT_ENGINE_URL:old.url,VAULT_ENGINE_TOKEN:old.token,BITCOIN_NETWORK:old.network,ALLOW_MAINNET:old.allow})) {
      if(value===undefined) delete process.env[key]; else process.env[key]=value;
    }
    await new Promise<void>(r=>server.close(()=>r()));
  }
});
