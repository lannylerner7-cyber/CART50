import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import * as API from "@workspace/api-zod";
import { checkoutCommand, checkoutInput, walletKeyInput } from "./input-schemas";

function sizeFailure(result: z.ZodSafeParseResult<unknown>, path: string[] = []) {
  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.issues.length, 1);
  assert.equal(result.error.issues[0].code, "too_big");
  assert.deepEqual(result.error.issues[0].path, path);
}

test("oversized generated and server arrays reject before reading any entry", () => {
  // A getter makes this deterministic: merely reading an entry would fail the test.
  const oversized = new Array(100000);
  Object.defineProperty(oversized, 0, { get() { throw Error("Entry was visited"); } });
  sizeFailure(API.RotateDeveloperWalletKeyBody.safeParse({ scopes: oversized }), ["scopes"]);
  sizeFailure(walletKeyInput.safeParse({ scopes: oversized }), ["scopes"]);
  sizeFailure(checkoutCommand.safeParse({ returnUrls: oversized }), ["returnUrls"]);
  assert.equal(walletKeyInput.safeParse({ scopes: ["wallet:read"] }).success, true);
  assert.equal(checkoutCommand.safeParse({ returnUrls: ["https://example.com/return"] }).success, true);
});

test("patched array, set and map caps stop before element refinements, sync and async", async () => {
  let visits = 0;
  const entry = z.unknown().superRefine(() => { visits++; });
  const cases = [
    [z.array(entry).max(4), Array.from({ length: 10000 }, (_, i) => i)],
    [z.set(entry).max(4), new Set(Array.from({ length: 10000 }, (_, i) => i))],
    [z.map(entry, entry).max(4), new Map(Array.from({ length: 10000 }, (_, i) => [i, i]))],
  ] as const;
  for (const [schema, input] of cases) {
    sizeFailure(schema.safeParse(input));
    sizeFailure(await schema.safeParseAsync(input));
  }
  assert.equal(visits, 0);
});

test("collection boundaries, strict server objects and checkout normalization remain compatible", () => {
  const scopes = ["wallet:read", "wallet:write", "wallet:fees", "wallet:simulate"];
  assert.deepEqual(walletKeyInput.parse({ scopes }), { scopes });
  for (const input of [{ scopes: [] }, { scopes: [...scopes, "wallet:read"] }, { scopes: ["admin"] }, { scopes, extra: true }]) {
    assert.equal(walletKeyInput.safeParse(input).success, false);
  }
  assert.equal(checkoutCommand.safeParse({ returnUrls: Array(5).fill("https://example.com") }).success, true);
  sizeFailure(checkoutCommand.safeParse({ returnUrls: Array(6).fill("https://example.com") }), ["returnUrls"]);
  assert.equal(checkoutCommand.safeParse({ extra: true }).success, false);
  const input = { amount_sats: 10000000, reference: " order ", return_url: "https://example.com" };
  assert.deepEqual(checkoutInput.parse(input), { ...input, reference: "order" });
  for (const amount_sats of [0, -1, 1.5, 10000001, "1", Infinity, NaN]) {
    assert.equal(checkoutInput.safeParse({ ...input, amount_sats }).success, false);
  }
});

test("generated coercion, records, optionals, stripping and response nullability retain contracts", () => {
  assert.deepEqual(API.GetWalletFoundationViewQueryParams.parse({ kind: "wallet", after: "12" }), { kind: "wallet", after: 12 });
  assert.deepEqual(API.GetWalletFoundationViewQueryParams.parse({ kind: "wallet" }), { kind: "wallet" });
  assert.deepEqual(API.WalletFoundationCommandBody.parse({ action: "customer", data: { arbitrary: { nested: true } }, extra: 1 }),
    { action: "customer", data: { arbitrary: { nested: true } } });
  assert.deepEqual(API.RotateDeveloperWalletKeyResponse.parse({ key: null, revoked: true }), { key: null, revoked: true });
  assert.equal(API.RotateDeveloperWalletKeyResponse.safeParse({ revoked: true }).success, false);
  assert.equal(API.CreateWalletsBody.safeParse({ label: "batch", count: 1.5 }).success, false);
});
