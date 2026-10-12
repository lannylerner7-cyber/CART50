import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { credentialHash, equal } from "./auth";

test("164-byte access credentials round-trip canonically and match the offline verifier", () => {
  const bytes = randomBytes(164);
  const credential = bytes.toString("base64url");
  assert.equal(credential.length, 219);
  assert.equal(credentialHash(credential), createHash("sha256").update(bytes).digest("hex"));
  assert.ok(equal(credentialHash(credential), credentialHash(credential)));
  const changed = Buffer.from(bytes);
  changed[0] ^= 1;
  assert.ok(!equal(credentialHash(credential), credentialHash(changed.toString("base64url"))));
  assert.ok(!equal(credentialHash(credential), credential));
});

test("reject truncated, padded, noncanonical and wrong-sized credentials", () => {
  const credential = randomBytes(164).toString("base64url");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const last = alphabet.indexOf(credential.at(-1)!);
  const noncanonical = credential.slice(0, -1) + alphabet[last | 1];
  for (const invalid of [
    "", credential.slice(1), credential + "=", credential + "\n",
    randomBytes(163).toString("base64url"), randomBytes(165).toString("base64url"),
    "!".repeat(219), noncanonical,
  ]) assert.throws(() => credentialHash(invalid));
});
