// Run after building API and dashboard. No real credentials or remote services.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
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
    // The entrypoint's D1 check requires a real deployment and is not bypassed
    // in the image. This test only isolates the built runtime and its routes.
    child = spawn(process.execPath, ["dist/index.mjs"], {
      cwd: root,
      env: { NODE_ENV: "production", PORT: String(port), BITCOIN_NETWORK: "signet", VAULT_STATIC_DIR: path.join(root, "public") },
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
    assert.equal((await fetch(base + "/offline-keygen.html")).status, 200);
    assert.equal((await fetch(base + "/api/not-a-route")).status, 404);
    assert.equal((await fetch(base + "/missing.js")).status, 404);
    assert.equal((await fetch(base + "/api/vault/dashboard")).status, 401);
  } finally {
    if (child && child.exitCode === null) child.kill("SIGTERM");
    if (stopped) await stopped;
    await rm(root, { recursive: true, force: true });
  }
});
