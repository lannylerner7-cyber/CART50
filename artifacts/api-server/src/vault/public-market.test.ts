import test from "node:test";
import assert from "node:assert/strict";
import { fetchPublicPrice, parsePublicPrice, PUBLIC_PRICE_URL } from "./public-market";
const now = Date.now();
const body = { price: "78489.87", time: new Date(now - 1000).toISOString() };
test("preserves actual provider timestamp and source", () => {
  const q = parsePublicPrice(body, now);
  assert.equal(q.price, 78489.87);
  assert.equal(q.updatedAt, body.time);
  assert.equal(q.currency, "USD");
  assert.equal(q.history.length, 1);
});
test("rejects stale, future, missing and invalid quotes", () => {
  for (const b of [
    { ...body, time: new Date(now - 180001).toISOString() },
    { ...body, time: new Date(now + 30001).toISOString() },
    { ...body, time: "invalid" }, { price: "1" },
    ...["0", "-1", "Infinity", "NaN", ""].map(price => ({ ...body, price })),
  ]) assert.throws(() => parsePublicPrice(b, now));
});
test("public requests do not carry Access credentials and refuse redirects", async () => {
  const q = await fetchPublicPrice((async (url, init) => {
    assert.equal(url, PUBLIC_PRICE_URL);
    assert.deepEqual(init?.headers, { Accept: "application/json" });
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    return Response.json(body);
  }) as typeof fetch);
  assert.equal(q.available, true);
});
test("rate limits, malformed responses and outages fail explicitly", async () => {
  for (const response of [new Response("", { status: 429 }), new Response("", { status: 503 }), new Response("not json")]) {
    await assert.rejects(fetchPublicPrice((async () => response) as typeof fetch));
  }
});
