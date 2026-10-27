import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { operationalSettings, engine } from "./engine";

test("policy comes from signer, never stale metadata; outages fail closed", async () => {
  let available = true;
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/status") { res.end(JSON.stringify({ network: "main", connected: true })); return; }
    assert.equal(req.url, "/settings");
    res.statusCode = available ? 200 : 503;
    res.end(JSON.stringify(available ? {
      sweepsPaused: false, feeRateCeiling: "2", totalFeeCeilingSats: "1000", hotExposureLimitSats: "100000",
    } : { error: "signer offline" }));
  }).listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const oldURL = process.env.VAULT_ENGINE_URL;
  const oldToken = process.env.VAULT_ENGINE_TOKEN;
  const oldNetwork = process.env.BITCOIN_NETWORK, oldAllow = process.env.ALLOW_MAINNET;
  process.env.BITCOIN_NETWORK = "main"; process.env.ALLOW_MAINNET = "true";
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
    if (oldNetwork === undefined) delete process.env.BITCOIN_NETWORK; else process.env.BITCOIN_NETWORK = oldNetwork;
    if (oldAllow === undefined) delete process.env.ALLOW_MAINNET; else process.env.ALLOW_MAINNET = oldAllow;
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
    await assert.rejects(engine("/payments/send",{reviewId:"test",confirmed:true}),/network mismatch|not commissioned/);
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

test("Live never reads a legacy Signet signer; Sandbox requires independent explicit connection", async () => {
  const keys = ["BITCOIN_NETWORK", "ALLOW_MAINNET", "VAULT_ENGINE_URL", "VAULT_ENGINE_TOKEN", "SANDBOX_SIGNET_ENABLED", "SANDBOX_ENGINE_URL", "SANDBOX_ENGINE_TOKEN"];
  const old = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  let requests = 0, network = "signet";
  const server = createServer((req, res) => {
    requests++;
    assert.equal(req.headers.authorization, "Bearer sandbox-only");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(req.url === "/status" ? { network, connected: true } : []));
  }).listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    Object.assign(process.env, { BITCOIN_NETWORK: "signet", VAULT_ENGINE_URL: url, VAULT_ENGINE_TOKEN: "legacy" });
    await assert.rejects(engine("/wallets"), /not commissioned/);
    assert.equal(requests, 0);
    delete process.env.SANDBOX_SIGNET_ENABLED;
    await assert.rejects(engine("/wallets", undefined, "sandbox"), /disabled/);
    Object.assign(process.env, { SANDBOX_SIGNET_ENABLED: "true", SANDBOX_ENGINE_URL: url, SANDBOX_ENGINE_TOKEN: "sandbox-only" });
    assert.deepEqual(await engine("/wallets", undefined, "sandbox"), []);
    network = "main";
    const before = requests;
    await assert.rejects(engine("/payments/send", { confirmed: true }, "sandbox"), /network mismatch/);
    assert.equal(requests - before, 1); // status only, no mutation sent
    process.env.BITCOIN_NETWORK = "main"; process.env.ALLOW_MAINNET = "true";
    await assert.rejects(engine("/wallets", undefined, "sandbox"), /separate signer/);
  } finally {
    for (const [key, value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await new Promise<void>(r => server.close(() => r()));
  }
});
