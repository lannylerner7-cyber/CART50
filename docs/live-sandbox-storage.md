# Live / Sandbox storage and commissioning

## Current ownership — no duplicate tables

| Existing D1 table | Owner and purpose | Separation |
| --- | --- | --- |
| `vault_state` | Website authentication, owner settings and application metadata | `sandbox` holds demoUSD only; `sandboxSignetReviews` holds session-bound Signet approval references. Neither is a Live Bitcoin balance. |
| `prices` | Public BTC/USD reference samples | Public market data only, never a Signet cash valuation. |
| `replica` | Bounded, monotonic operational health snapshots | New IDs `engine-health:main`, `engine-health:signet`, `engine-health:regtest`. |
| `vault_schema_migrations` | Code-defined schema revision history | Version primary key prevents duplicate migration entries. |

There is no separate Sandbox database yet. Metadata fields are logically
separated in the existing `vault_state` JSON row. Optimistic version checks
protect concurrent writes across website instances; they do not provide physical
database isolation. Large histories should eventually use explicit, indexed
tables with an environment key, not unbounded JSON or ad-hoc generated columns.
Current simulation receipts and Signet review references are capped at 1,000.
Do not rename or duplicate existing tables just to add labels.

Schema setup uses `CREATE TABLE IF NOT EXISTS`, checks existing columns and
only performs code-defined additive repairs. Unknown request/file properties
never create columns. Owner keys, raw private keys and plaintext wallet backups
must never be stored in these application JSON fields.

## R2 is not a SQL database or a mounted Bitcoin disk

The repository's Worker config names the `BACKUPS` binding and
`personal-vault-encrypted-backups` bucket. This is configured source, not proof
that the deployed Worker or bucket is healthy. The connector audit in this
session could not verify live resources.

New encrypted backup object keys:

- `backups/main/<id>.vault`
- `backups/signet/<id>.vault`
- `backups/regtest/<id>.vault`

The upload/download API still uses `/backups/<id>.vault`; the Worker pins the
namespace from `REPLICA_NETWORK`, never a browser-supplied environment.
The existing encrypted envelope is retained. Encryption keys stay offline.
R2 does not automatically back up the database or the Bitcoin datadir.
The existing small-file backup endpoint is limited to 16 MiB; it is NOT a
full-chain backup mechanism. Protect mainnet datadir/chainstate with a separate,
verified consistent volume backup/snapshot and a restore drill.

### Required Worker rollout gate

Set `REPLICA_NETWORK=main` on the Live Worker and `REPLICA_NETWORK=signet` on
the separate Sandbox Worker. Use distinct Worker endpoints, replica tokens and
queues/dead-letter queues; a single worker is not a dual-network dispatcher.
Missing namespace fails closed. Do not deploy this Worker update before setting
that variable and checking existing producers/queues.

Legacy `engine-health` records remain untouched; their sequence is read only
when the stored network matches the Worker's network. Old unprefixed R2 backups
remain untouched. To read them, explicitly set `LEGACY_BACKUP_NETWORK` to their
verified network on the appropriate Worker, or migrate copies after validation.
Never guess which network an encrypted legacy file belongs to.

## Performance and load balancing

- Schema and initial-row insertion happen once per process, rather than issuing
  `INSERT OR IGNORE` before every metadata read.
- Concurrent identical metadata/signer reads share an in-flight request.
  There is no financial-data TTL cache or silent stale-success fallback.
- Live and Sandbox signer reads use different keys and separate credentials.
- Private API/session/backup responses are `no-store`. Public price responses
  may use the existing 30-second cache; price freshness is still reported.
- UI monitoring polls in seconds, not every 2 milliseconds. Last observations
  retain timestamps; stale data is not permission to receive or spend.
- API admission and the 16 in-flight signer request ceiling limit overload.
  No load balancer or extra replicas were deployed by this work.
- Never load-balance multiple independent signing processes over the same
  wallet/journal. Keep one signing authority per network. Website replicas
  require capacity checks and shared D1; do not add Redis or new databases
  without a measured need.

## Website / private signer wiring

Login and Live are now the mainnet workspace. The existing `BITCOIN_NETWORK`
setting is NOT silently changed: until it is explicitly `main` with
`ALLOW_MAINNET=true` and a matching private signer, Live wallets fail closed.
The read-only `MAINNET_MONITOR_URL` / `MAINNET_MONITOR_TOKEN` remain independent
and must never be reused as signing authority.

After host capacity and network/storage isolation have been verified, configure
the website's **runtime** variables for the stopped Signet service:

- `SANDBOX_SIGNET_ENABLED=true` only after the commissioning gate.
- `SANDBOX_ENGINE_URL`: existing verified private Signet engine endpoint.
- `SANDBOX_ENGINE_TOKEN`: its independent secret, never the mainnet/monitor key.
- `SANDBOX_SIGNET_WALLET_ID`: `vault-spending` or `vault-reserve`, deliberately
  assigned on Signet, with an existing active `tb1` address.

There is no fallback from Sandbox to Live credentials or the old Signet variables.
The assigned address is the only permitted Sandbox Signet send destination.
This is a self-transfer exercise; it spends network fees, not simulated dollars.
Actual on-chain balances and history come from the assigned private Signet wallet.
The demoUSD simulation remains a separate tool with no Bitcoin value.

Website variable changes do not require reinitializing Core or deleting volumes.
Do not restart the stopped stack until current free memory, disk, Docker mounts,
resource limits and retained Signet data have been checked. Full mainnet sync
alone does not enable or prove production custody. Real BTC acceptance still
requires explicit authorization and verified backups/readiness.
