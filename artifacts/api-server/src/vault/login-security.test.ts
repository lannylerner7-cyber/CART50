import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { State } from "./store";
import { attemptCredential, retrySeconds } from "./login-security";

const bytes = randomBytes(64), key = bytes.toString("base64url");
const verifier = createHash("sha256").update(bytes).digest("hex");
const state = (): State => ({
  credentialHash: verifier, sessions: [], passkeys: [], alerts: [], notifications: [],
  settings: { sweepsPaused: true, feeRateCeiling: "0", totalFeeCeilingSats: "0", hotExposureLimitSats: "0" },
});
test("three invalid keys, fixed hour, persisted reload and retry without bypass", () => {
  let s = state();
  const now = 10000000, ip = "192.0.2.1";
  assert.equal(attemptCredential(s, ip, "bad", now).retryAfter, 0);
  assert.equal(attemptCredential(s, ip, {}, now).retryAfter, 0);
  assert.equal(attemptCredential(s, ip, "bad", now).retryAfter, 3600);
  s = JSON.parse(JSON.stringify(s));
  assert.equal(attemptCredential(s, ip, key, now + 1000).accepted, false);
  assert.equal(retrySeconds(s, ip, now + 1000), 3599);
  assert.equal(attemptCredential(s, ip, key, now + 3600000).accepted, true);
  assert.ok(!JSON.stringify(s).includes(key));
});
test("changing IPs cannot evade overall budget; successful key resets failures", () => {
  const s = state(), now = 10000000;
  attemptCredential(s, "192.0.2.1", "bad", now);
  assert.equal(attemptCredential(s, "192.0.2.1", key, now).accepted, true);
  assert.equal(Object.keys(s.loginSecurity!.clients).length, 0);
  for (let i = 2; i < 30; i++) attemptCredential(s, `192.0.2.${i}`, "bad", now);
  assert.equal(attemptCredential(s, "198.51.100.1", key, now).retryAfter, 60);
  assert.equal(attemptCredential(s, "198.51.100.1", key, now + 60000).accepted, true);
});
test("HTTP cooldown, forged headers, trusted proxy chain and durable email retry", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-limit-"));
  process.env.VAULT_DATA_DIR = dir;
  process.env.VAULT_OWNER_VERIFIER = verifier;
  process.env.PUBLIC_ORIGIN = "https://vault.test";
  delete process.env.TRUSTED_PROXY_IPS;
  const { default: app } = await import("../app");
  const { readState, changeState } = await import("./store");
  const { deliverSecurityAlert } = await import("./security-mail");
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/vault`;
  const login = (credential: unknown, ip = "192.0.2.4") => fetch(base + "/login", {
    method: "POST", headers: { Origin: "https://vault.test", "Content-Type": "application/json",
      "X-Forwarded-For": ip, "CF-Connecting-IP": ip }, body: JSON.stringify({ credential }),
  });
  try {
    const results = await Promise.all([login("bad"), login("bad", "192.0.2.5"), login("bad", "192.0.2.6")]);
    assert.deepEqual(results.map(x => x.status).sort(), [401, 401, 429]);
    const denied = await login(key, "192.0.2.7");
    assert.equal(denied.status, 429);
    assert.ok(Number(denied.headers.get("retry-after")) >= 3599);
    const session = await (await fetch(base + "/session")).json() as { loginRetryAfterSeconds: number };
    assert.ok(session.loginRetryAfterSeconds >= 3599);
    assert.equal((await readState()).sessions.length, 0);
    // Only a deliberately trusted immediate proxy may supply a client address.
    app.set("trust proxy", ["127.0.0.1"]);
    assert.equal((await login(key, "198.51.100.2")).status, 200);
    // Leftmost spoofing cannot displace the nearest untrusted hop.
    await login("bad", "203.0.113.3, 198.51.100.8");
    await login("bad", "203.0.113.4, 198.51.100.8");
    assert.equal((await login("bad", "203.0.113.5, 198.51.100.8")).status, 429);
    process.env.SECURITY_ALERT_FROM = "vault@example.test";
    process.env.SECURITY_ALERT_TO = "owner@example.test";
    const pending = (await readState()).loginSecurity!.pending!;
    await deliverSecurityAlert(async () => { throw new Error("SMTP unavailable"); });
    assert.equal((await readState()).loginSecurity!.pending!.id, pending.id);
    await deliverSecurityAlert(async message => {
      assert.ok(!JSON.stringify(message).includes(key));
      assert.equal(message.messageId, `<vault-login-${pending.id}@example.test>`);
      return { accepted: [message.to], rejected: [], response: "250 2.0.0 Accepted" };
    });
    assert.equal((await readState()).loginSecurity!.pending, undefined);
    await changeState(s => { s.loginSecurity!.global.expires = 0; for (const c of Object.values(s.loginSecurity!.clients)) { c.expires = 0; c.blockedUntil = 0; } });
    assert.equal((await login(key, "198.51.100.8")).status, 200);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});
