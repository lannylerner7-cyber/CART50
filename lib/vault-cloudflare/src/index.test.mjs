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
test("replica is authenticated, whitelisted, bounded and acknowledged only after D1 write", async () => {
  const f = fixture();
  try {
    assert.equal((await worker.fetch(new Request("https://metadata.example/replica"), f.env)).status, 401);
    const c = checkpoint(1); c.data.privateKey = "must-not-be-forwarded";
    assert.equal((await worker.fetch(f.request("/replicate", "POST", JSON.stringify(c)), f.env)).status, 202);
    assert.equal(f.messages[0].data.privateKey, undefined);
    assert.deepEqual(await (await worker.fetch(f.request("/replica"), f.env)).json(), {sequence: 0});
    let acked = false;
    await worker.queue({messages:[{body:f.messages[0], ack(){acked=true}, retry(){assert.fail("unexpected retry")}}]}, f.env);
    assert.ok(acked);
    assert.deepEqual(await (await worker.fetch(f.request("/replica"), f.env)).json(), {sequence: 1});
    assert.equal((await worker.fetch(f.request("/replicate","POST","x".repeat(4097)),f.env)).status,413);
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
