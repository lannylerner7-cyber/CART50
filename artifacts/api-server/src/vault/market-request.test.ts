import test from "node:test";
import assert from "node:assert/strict";
import { marketRequest } from "./market-request";

const base = {
  MARKET_WORKER_URL: "https://price.example.test/price/bitcoin",
  MARKET_CF_ACCESS_ORIGIN: "https://price.example.test",
  MARKET_CF_ACCESS_CLIENT_ID: "disposable-id",
  MARKET_CF_ACCESS_CLIENT_SECRET: "disposable-secret",
};
test("market credentials remain on the configured HTTPS origin without redirects", () => {
  const { url, options } = marketRequest(base);
  assert.equal(url.pathname, "/price/bitcoin");
  assert.equal(options.headers["CF-Access-Client-Id"], "disposable-id");
  assert.equal(options.headers["CF-Access-Client-Secret"], "disposable-secret");
  assert.equal(options.redirect, "error");
  assert.ok(options.signal);
});
test("reject incomplete credentials, untrusted origins and insecure URLs", () => {
  for (const change of [
    { MARKET_CF_ACCESS_CLIENT_ID: "" },
    { MARKET_CF_ACCESS_CLIENT_SECRET: "" },
    { MARKET_CF_ACCESS_ORIGIN: "" },
    { MARKET_WORKER_URL: "https://other.example.test/price" },
    { MARKET_WORKER_URL: "http://price.example.test/price" },
    { MARKET_WORKER_URL: "https://user:pass@price.example.test/price" },
  ]) assert.throws(() => marketRequest({ ...base, ...change }));
});
test("public feeds remain supported without Access credentials", () => {
  const { options } = marketRequest({ MARKET_WORKER_URL: base.MARKET_WORKER_URL });
  assert.deepEqual(options.headers, { Accept: "application/json" });
  assert.equal(options.redirect, "error");
});
