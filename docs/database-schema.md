# Database creation and missing columns

## Actual storage

- Production application metadata: Cloudflare D1, not the unused PostgreSQL/Drizzle scaffold.
- Local development: SQLite.
- `vault_state`: `id`, optimistic-concurrency `version`, and JSON `data`.
  Sessions, passkeys, alerts, notifications and settings are JSON properties, not
  individual SQL columns. New JSON fields need application validation/defaults;
  SQL column creation does not perform those upgrades.
- `prices`: `time`, `price`; `replica`: `id`, `sequence`, `data`.
  These are shared with the Cloudflare Worker.
- Bitcoin custody state remains in the private engine's durable JSON journal and
  Core-managed wallets. This schema initializer never touches keys or Core files.
- There is no general-purpose uploaded-file table. Do not create columns from
  filenames, uploaded contents or arbitrary request keys.

## Automatic startup behavior

The API verifies the code-owned schema before listening or starting background jobs,
both in development and production. It:

1. Inspects all required tables and columns with `PRAGMA table_info`.
2. Creates absent tables.
3. Adds missing columns only when their code definition permits it.
4. Preserves existing values and unrecognized extra columns.
5. Checks the resulting schema, then records baseline version 1 in
   `vault_schema_migrations`. That ledger is separate from the state row's CAS version.

The missing `vault_state.version` column can safely start at zero. Missing required
payload/price/sequence columns on populated tables require a deliberate backfill:
the application will not manufacture empty JSON, prices, or acknowledgement history.
Missing primary keys or incompatible types also stop startup. There are no automatic
drops, renames, table replacements or destructive type conversions.

Startup revalidates even if version 1 was already recorded. Additive steps are
repeatable after interruption and tolerate concurrent startup attempts. This is not
a claim that multiple remote D1 statements form one transaction.

## Future schema changes

Add explicit definitions and reviewed additive/backfill logic in
`artifacts/api-server/src/vault/schema.ts`, with migration tests. For each new schema
version add a corresponding migration record after successful verification, and keep
the SQL bootstrap migrations in `lib/vault-cloudflare/migrations` consistent.
Do not accept DDL, identifiers or guessed types from incoming user data.

For populated-table transformations, first take a database backup and implement/test
an explicit migration. Schema automation cannot restore values that never existed.

## Deployment

The existing D1 configuration and token must permit schema writes. A permission or
schema error prevents the server from becoming ready; production never falls back
to local SQLite. Deploy the API before enabling Worker jobs against a new database,
or apply the existing bootstrap SQL first. The Worker does not alter tables itself.

No production migration is performed merely by editing this code. On deploying the
updated API, automatic initialization runs against its configured database.
