import { test } from "node:test";
import assert from "node:assert/strict";
import { smtpOptions, mailAddresses } from "./smtp";

test("Cloudflare SMTP requires validated implicit TLS and independent credentials", () => {
  const env = { SMTP_PASSWORD: "disposable-test-value" };
  const options = smtpOptions(env);
  assert.equal(options.host, "smtp.mx.cloudflare.net");
  assert.equal(options.port, 465);
  assert.equal(options.secure, true);
  assert.equal(options.tls.rejectUnauthorized, true);
  assert.equal(options.tls.minVersion, "TLSv1.2");
  assert.equal(options.auth.user, "api_token");
  assert.equal(options.debug, false);
  for (const invalid of [
    {}, { CF_API_TOKEN: "not-an-email-token" },
    { ...env, SMTP_PORT: "587" }, { ...env, SMTP_HOST: "untrusted.test" },
    { ...env, SMTP_USER: "wrong-user" },
  ]) assert.throws(() => smtpOptions(invalid));
});
test("security mail only accepts one plain sender and recipient", () => {
  const valid = { SECURITY_ALERT_FROM: "vault@example.test", SECURITY_ALERT_TO: "owner@example.test" };
  assert.equal(mailAddresses(valid).to, valid.SECURITY_ALERT_TO);
  for (const to of ["", "a@example.test,b@example.test", "a@example.test\r\nBcc:b@example.test"]) {
    assert.throws(() => mailAddresses({ ...valid, SECURITY_ALERT_TO: to }));
  }
});
