import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";

test("owner unlock, origin/CSRF defenses, alert persistence and revocation", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "vault-access-test-"));
  const bytes = randomBytes(64);
  // Never allow this test to touch the configured live D1 store.
  delete process.env.CF_API_TOKEN;
  delete process.env.CF_ACCOUNT_ID;
  delete process.env.CF_D1_DATABASE_ID;
  process.env.VAULT_DATA_DIR = temporary;
  process.env.VAULT_OWNER_VERIFIER = createHash("sha256").update(bytes).digest("hex");
  process.env.PUBLIC_ORIGIN = "https://vault.test";
  const seed = new DatabaseSync(join(temporary, "metadata.sqlite"));
  seed.exec("CREATE TABLE vault_state (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL)");
  seed.prepare("INSERT INTO vault_state VALUES(1,0,?)").run(JSON.stringify({
    credentialHash: "legacy-verifier", sessions: [{ hash: "legacy-session" }],
    passkeys: [{ id: "legacy-passkey" }], alerts: [], notifications: [],
    settings: { sweepsPaused: true, feeRateCeiling: "42", totalFeeCeilingSats: "0", hotExposureLimitSats: "0" },
  }));
  seed.close();
  const { default: app } = await import("../app");
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/vault`;
  let cookie = "", csrf = "";
  const call = (path: string, method = "GET", data?: unknown, extra?: Record<string, string>) => fetch(base + path, {
    method, headers: { "Content-Type": "application/json", Origin: "https://vault.test", Cookie: cookie, "X-CSRF-Token": csrf, ...extra },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  try {
    assert.equal((await call("/dashboard")).status, 401);
    const { readState } = await import("./store");
    const migrated = await readState();
    assert.equal(migrated.authVersion, 2);
    assert.equal(migrated.credentialHash, null);
    assert.deepEqual(migrated.sessions, []);
    assert.deepEqual(migrated.passkeys, []);
    assert.equal(migrated.settings.feeRateCeiling, "42");
    assert.equal((await call("/passkeys/options", "POST", {})).status, 401);
    assert.equal((await call("/login", "POST", {credential: randomBytes(164).toString("base64url")})).status, 401);
    assert.equal((await call("/login", "POST", {credential: randomBytes(64).toString("base64url")})).status, 401);
    const protectedRoutes = [
      ["GET", "/dashboard"], ["GET", "/wallets"], ["POST", "/wallets"],
      ["GET", "/wallets/test"], ["PATCH", "/wallets/test"], ["DELETE", "/wallets/test"],
      ["GET", "/transactions"], ["GET", "/settings"], ["PUT", "/settings"],
      ["POST", "/node/reconnect"], ["GET", "/market"], ["GET", "/alerts"],
      ["POST", "/alerts"], ["PUT", "/alerts/test"], ["DELETE", "/alerts/test"],
      ["GET", "/notifications"], ["POST", "/notifications/test/read"], ["GET", "/explorer"],
      ["POST", "/payments/review"], ["POST", "/payments/send"],
      ["POST", "/security/revoke"], ["POST", "/security/rotate"], ["GET", "/passkeys"],
      ["POST", "/passkeys/options"], ["POST", "/passkeys/verify"], ["DELETE", "/passkeys/test"],
    ];
    for (const [method, path] of protectedRoutes) {
      assert.equal((await call(path!, method!, method === "GET" ? undefined : {})).status, 401, `${method} ${path}`);
    }
    assert.equal((await call("/logout", "POST", {})).status, 200);
    assert.equal((await call("/logout", "POST", {}, {Origin: "https://untrusted.test"})).status, 403);
    const login = await call("/login", "POST", {credential: bytes.toString("base64url")});
    assert.equal(login.status, 200);
    const setCookie = login.headers.get("set-cookie")!;
    assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /Secure/); assert.match(setCookie, /SameSite=Strict/);
    cookie = setCookie.split(";")[0]!;
    const session = await login.json() as { csrfToken: string };
    csrf = session.csrfToken;
    assert.equal((await call("/logout", "POST", {}, {"X-CSRF-Token": "wrong"})).status, 403);
    assert.equal((await (await call("/session")).json() as {authenticated:boolean}).authenticated, true);
    assert.equal((await call("/alerts", "POST", {}, {Origin: "https://untrusted.test"})).status, 403);
    assert.equal((await call("/alerts", "POST", {}, {"X-CSRF-Token": "wrong"})).status, 403);
    const created = await call("/alerts", "POST", {name: "Test threshold",kind:"below",threshold:100,windowMinutes:60,cooldownMinutes:60,enabled:true});
    assert.equal(created.status, 200);
    const alert = await created.json() as {id:string};
    assert.equal((await (await call("/alerts")).json() as unknown[]).length, 1);
    assert.equal((await call(`/alerts/${alert.id}`, "DELETE")).status, 200);
    assert.equal((await (await call("/alerts")).json() as unknown[]).length, 0);
    const logout = await call("/logout", "POST", {});
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie") ?? "", /__Host-vault_session=;/);
    assert.equal((await call("/dashboard")).status, 401);
    assert.equal((await readState()).sessions.length, 0);
    assert.equal((await call("/logout", "POST", {})).status, 200);
    const relogin = await call("/login", "POST", {credential: bytes.toString("base64url")});
    assert.equal(relogin.status, 200);
    cookie = relogin.headers.get("set-cookie")!.split(";")[0]!;
    csrf = (await relogin.json() as {csrfToken:string}).csrfToken;
    assert.equal((await call("/security/revoke", "POST", {})).status, 200);
    assert.equal((await call("/dashboard")).status, 401);
    assert.equal((await call("/logout", "POST", {})).status, 200);
    const expiredLogin = await call("/login", "POST", {credential: bytes.toString("base64url")});
    cookie = expiredLogin.headers.get("set-cookie")!.split(";")[0]!;
    csrf = (await expiredLogin.json() as {csrfToken:string}).csrfToken;
    const { changeState } = await import("./store");
    await changeState(s => { for (const record of s.sessions) record.expiresAt = new Date(0).toISOString(); });
    assert.equal((await call("/dashboard")).status, 401);
    const expiredLogout = await call("/logout", "POST", {});
    assert.equal(expiredLogout.status, 200);
    assert.match(expiredLogout.headers.get("set-cookie") ?? "", /__Host-vault_session=;/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    rmSync(temporary, {recursive:true,force:true});
  }
});
