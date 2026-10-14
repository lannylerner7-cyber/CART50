import test from "node:test";
import assert from "node:assert/strict";
import { ReadFlight } from "./read-flight";
import { configuredNetwork } from "./network";

test("10,000 concurrent reads share one source read without retained cache or shared mutation", async () => {
  const flight = new ReadFlight<{ balance: string }>();
  let calls = 0;
  const load = async () => { calls++; await new Promise(r => setTimeout(r, 10)); return { balance: "123" }; };
  const values = await Promise.all(Array.from({ length: 10000 }, () => flight.read(load)));
  assert.equal(calls, 1);
  values[0].balance = "changed";
  assert.equal(values[1].balance, "123");
  assert.equal((await flight.read(load)).balance, "123");
  assert.equal(calls, 2);
  await assert.rejects(flight.read(async () => { throw new Error("offline"); }), /offline/);
  assert.equal((await flight.read(load)).balance, "123");
});

test("invalidating an in-flight read cannot reuse it for later authorization", async () => {
  const flight = new ReadFlight<number>();
  let finish!: (n: number) => void;
  const before = flight.read(() => new Promise<number>(r => { finish = r; }));
  await Promise.resolve();
  flight.clear();
  assert.equal(await flight.read(async () => 2), 2);
  finish(1);
  assert.equal(await before, 1);
  assert.equal(await flight.read(async () => 3), 3);
});

test("mainnet requires exact network and explicit opt-in", () => {
  const oldNetwork = process.env.BITCOIN_NETWORK, oldAllow = process.env.ALLOW_MAINNET;
  try {
    process.env.BITCOIN_NETWORK = "main";
    delete process.env.ALLOW_MAINNET;
    assert.throws(configuredNetwork, /ALLOW_MAINNET/);
    process.env.ALLOW_MAINNET = "true";
    assert.equal(configuredNetwork(), "main");
    process.env.BITCOIN_NETWORK = "mainnet";
    assert.throws(configuredNetwork, /BITCOIN_NETWORK/);
  } finally {
    if (oldNetwork === undefined) delete process.env.BITCOIN_NETWORK; else process.env.BITCOIN_NETWORK = oldNetwork;
    if (oldAllow === undefined) delete process.env.ALLOW_MAINNET; else process.env.ALLOW_MAINNET = oldAllow;
  }
});
