import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "./app-config.mjs";

const valid = {
  NODE_ENV: "production", PORT: "3000", BITCOIN_NETWORK: "signet",
  PUBLIC_ORIGIN: "https://vault.example.com", VAULT_OWNER_VERIFIER: "a".repeat(64),
  CF_ACCOUNT_ID: "a".repeat(32), CF_D1_DATABASE_ID: "11111111-1111-1111-1111-111111111111",
  CF_API_TOKEN: "test-only", VAULT_STATIC_DIR: "/app/public",
};
test("valid disconnected test-network deployment", () => assert.deepEqual(validateConfig(valid), []));
test("reject unsafe or incomplete configuration without leaking values", () => {
  for (const [name, value] of [
    ["NODE_ENV", "development"], ["PORT", "0"], ["PORT", "65536"],
    ["BITCOIN_NETWORK", "mainnet"], ["PUBLIC_ORIGIN", "http://vault.example.com"],
    ["PUBLIC_ORIGIN", "https://vault.example.com/"], ["VAULT_OWNER_VERIFIER", "private-login-key"],
    ["CF_API_TOKEN", ""], ["CF_ACCOUNT_ID", ""], ["CF_D1_DATABASE_ID", ""], ["VAULT_STATIC_DIR", ""],
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
