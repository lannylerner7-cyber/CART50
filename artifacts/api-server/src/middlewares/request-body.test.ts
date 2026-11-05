import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { gzipSync } from "node:zlib";
import { requestBody, requestBodyErrors } from "./request-body";
import { admission } from "./admission";
import { EventEmitter } from "node:events";
import type { Request, Response } from "express";

test("admission rejects overload and releases each slot exactly once", () => {
  const gate = admission(1);
  const response = () => Object.assign(new EventEmitter(), {
    statusCode: 200, headers: {} as Record<string, string>,
    setHeader(name: string, value: string) { this.headers[name] = value; },
    status(code: number) { this.statusCode = code; return this; },
    json(_body: unknown) { return this; },
  });
  let accepted = 0;
  const first = response(), second = response(), third = response();
  const enter = (res: ReturnType<typeof response>) =>
    gate({} as Request, res as unknown as Response, () => { accepted++; });
  enter(first); enter(second);
  assert.equal(accepted, 1);
  assert.equal(second.statusCode, 503);
  assert.equal(second.headers["Retry-After"], "1");
  first.emit("finish"); first.emit("close");
  enter(third); enter(response());
  assert.equal(accepted, 2);
});

test("bounded JSON rejects compressed and oversized bodies without losing availability", async () => {
  const app = express();
  app.use(admission(4), requestBody, requestBodyErrors);
  app.post("/api/v1/checkout/sessions", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/v1/checkout/sessions`;
  try {
    const encoded = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" }, body: gzipSync('{"ok":true}') });
    assert.equal(encoded.status, 415);
    const oversized = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "a".repeat(65536) }) });
    assert.equal(oversized.status, 413);
    const normal = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(normal.status, 200);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
