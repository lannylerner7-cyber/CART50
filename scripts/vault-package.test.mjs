// Run after building API and dashboard. No real credentials or remote services.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";

test("standalone SMTP CLI checks config without connecting and never prints credentials", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault-smtp-package-"));
  try {
    await cp("artifacts/api-server/dist", path.join(root, "dist"), { recursive: true });
    const fixture = "disposable-secret-must-not-appear";
    const env = {
      PATH: process.env.PATH, SMTP_PASSWORD: fixture,
      SECURITY_ALERT_FROM: "vault@example.test", SECURITY_ALERT_TO: "owner@example.test",
    };
    for (const args of [[], ["--check-config"], ["--unknown"]]) {
      const result = spawnSync(process.execPath, [path.join(root, "dist/smtp-check.mjs"), ...args],
        { cwd: root, env, encoding: "utf8", timeout: 5000 });
      assert.equal(result.status, args[0] === "--unknown" ? 1 : 0);
      assert.ok(!(result.stdout + result.stderr).includes(fixture));
    }
    const missing = spawnSync(process.execPath, [path.join(root, "dist/smtp-check.mjs")],
      { cwd: root, env: { ...env, SMTP_PASSWORD: "" }, encoding: "utf8", timeout: 5000 });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /FAIL/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
import { setTimeout as delay } from "node:timers/promises";

test("standalone runtime works without workspace node_modules or Replit routing", { timeout: 20000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault-package-"));
  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  let child, stopped, output = "";
  try {
    await cp("artifacts/api-server/dist", path.join(root, "dist"), { recursive: true });
    await cp("artifacts/bitcoin-vault/dist/public", path.join(root, "public"), { recursive: true });
    // Missing production D1 configuration must stop the bundle before listening.
    const missing = spawnSync(process.execPath, ["dist/index.mjs"], {
      cwd: root, encoding: "utf8", timeout: 5000,
      env: { NODE_ENV: "production", PORT: String(port) },
    });
    assert.equal(missing.status, 1);
    assert.match(missing.stdout + missing.stderr, /Production requires Cloudflare D1/);
    // Test-only D1 transport, backed by real SQLite. No network or real credentials.
    // This preload is never packaged into the application.
    await writeFile(path.join(root, "fixture.mjs"), `
      import { DatabaseSync } from 'node:sqlite';
      const db = new DatabaseSync(':memory:');
      globalThis.fetch = async (url, options) => {
        if (!String(url).startsWith('https://api.cloudflare.com/')) throw new Error('Unexpected fixture network request');
        const { sql, params } = JSON.parse(options.body);
        const results = db.prepare(sql).all(...(params || []));
        return Response.json({success:true,result:[{success:true,results}]});
      };
    `);
    child = spawn(process.execPath, ["--import", "./fixture.mjs", "dist/index.mjs"], {
      cwd: root,
      env: { NODE_ENV: "production", PORT: String(port), BITCOIN_NETWORK: "signet", VAULT_STATIC_DIR: path.join(root, "public"),
        CF_ACCOUNT_ID: "fixture", CF_D1_DATABASE_ID: "fixture", CF_API_TOKEN: "fixture-only" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    stopped = once(child, "exit");
    child.stdout.on("data", data => { output += data; });
    child.stderr.on("data", data => { output += data; });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (child.exitCode !== null) throw new Error("Bundle exited: " + output);
      try {
        const response = await fetch(base + "/api/healthz", { signal: AbortSignal.timeout(500) });
        if (response.ok) { ready = true; break; }
      } catch { /* bounded wait for this test-only server */ }
      await delay(100);
    }
    assert.ok(ready, output);
    const html = await (await fetch(base + "/")).text();
    assert.match(html, /<html/);
    const asset = html.match(/src="([^"]+\.js)"/)?.[1];
    assert.ok(asset);
    assert.equal((await fetch(base + asset)).status, 200);
    assert.equal((await fetch(base + "/settings")).status, 200);
    for (const route of ["/offline-keygen.html", "/signet-setup.html", "/%73ignet-setup.html"]) {
      assert.equal((await fetch(base + route)).status, 404);
    }
    assert.equal((await fetch(base + "/api/not-a-route")).status, 404);
    assert.equal((await fetch(base + "/missing.js")).status, 404);
    assert.equal((await fetch(base + "/api/vault/dashboard")).status, 401);
  } finally {
    if (child && child.exitCode === null) child.kill("SIGTERM");
    if (stopped) await stopped;
    await rm(root, { recursive: true, force: true });
  }
});
