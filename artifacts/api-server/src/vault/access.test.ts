import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

test("owner unlock, origin/CSRF defenses, alert persistence and revocation", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "vault-access-test-"));
  const bytes = randomBytes(164);
  process.env.VAULT_DATA_DIR = temporary;
  process.env.VAULT_OWNER_VERIFIER = createHash("sha256").update(bytes).digest("hex");
  process.env.PUBLIC_ORIGIN = "https://vault.test";
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
    assert.equal((await call("/passkeys/options", "POST", {})).status, 401);
    assert.equal((await call("/login", "POST", {credential: randomBytes(164).toString("base64url")})).status, 401);
    const login = await call("/login", "POST", {credential: bytes.toString("base64url")});
    assert.equal(login.status, 200);
    const setCookie = login.headers.get("set-cookie")!;
    assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /Secure/); assert.match(setCookie, /SameSite=Strict/);
    cookie = setCookie.split(";")[0]!;
    const session = await login.json() as { csrfToken: string };
    csrf = session.csrfToken;
    assert.equal((await call("/alerts", "POST", {}, {Origin: "https://untrusted.test"})).status, 403);
    assert.equal((await call("/alerts", "POST", {}, {"X-CSRF-Token": "wrong"})).status, 403);
    const created = await call("/alerts", "POST", {name: "Test threshold",kind:"below",threshold:100,windowMinutes:60,cooldownMinutes:60,enabled:true});
    assert.equal(created.status, 200);
    const alert = await created.json() as {id:string};
    assert.equal((await (await call("/alerts")).json() as unknown[]).length, 1);
    assert.equal((await call(`/alerts/${alert.id}`, "DELETE")).status, 200);
    assert.equal((await (await call("/alerts")).json() as unknown[]).length, 0);
    assert.equal((await call("/security/revoke", "POST", {})).status, 200);
    assert.equal((await call("/dashboard")).status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    rmSync(temporary, {recursive:true,force:true});
  }
});
