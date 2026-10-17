import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { ensureMetadataSchema, type SchemaQuery } from "./schema";

function fixture() {
  const db = new DatabaseSync(":memory:");
  const query: SchemaQuery = async (sql, params = []) => db.prepare(sql).all(...params) as Record<string, unknown>[];
  return { db, query };
}

test("fresh schema initializes all tables, preserves data and is repeatable", async () => {
  const { db, query } = fixture();
  try {
    await ensureMetadataSchema(query);
    db.prepare("INSERT INTO vault_state VALUES(1,7,?)").run('{"sessions":[]}');
    db.prepare("INSERT INTO prices VALUES('sample',42)").run();
    db.prepare("INSERT INTO replica VALUES('engine-health',4,'{}')").run();
    await ensureMetadataSchema(query);
    assert.equal(db.prepare("SELECT version FROM vault_state").get()?.version, 7);
    assert.equal(db.prepare("SELECT price FROM prices").get()?.price, 42);
    assert.equal(db.prepare("SELECT sequence FROM replica").get()?.sequence, 4);
    assert.equal(db.prepare("SELECT count(*) AS count FROM vault_schema_migrations").get()?.count, 1);
  } finally { db.close(); }
});

test("safe missing version is added without replacing JSON or extra columns", async () => {
  const { db, query } = fixture();
  try {
    db.exec("CREATE TABLE vault_state(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL,extra TEXT); INSERT INTO vault_state VALUES(1,'{\"passkeys\":[]}','preserve')");
    await ensureMetadataSchema(query);
    const row = db.prepare("SELECT * FROM vault_state").get();
    assert.equal(row?.version, 0);
    assert.equal(row?.data, '{"passkeys":[]}');
    assert.equal(row?.extra, "preserve");
  } finally { db.close(); }
});

test("required column can be added to an empty table", async () => {
  const { db, query } = fixture();
  try {
    db.exec("CREATE TABLE prices(time TEXT PRIMARY KEY)");
    await ensureMetadataSchema(query);
    assert.throws(() => db.prepare("INSERT INTO prices(time) VALUES('invalid')").run(), /NOT NULL/);
    assert.throws(() => db.prepare("INSERT INTO prices VALUES('invalid',-1)").run(), /CHECK/);
  } finally { db.close(); }
});

test("missing data in populated table fails before any schema repair", async () => {
  const { db, query } = fixture();
  try {
    db.exec("CREATE TABLE vault_state(id INTEGER PRIMARY KEY,version INTEGER NOT NULL); INSERT INTO vault_state VALUES(1,9)");
    await assert.rejects(ensureMetadataSchema(query), /explicit backfill/);
    assert.equal(db.prepare("SELECT version FROM vault_state").get()?.version, 9);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='prices'").get()?.n, 0);
  } finally { db.close(); }
});

test("missing primary key and incompatible existing types fail closed", async () => {
  for (const ddl of [
    "CREATE TABLE vault_state(version INTEGER NOT NULL,data TEXT NOT NULL)",
    "CREATE TABLE vault_state(id INTEGER PRIMARY KEY,version TEXT NOT NULL,data TEXT NOT NULL)",
  ]) {
    const { db, query } = fixture();
    try {
      db.exec(ddl);
      await assert.rejects(ensureMetadataSchema(query), /explicit migration/);
    } finally { db.close(); }
  }
});

test("concurrent initializations tolerate the same safe column being added", async () => {
  const { db, query } = fixture();
  try {
    db.exec("CREATE TABLE vault_state(id INTEGER PRIMARY KEY,data TEXT NOT NULL)");
    await Promise.all([ensureMetadataSchema(query), ensureMetadataSchema(query)]);
    assert.equal(db.prepare("PRAGMA table_info(vault_state)").all().filter(c => c.name === "version").length, 1);
  } finally { db.close(); }
});

test("failed database permission propagates and can be retried", async () => {
  const { db, query } = fixture();
  try {
    const denied: SchemaQuery = async (sql, params) => {
      if (sql.startsWith("CREATE")) throw new Error("permission denied");
      return query(sql, params);
    };
    await assert.rejects(ensureMetadataSchema(denied), /permission denied/);
    await ensureMetadataSchema(query);
  } finally { db.close(); }
});
