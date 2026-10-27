import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

test("sandbox HTTP isolation, session/CSRF, persistence and concurrent duplicate submission", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "vault-sandbox-test-"));
  // Isolated process and disposable metadata: never access the owner's D1.
  delete process.env.CF_API_TOKEN;
  delete process.env.CF_ACCOUNT_ID;
  delete process.env.CF_D1_DATABASE_ID;
  delete process.env.VAULT_ENGINE_URL;
  delete process.env.VAULT_ENGINE_TOKEN;
  delete process.env.SANDBOX_SIGNET_ENABLED;
  delete process.env.SANDBOX_ENGINE_URL;
  delete process.env.SANDBOX_ENGINE_TOKEN;
  process.env.NODE_ENV = "development";
  process.env.VAULT_DATA_DIR = temporary;
  const credential = randomBytes(64);
  process.env.VAULT_OWNER_VERIFIER = createHash("sha256").update(credential).digest("hex");
  process.env.PUBLIC_ORIGIN = "https://vault.test";
  const { default: app } = await import("../app");
  const { readState, changeState } = await import("./store");
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/vault`;
  let cookie = "", csrf = "";
  const call = (path: string, method = "GET", data?: unknown, extra: Record<string, string> = {}) => fetch(base + path, {
    method, headers: { Origin: "https://vault.test", "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": csrf, ...extra },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  try {
    for (const [path, method] of [["/sandbox", "GET"], ["/sandbox/address?destination=sandbox-assigned-wallet", "GET"], ["/sandbox/reviews", "POST"], ["/sandbox/payments", "POST"]]) {
      assert.equal((await call(path!, method!, method === "POST" ? {} : undefined)).status, 401);
    }
    const login = await call("/login", "POST", { credential: credential.toString("base64url") });
    assert.equal(login.status, 200);
    cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    csrf = (await login.json() as { csrfToken: string }).csrfToken;
    const session = await (await call("/session")).json() as { network: string };
    assert.equal(session.network, "main");
    const dashboard = await (await call("/dashboard")).json() as { node: { network: string; connected: boolean }; wallets: unknown[] };
    assert.equal(dashboard.node.network, "main");
    assert.equal(dashboard.node.connected, false);
    assert.deepEqual(dashboard.wallets, []);
    const signet = await (await call("/sandbox/signet")).json() as { available: boolean; wallet: unknown };
    assert.equal(signet.available, false);
    assert.equal(signet.wallet, null);
    assert.equal((await call("/sandbox/signet/payments", "POST", { reviewId: "not-approved", confirmed: true })).status, 409);
    const before = structuredClone(await readState());
    const initial = await (await call("/sandbox")).json() as { assignedAddress: string; simulatedCreditCents: number; signetAvailable: boolean };
    assert.equal(initial.simulatedCreditCents, 300000);
    assert.equal(initial.signetAvailable, false);
    assert.equal((await call("/sandbox/address?destination=bc1qnotassigned")).status, 400);
    const lookup = await call(`/sandbox/address?destination=${initial.assignedAddress}`);
    assert.equal(lookup.status, 200);
    const info = await lookup.json() as { environment: string; simulatedCreditCents: number; transactionCount: number };
    assert.equal(info.environment, "simulation");
    assert.equal(info.simulatedCreditCents, 300000);
    assert.equal(info.transactionCount, 0);
    const body = { amountCents: 2500, destination: initial.assignedAddress };
    assert.equal((await call("/sandbox/reviews", "POST", body, { Origin: "https://wrong.test" })).status, 403);
    assert.equal((await call("/sandbox/reviews", "POST", body, { "X-CSRF-Token": "wrong" })).status, 403);
    assert.equal((await call("/sandbox/reviews", "POST", { ...body, amountCents: 1.5 })).status, 400);
    assert.equal((await call("/sandbox/reviews", "POST", { ...body, destination: "bc1qnotassigned" })).status, 400);
    const reviewed = await call("/sandbox/reviews", "POST", body);
    assert.equal(reviewed.status, 200);
    const review = await reviewed.json() as { id: string };
    assert.equal("sessionHash" in review, false);
    const execute = { reviewId: review.id, confirmed: true };
    assert.equal((await call("/sandbox/payments", "POST", { ...execute, confirmed: false })).status, 400);
    const results = await Promise.all(Array.from({ length: 4 }, () => call("/sandbox/payments", "POST", execute)));
    const ids = [];
    for (const result of results) {
      assert.equal(result.status, 200);
      ids.push((await result.json() as { id: string }).id);
    }
    assert.equal(new Set(ids).size, 1);
    const after = await readState();
    assert.equal(after.sandbox?.simulatedCreditCents, 297500);
    assert.equal(after.sandbox?.transactions.length, 1);
    assert.deepEqual(after.settings, before.settings);
    assert.deepEqual(after.passkeys, before.passkeys);
    assert.deepEqual(after.alerts, before.alerts);
    assert.equal(after.credentialHash, before.credentialHash);
    // Re-fetch from persistent store, not an in-memory UI balance.
    const snapshot = await (await call("/sandbox")).json() as { simulatedCreditCents: number; transactions: unknown[] };
    assert.equal(snapshot.simulatedCreditCents, 297500);
    assert.equal(snapshot.transactions.length, 1);
    await changeState(s => { s.sessions.forEach(session => { session.expiresAt = new Date(0).toISOString(); }); });
    assert.equal((await call("/sandbox")).status, 401);
    assert.equal((await call("/sandbox/payments", "POST", execute)).status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    rmSync(temporary, { recursive: true, force: true });
  }
});
