import { test } from "node:test";
import assert from "node:assert/strict";
import { alertCondition } from "./market";
import { credentialHash, equal } from "./auth";
import { randomBytes, createHash } from "node:crypto";

test("offline credential encoding and verifier match exactly", () => {
  const bytes = randomBytes(64);
  assert.equal(credentialHash(bytes.toString("base64url")), createHash("sha256").update(bytes).digest("hex"));
  assert.throws(() => credentialHash("short"));
  assert.throws(() => credentialHash(randomBytes(164).toString("base64url")));
  assert.equal(equal("x", "y"), false);
});
test("price alerts need a complete fresh reference window", () => {
  const now = Date.now();
  assert.equal(alertCondition("below", 100, 60, 90, now, []), true);
  assert.equal(alertCondition("below", 100, 60, 100, now, []), false);
  assert.equal(alertCondition("percent_drop", 5, 60, 90, now, []), null);
  assert.equal(alertCondition("percent_drop", 5, 60, 90, now, [{time:new Date(now-3600000).toISOString(),price:100}]), true);
  assert.equal(alertCondition("percent_drop", 5, 60, 90, now, [{time:new Date(now-7200000).toISOString(),price:100}]), null);
});
