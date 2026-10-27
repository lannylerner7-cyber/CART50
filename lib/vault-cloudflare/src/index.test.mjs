import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import worker from "./index.ts";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE replica(id TEXT PRIMARY KEY, sequence INTEGER NOT NULL, data TEXT NOT NULL)");
  const messages = [];
  const env = {
    REPLICA_TOKEN: "test-only-token-not-used-live-123456789",
    MARKET_ENABLED: "false",
    REPLICA_NETWORK: "signet",
    REPLICA: { send: async c => messages.push(c) },
    DB: { prepare(sql) {
      let params = [];
      return {
        bind(...p) { params = p; return this; },
        async run() { return db.prepare(sql).run(...params); },
        async all() { return {results: db.prepare(sql).all(...params)}; },
      };
    }},
  };
  const request = (path, method = "GET", body) => new Request("https://metadata.example" + path, {
    method, headers: {Authorization: `Bearer ${env.REPLICA_TOKEN}`}, ...(body === undefined ? {} : {body}),
  });
  return {db, env, messages, request};
}
const checkpoint = sequence => ({id: "engine-health", sequence, data: {
  network: "signet", blocks: 1, recoveryStatus: "starting", lastSync: "",
}});
test("encrypted backup download requires auth, preserves bytes, and fails explicitly", async () => {
  const f = fixture();
  const bytes = Buffer.concat([Buffer.from("VAULTB01"), Buffer.alloc(40, 7)]);
  let reads = 0;
  f.env.BACKUPS = { async get(key) {
    reads++;
    assert.ok(key.startsWith('backups/signet/'));
    if (key.endsWith('/missing.vault')) return null;
    return {size: bytes.length, body: new Response(bytes).body};
  }};
  try {
    assert.equal((await worker.fetch(new Request("https://metadata.example/backups/test.vault"), f.env)).status, 401);
    assert.equal(reads, 0);
    const response = await worker.fetch(f.request("/backups/test.vault"), f.env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    assert.equal((await worker.fetch(f.request("/backups/missing.vault"), f.env)).status, 404);
    assert.equal((await worker.fetch(f.request("/backups/other.json"), f.env)).status, 404);
    f.env.BACKUPS.get = async () => { throw new Error("R2 unavailable"); };
    assert.equal((await worker.fetch(f.request("/backups/test.vault"), f.env)).status, 503);
  } finally { f.db.close(); }
});
test("replica is authenticated, whitelisted, bounded and acknowledged only after D1 write", async () => {
  const f = fixture();
  try {
    assert.equal((await worker.fetch(new Request("https://metadata.example/replica"), f.env)).status, 401);
    const c = checkpoint(1); c.data.privateKey = "must-not-be-forwarded";
    assert.equal((await worker.fetch(f.request("/replicate", "POST", JSON.stringify(c)), f.env)).status, 202);
    assert.equal(f.messages[0].data.privateKey, undefined);
    assert.deepEqual(await (await worker.fetch(f.request("/replica"), f.env)).json(), {sequence: 0, network: "signet"});
    let acked = false;
    await worker.queue({messages:[{body:f.messages[0], ack(){acked=true}, retry(){assert.fail("unexpected retry")}}]}, f.env);
    assert.ok(acked);
    assert.deepEqual(await (await worker.fetch(f.request("/replica"), f.env)).json(), {sequence: 1, network: "signet"});
    assert.equal((await worker.fetch(f.request("/replicate","POST","x".repeat(4097)),f.env)).status,413);
  } finally { f.db.close(); }
});
test("network namespaces prevent shared D1/R2 collisions and legacy records remain scoped", async () => {
  const f = fixture();
  try {
    const main = {...f.env, REPLICA_NETWORK: "main"};
    const c = checkpoint(100);
    assert.equal((await worker.fetch(f.request("/replicate", "POST", JSON.stringify(c)), main)).status, 400);
    f.db.prepare("INSERT INTO replica VALUES(?,?,?)").run("engine-health", 80, JSON.stringify(c.data));
    await worker.queue({messages:[{body:c,ack(){},retry(){assert.fail()}}]},f.env);
    const mc = {...c, sequence: 3, data: {...c.data, network: "main"}};
    await worker.queue({messages:[{body:mc,ack(){},retry(){assert.fail()}}]},main);
    assert.equal((await (await worker.fetch(f.request("/replica"), main)).json()).sequence, 3);
    assert.equal((await (await worker.fetch(f.request("/replica"), f.env)).json()).sequence, 100);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM replica").get().n, 3);
    const keys = [];
    const backups = {async get(key){keys.push(key); return null;}};
    await worker.fetch(f.request("/backups/same.vault"), {...main,BACKUPS:backups});
    await worker.fetch(f.request("/backups/same.vault"), {...f.env,BACKUPS:backups});
    assert.deepEqual(keys, ["backups/main/same.vault", "backups/signet/same.vault"]);
    assert.equal((await worker.fetch(f.request("/replica"), {...f.env,REPLICA_NETWORK:undefined})).status, 503);
    let retried = false;
    await worker.queue({messages:[{body:c,ack(){assert.fail()},retry(){retried=true}}]},main);
    assert.ok(retried);
  } finally { f.db.close(); }
});
test("out-of-order and duplicate deliveries cannot lower D1 sequence; outages retry", async () => {
  const f = fixture();
  try {
    for (const seq of [10, 4, 10, 9]) {
      await worker.queue({messages:[{body:checkpoint(seq),ack(){},retry(){assert.fail("unexpected retry")}}]}, f.env);
    }
    assert.equal(f.db.prepare("SELECT sequence FROM replica").get().sequence,10);
    f.env.DB.prepare = () => { throw new Error("outage"); };
    let retried = false;
    await worker.queue({messages:[{body:checkpoint(11),ack(){assert.fail("ack during outage")},retry(){retried=true}}]},f.env);
    assert.ok(retried);
  } finally { f.db.close(); }
});
