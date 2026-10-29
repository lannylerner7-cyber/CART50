import test from "node:test";
import assert from "node:assert/strict";
import { marketProviderLabel } from "./market-provider";
test("provider labels describe selected configuration, never credentials or assumed Worker upstream", () => {
  assert.equal(marketProviderLabel({}), "Coinbase Exchange BTC-USD");
  assert.equal(marketProviderLabel({MARKET_PROVIDER:"coinbase"}), "Coinbase Exchange BTC-USD");
  assert.equal(marketProviderLabel({MARKET_PROVIDER:"cloudflare-worker", MARKET_WORKER_URL:"https://private.invalid", MARKET_CF_ACCESS_CLIENT_SECRET:"disposable"}), "Cloudflare market Worker");
  assert.equal(marketProviderLabel({MARKET_PROVIDER:"unknown-private-value"}), "Unsupported market provider");
});
