import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mountDashboard } from "./static";

test("single-origin container routing keeps API and missing assets out of SPA fallback", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vault-static-"));
  writeFileSync(path.join(dir, "index.html"), "<html>vault-test</html>");
  writeFileSync(path.join(dir, "app.js"), "/* asset */");
  writeFileSync(path.join(dir, "offline-keygen.html"), "<html>offline-generator</html>");
  const app = express();
  app.get("/api/healthz", (_req, res) => { res.json({ status: "ok" }); });
  mountDashboard(app, dir);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    for (const route of ["/", "/wallets", "/settings/security"]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.match(await response.text(), /vault-test/);
    }
    assert.deepEqual(await (await fetch(base + "/api/healthz")).json(), { status: "ok" });
    const missingAPI = await fetch(base + "/api/missing");
    assert.equal(missingAPI.status, 404);
    assert.match(missingAPI.headers.get("content-type") ?? "", /json/);
    for (const route of ["/missing.js", "/.env"]) assert.equal((await fetch(base + route)).status, 404);
    assert.match(await (await fetch(base + "/app.js")).text(), /asset/);
    assert.match(await (await fetch(base + "/offline-keygen.html")).text(), /offline-generator/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    rmSync(dir, { recursive: true });
  }
});
