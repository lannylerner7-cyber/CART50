// Explicitly opt-in, disposable local acceptance server. Never production data.
import { randomBytes, createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
if (process.env.VAULT_UI_FIXTURE !== "1") throw new Error("Local fixture requires explicit VAULT_UI_FIXTURE=1");
const mockEnabled = process.env.VAULT_UI_MOCK_SIGNER === "1";
for (const key of Object.keys(process.env)) {
  if (/^(CF_|VAULT_|MAINNET_|SANDBOX_|MARKET_|SMTP_)/.test(key)) delete process.env[key];
}
const directory = mkdtempSync(join(tmpdir(), "vault-ui-isolated-"));
const credential = randomBytes(64);
Object.assign(process.env, {
  NODE_ENV: "development", BITCOIN_NETWORK: "signet", ALLOW_MAINNET: "false",
  VAULT_DATA_DIR: directory, VAULT_STATIC_DIR: fileURLToPath(new URL("../artifacts/bitcoin-vault/dist/public", import.meta.url)),
  VAULT_OWNER_VERIFIER: createHash("sha256").update(credential).digest("hex"),
  PUBLIC_ORIGIN: "http://localhost:4400",
});
const credentialPath = join(directory, "disposable-test-credential.txt");
writeFileSync(credentialPath, credential.toString("base64url"), {mode: 0o600});
const token = randomBytes(32).toString("hex");
const mock = mockEnabled ? await (await import("./vault-ui-mock-signer.mts")).startMockSigner(token) : null;
if (mock) Object.assign(process.env, {
  BITCOIN_NETWORK: "main", ALLOW_MAINNET: "true", VAULT_ENGINE_URL: mock.url,
  VAULT_ENGINE_TOKEN: token, MAINNET_MONITOR_URL: mock.url, MAINNET_MONITOR_TOKEN: token,
});
const {default: app} = await import("../artifacts/api-server/src/app.ts");
const server = createServer(async (req, res) => {
  // Exists only on this loopback-only, explicitly opted-in fixture process.
  if (req.url === "/__fixture" && mock) {
    if (req.method === "POST") {
      let raw = ""; for await (const chunk of req) raw += chunk;
      const input = JSON.parse(raw || "{}");
      for (const key of ["online", "lookupError", "shortReview"] as const)
        if (typeof input[key] === "boolean") mock.state[key] = input[key];
    }
    res.setHeader("Content-Type","application/json"); res.end(JSON.stringify(mock.state)); return;
  }
  app(req, res);
}).listen(4400, "127.0.0.1", () => {
  console.log(`Disposable fixture listening http://localhost:4400; test credential file: ${credentialPath}`);
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => server.close(() => { mock?.server.close(); rmSync(directory, {recursive: true, force: true}); process.exit(0); }));
}
