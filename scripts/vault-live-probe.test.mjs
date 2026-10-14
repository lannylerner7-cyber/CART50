import test from "node:test";
import assert from "node:assert/strict";
import { probe, validateOrigin } from "./vault-live-probe.mjs";

test("rejects insecure origins and embedded secrets before making requests", async () => {
  for (const origin of ["http://vault.test", "https://user:secret@vault.test", "https://vault.test/path", "https://vault.test/?token=secret", "https://vault.test/#secret"]) {
    assert.throws(() => validateOrigin(origin));
    await assert.rejects(probe(origin, () => assert.fail("must not fetch")));
  }
});
test("makes exactly three unauthenticated read-only checks", async () => {
  let calls = 0;
  const result = await probe("https://vault.test", async (url, opts) => {
    assert.equal(opts.method, "GET");
    assert.equal(opts.redirect, "manual");
    assert.equal(opts.credentials, "omit");
    assert.deepEqual(opts.headers, { Accept: "application/json" });
    const status = [200, 401, 404][calls++];
    return Response.json({ status: "ok" }, { status });
  });
  assert.equal(calls, 3);
  assert.equal(result.passed, true);
});
test("rejects redirects, HTML fallback, malformed and oversized health bodies", async () => {
  for (const response of [
    new Response("", { status: 302, headers: { Location: "https://other.test" } }),
    new Response("<html/>", { status: 200 }),
    Response.json({ status: "down" }),
    new Response("invalid json", { headers: { "content-type": "application/json" } }),
    Response.json({ status: "ok", excess: "x".repeat(17000) }),
  ]) {
    let calls = 0;
    const result = await probe("https://vault.test", async () => calls++ === 0 ? response : Response.json({}, { status: calls === 2 ? 401 : 404 }));
    assert.equal(result.passed, false);
  }
});
test("does not leak response bodies or exception details", async () => {
  const result = await probe("https://vault.test", async () => { throw new Error("PRIVATE_PROVIDER_DETAIL"); });
  assert.equal(result.passed, false);
  assert.ok(!JSON.stringify(result).includes("PRIVATE_PROVIDER_DETAIL"));
});
