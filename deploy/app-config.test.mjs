import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "./app-config.mjs";
import { readFileSync } from "node:fs";

const valid = {
  NODE_ENV: "production", PORT: "3000", BITCOIN_NETWORK: "signet",
  PUBLIC_ORIGIN: "https://vault.example.com", VAULT_OWNER_VERIFIER: "a".repeat(64),
  CF_ACCOUNT_ID: "a".repeat(32), CF_D1_DATABASE_ID: "11111111-1111-1111-1111-111111111111",
  CF_API_TOKEN: "test-only", VAULT_STATIC_DIR: "/app/public",
  SMTP_PASSWORD: "test-only-smtp", SECURITY_ALERT_FROM: "vault@example.test",
  SECURITY_ALERT_TO: "owner@example.test",
};
test("valid disconnected test-network deployment", () => assert.deepEqual(validateConfig(valid), []));
test("Coolify app template is complete after filling only its three required secret fields", () => {
  const template = Object.fromEntries(readFileSync(new URL("./coolify.env.example", import.meta.url), "utf8")
    .split("\n").filter(line => /^[A-Z][A-Z0-9_]*=/.test(line))
    .map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
  assert.deepEqual(validateConfig({
    ...template, VAULT_OWNER_VERIFIER: "a".repeat(64), CF_API_TOKEN: "test-only", SMTP_PASSWORD: "test-only",
  }), []);
  for (const variable of ["VAULT_OWNER_VERIFIER", "CF_API_TOKEN", "SMTP_PASSWORD"]) {
    assert.ok(validateConfig(template).some(error => error.includes(variable)));
  }
  assert.equal(template.PORT, "3000");
  assert.equal(template.BITCOIN_NETWORK, "signet");
  for (const signerOnly of ["BTC_RPC_URL", "COLD_DESCRIPTOR", "REPLICA_TOKEN", "ENGINE_DATA_DIR"]) {
    assert.ok(!(signerOnly in template));
  }
});
test("reject unsafe or incomplete configuration without leaking values", () => {
  for (const [name, value] of [
    ["NODE_ENV", "development"], ["PORT", "0"], ["PORT", "65536"],
    ["BITCOIN_NETWORK", "mainnet"], ["PUBLIC_ORIGIN", "http://vault.example.com"],
    ["PUBLIC_ORIGIN", "https://vault.example.com/"], ["VAULT_OWNER_VERIFIER", "private-login-key"],
    ["CF_API_TOKEN", ""], ["CF_ACCOUNT_ID", ""], ["CF_D1_DATABASE_ID", ""], ["VAULT_STATIC_DIR", ""],
    ["CF_D1_DATABASE_ID", "-".repeat(36)], ["SMTP_PASSWORD", ""],
    ["SMTP_PORT", "587"], ["SMTP_HOST", "untrusted.example"], ["SMTP_USER", "owner@example.test"],
    ["SECURITY_ALERT_FROM", ""], ["SECURITY_ALERT_TO", "a@example.test,b@example.test"],
    ["TRUSTED_PROXY_IPS", "true"], ["TRUSTED_PROXY_IPS", "0.0.0.0/0"],
  ]) {
    const errors = validateConfig({ ...valid, [name]: value });
    assert.ok(errors.some(e => e.includes(name)), name);
    assert.ok(!errors.join().includes("private-login-key"));
  }
});
test("signer requires token and private HTTP or HTTPS origin", () => {
  for (const url of ["http://vault-engine:9090", "http://127.0.0.1:9090", "https://engine.example.com"]) {
    assert.deepEqual(validateConfig({ ...valid, VAULT_ENGINE_URL: url, VAULT_ENGINE_TOKEN: "x".repeat(32) }), []);
  }
  for (const url of ["http://100.31.52.6:9090", "https://user:secret@engine.example.com", "https://engine.example.com/path"]) {
    assert.ok(validateConfig({ ...valid, VAULT_ENGINE_URL: url, VAULT_ENGINE_TOKEN: "x".repeat(32) }).some(e => e.includes("VAULT_ENGINE_URL")));
  }
  assert.ok(validateConfig({ ...valid, VAULT_ENGINE_URL: "http://vault-engine:9090" }).some(e => e.includes("VAULT_ENGINE_TOKEN")));
  assert.ok(validateConfig({ ...valid, VAULT_ENGINE_TOKEN: "x".repeat(32) }).some(e => e.includes("VAULT_ENGINE_URL")));
});
