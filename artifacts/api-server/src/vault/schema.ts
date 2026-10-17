export type SchemaQuery = (sql: string, params?: (string | number)[]) => Promise<Record<string, unknown>[]>;
type Column = { name: string; type: string; primary?: boolean; required?: boolean; add?: string; safeForRows?: boolean };
type Table = { name: string; create: string; columns: Column[] };

// Code-owned definitions only. Never derive identifiers or DDL from requests/files.
// A required column without a meaningful backfill may only be added to an empty table.
export const metadataSchema: Table[] = [
  {
    name: "vault_state",
    create: "CREATE TABLE IF NOT EXISTS vault_state (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, data TEXT NOT NULL)",
    columns: [
      { name: "id", type: "INTEGER", primary: true },
      { name: "version", type: "INTEGER", required: true, add: "INTEGER NOT NULL DEFAULT 0", safeForRows: true },
      { name: "data", type: "TEXT", required: true, add: "TEXT NOT NULL" },
    ],
  },
  {
    name: "prices",
    create: "CREATE TABLE IF NOT EXISTS prices (time TEXT PRIMARY KEY, price REAL NOT NULL CHECK(price > 0))",
    columns: [
      { name: "time", type: "TEXT", primary: true },
      { name: "price", type: "REAL", required: true, add: "REAL NOT NULL CHECK(price > 0)" },
    ],
  },
  {
    name: "replica",
    create: "CREATE TABLE IF NOT EXISTS replica (id TEXT PRIMARY KEY, sequence INTEGER NOT NULL, data TEXT NOT NULL)",
    columns: [
      { name: "id", type: "TEXT", primary: true },
      { name: "sequence", type: "INTEGER", required: true, add: "INTEGER NOT NULL" },
      { name: "data", type: "TEXT", required: true, add: "TEXT NOT NULL" },
    ],
  },
];

function verifyColumn(table: string, column: Column, actual: Record<string, unknown>) {
  if (String(actual.type).toUpperCase() !== column.type ||
    (column.primary && Number(actual.pk) !== 1) ||
    (column.required && Number(actual.notnull) !== 1)) {
    throw new Error(`Schema mismatch at ${table}.${column.name}; explicit migration required. Existing data was not replaced.`);
  }
}

export async function ensureMetadataSchema(query: SchemaQuery) {
  // Inspect everything before applying repairs; known unsafe drift must not cause
  // partial repairs in other tables.
  const repairs: string[] = [];
  for (const table of metadataSchema) {
    const columns = await query(`PRAGMA table_info("${table.name}")`);
    if (!columns.length) {
      repairs.push(table.create);
      continue;
    }
    for (const column of table.columns) {
      const actual = columns.find(c => c.name === column.name);
      if (actual) {
        verifyColumn(table.name, column, actual);
        continue;
      }
      if (!column.add) throw new Error(`Missing primary key ${table.name}.${column.name}; explicit migration required.`);
      if (!column.safeForRows && (await query(`SELECT 1 FROM "${table.name}" LIMIT 1`)).length) {
        throw new Error(`Cannot safely add ${table.name}.${column.name} to existing records; an explicit backfill is required.`);
      }
      repairs.push(`ALTER TABLE "${table.name}" ADD COLUMN "${column.name}" ${column.add}`);
    }
  }
  for (const sql of repairs) {
    try { await query(sql); }
    catch (error) {
      // Another starting instance may have applied the same additive repair.
      // Only accept that race when the exact column now satisfies the definition.
      const match = /^ALTER TABLE "(\w+)" ADD COLUMN "(\w+)"/.exec(sql);
      const table = metadataSchema.find(t => t.name === match?.[1]);
      const column = table?.columns.find(c => c.name === match?.[2]);
      const actual = table && (await query(`PRAGMA table_info("${table.name}")`)).find(c => c.name === column?.name);
      if (!table || !column || !actual) throw error;
      verifyColumn(table.name, column, actual);
    }
  }
  // Verify after creation/repair too; never mark an incomplete run successful.
  for (const table of metadataSchema) {
    const columns = await query(`PRAGMA table_info("${table.name}")`);
    for (const column of table.columns) {
      const actual = columns.find(c => c.name === column.name);
      if (!actual) throw new Error(`Schema repair incomplete: ${table.name}.${column.name}`);
      verifyColumn(table.name, column, actual);
    }
  }
  await query("CREATE TABLE IF NOT EXISTS vault_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  await query("INSERT OR IGNORE INTO vault_schema_migrations(version,applied_at) VALUES(?,?)", [1, new Date().toISOString()]);
}
