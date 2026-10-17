# Personal Bitcoin Vault — operating boundary

## Current status

This is a **test-network implementation, not a production-ready financial service**.
The preview has no configured owner, Bitcoin node, Cloudflare account or price Worker.
It never creates sample balances. Mainnet and all actual key destruction are disabled.
Automated storage-layer destruction, authenticated tunnel
provisioning and end-to-end disaster recovery still need completion before deployment.
The application supports explicit spending review/broadcast and manually reviewed
RBF fee bumps that preserve the original recipient and amount. Unknown broadcasts
are retained for reconciliation, not replaced automatically.

## Components

- `artifacts/bitcoin-vault`: React control room.
- `artifacts/api-server`: session/authentication and application API. Node 24+.
  Development uses a local SQLite metadata file, not the unused starter Postgres
  package. Production refuses to start metadata operations without D1 settings.
- `services/vault-engine`: Go process beside Bitcoin Core. It alone requests
  hot-wallet signing. Independent Core descriptor wallets isolate temporary seeds.
  State and signed intent journal stay on the Bitcoin host, never in the browser.
- `lib/vault-cloudflare`: Worker price snapshots, D1 migration, authenticated
  operational-checkpoint queue and encrypted-backup upload endpoint. Replication
  schema excludes keys, addresses, balances and temporary transaction history.
  Host-to-Worker replication is not yet wired automatically.

## Owner provisioning

1. Download `/offline-keygen.html`, take it offline and open the saved file.
2. Generate and manually save the 64-byte credential (86 base64url characters).
3. Install **only its SHA-256 verifier** as `VAULT_OWNER_VERIFIER` through the
   deployment's secret manager. Never put the credential in source or chat.
4. Set `PUBLIC_ORIGIN` to the exact HTTPS application origin. Restart the API.
5. Unlock and optionally enroll a passkey. Sessions expire after 30 minutes.
   Rotation revokes all sessions; passkey removal revokes other sessions.

The access key is a bearer credential, not AES. It passes over HTTPS at login.
Passkeys resist phishing better, but are optional. There is no email recovery.
Credential loss does not destroy a separately backed-up cold-wallet seed.

## AWS / Coolify deployment package

The root `Dockerfile` packages the dashboard and API on port 3000. See
[`coolify-deployment.md`](coolify-deployment.md) for exact Coolify settings,
runtime variables, build commands and the private signer image. Infrastructure
provisioning and live commissioning are not performed automatically by the image.

Use a dedicated Linux host and private persistent volumes. Pin Bitcoin Core
**29.0.0** for the current regtest checks, then review security updates before
production. Do not silently upgrade a signer. Build the engine with
`cd services/vault-engine && go build -o vault-engine .`.
Run it as an unprivileged service with automatic restart, a bounded restart limit,
private networking and only the engine's state/Core wallet directories writable.
Use `deploy/vault-engine.service` as the systemd alternative to a Coolify service.

Bitcoin Core:

```ini
signet=1
server=1
prune=550
txindex=0
disablewallet=0
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
```

Expose neither Core RPC nor the engine port publicly. Keep the RPC cookie on the
host with restrictive permissions. The engine refreshes cookie credentials on
each request. Bitcoin's peer port and restricted node RPC serve different purposes.
An authenticated reverse tunnel must terminate at the application HTTPS service;
use a separate protected administration path. Tunnel configuration and access
policy verification are outstanding; no tunnel is claimed to be active.

Engine runtime configuration (values belong in a secrets manager, not Git):

- `BITCOIN_NETWORK=signet` (or `regtest`); any other network is rejected.
- `BTC_RPC_URL`: private Core RPC endpoint.
- `BTC_RPC_COOKIE_FILE`: cookie path.
- `ENGINE_DATA_DIR`: private persistent volume, not in automated backups.
- `ENGINE_LISTEN`: defaults to `127.0.0.1:9090`.
- `VAULT_ENGINE_TOKEN`: independently generated service credential, ≥32 characters.
- `COLD_DESCRIPTOR`: checksummed ranged **public** descriptor.
- `COLD_DESCRIPTOR_SHA256`: its SHA-256 fingerprint verified against an offline
  trusted source, outside D1/dashboard metadata.

Cold descriptor index allocation is durably journaled before use. Protect the
descriptor and index against rollback. Never upload the cold seed. The spending
vault is separately funded: obtain its address from the wallet view, prepare and
sign a transfer in the offline/hardware cold wallet, then broadcast through your
own node. The app cannot sign cold-wallet transactions.

API runtime configuration:

- `VAULT_OWNER_VERIFIER`, `PUBLIC_ORIGIN`, `BITCOIN_NETWORK`.
- `VAULT_ENGINE_URL`, matching `VAULT_ENGINE_TOKEN`.
- `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, least-privilege `CF_API_TOKEN`.
- `MARKET_WORKER_URL`: HTTPS `/price` endpoint.

The API automatically creates and checks its defined tables before startup, adding
only safely repairable missing columns (see `docs/database-schema.md`). For Worker-first
provisioning, apply `lib/vault-cloudflare/migrations/0001.sql` to a new D1 database; configure
the Worker bindings and independent `REPLICA_TOKEN`. Do not use placeholder
database IDs. Use same-origin routing: `/api/*` to the API; all other application
routes to the built React app. Use Node 24+, pinned pnpm lockfile, TLS, no request
body logging and `Cache-Control: no-store` for API responses.

## Market feed

The Worker requests only `XBTUSD` from Kraken's public Ticker endpoint, at
one-minute intervals. No wallet information is sent. It stores eight days of
price samples in D1. Missing data or data over three minutes old suppresses alerts.
Below-price and percentage-window alerts rearm when their condition clears;
cooldown alone does not repeatedly trigger an unbroken condition.

Market fetching defaults to `MARKET_ENABLED=false`. Public endpoint authentication
and response shape were checked against Kraken's Ticker documentation. Public
limits are IP-based. **Applicable market-data terms/redistribution permission must
still be confirmed by the operator before enabling or exposing this Worker**;
public API access alone is not a redistribution license.

References:
- https://docs.kraken.com/api/docs/rest-api/get-ticker-information/
- https://support.kraken.com/articles/206548367-what-are-the-api-rate-limits-
- https://www.kraken.com/legal

## Expiration is not erasure

Every temporary wallet expires at creation +120 hours. The UI then stops offering
its address for receipt. The owner selected **wait for verified drainage**:
retain keys past expiry while funds, unsettled sweeps or node uncertainty remain.
Read-only readiness checks now include trusted/pending/immature balances, unsafe
and locked coins, sweep replacements, active-chain checkpoints, wallet scan state
and node freshness. An empty legacy wallet remains `blocked_storage_verification`.
No API currently destroys keys. Manual history deletion is allowed only after
verified destruction and zero funds; it cannot bypass these conditions.

The owner chose to retain existing storage rather than add a separate
key-management service. A reference independent-key design and copy inventory
are in [`temporary-wallet-storage.md`](temporary-wallet-storage.md); this design
is not enabled or implemented. No post-revocation recovery is claimed. The
inventory is a host-verification checklist, not a claim that deployed backups
were inspected. The existing offline-generated access key is unchanged: configure
only its SHA-256 verifier in `VAULT_OWNER_VERIFIER`, never reuse that access
credential as a temporary-wallet encryption key.

Core unloading, deleting a row and overwriting files do not guarantee SSD/EBS
erasure. Inventory Core wallet databases, WAL files, swap, crash dumps, journal
copies, volume snapshots and host backups. Per-wallet encryption/crypto-erasure
needs an approved independent key lifecycle and proof that recoverable copies
are not retained. A retained shared seed must not regenerate destroyed wallets.
Never take general hot-wallet snapshots while claiming five-day destruction.
Late deposits to old addresses are always possible and could be permanently lost.
Public Bitcoin history remains public. Fresh cold destinations are not anonymity.

## Recovery and backups

The engine obtains an exclusive journal lock; do not run two signers on the same
wallets. It persists signed bytes and transaction identity before broadcasting.
After ambiguous responses it checks the exact transaction, mempool and chain.
Conflicts and evictions are not treated as successful payment. Fee estimates
missing or above configured ceilings block automatic sweeps.

Configure all positive fee and exposure limits before unpausing. Defaults of zero
are deliberate, not recommended operating values. An exposure ceiling cannot
prevent unsolicited deposits. Temporary sweeps use ≥3 confirmations and cold
public destinations. Spending transactions are tracked through three confirmations,
which are not a guarantee against reorgs.

`scripts/vault-backup.mjs` is an offline AES-256-GCM export tool with independent
32-byte keys and random 96-bit nonces:

```sh
node scripts/vault-backup.mjs key /offline/new-backup.key
node scripts/vault-backup.mjs encrypt /offline/recovery.json /offline/new.vault /offline/new-backup.key
node scripts/vault-backup.mjs decrypt /offline/new.vault /offline/restored.json /offline/new-backup.key
```

Accepted recovery JSON contains `version:1`, `createdAt`, `coldDescriptor`,
`coldIndex`, and optionally `spendingWalletBackupBase64`. Use Core `backupwallet`
on **only** the spending wallet to create that backup; the tool cannot inspect the
opaque base64 and therefore cannot prove that an operator supplied the right wallet.
Do not include temporary wallets. Do not back up the engine's whole journal.
No decryption key belongs in R2 or D1. Restore offline, verify descriptor identity
and derive index at or beyond the latest allocation, restore only spending state,
then reconcile the node before enabling signing. Destroyed temporary wallets must
never be recreated from a snapshot. Full disaster-recovery verification is pending.

## Verification

Run:

```sh
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/bitcoin-vault typecheck
pnpm --filter @workspace/vault-cloudflare typecheck
cd services/vault-engine
go test ./...
VAULT_REGTEST=1 go test -v ./...
```

The regtest suite starts an isolated Core process, creates 101 independent receiving
wallets, checks unconfirmed funds, signs a spending payment, verifies duplicate
submission identity, mines three confirmations, sweeps to a fresh cold destination,
checks accounting, invalidates a block and checks reconciliation. These tests use
worthless local regtest coins. They do not prove signet, Cloudflare, passkey hardware,
long-running outage recovery or secure erasure behavior.

### Recorded verification — 2026-10-12

- API, frontend and Worker typechecks passed.
- Bitcoin Core 29.0.0 regtest passed all four Go tests, including 101 simultaneous
  wallets, reviewed RBF replacement preserving the destination, duplicate submission,
  spending/cold receipt accounting, three confirmations and a block reorg.
- HTTP access test passed: wrong credential rejected, anonymous dashboard/passkey
  enrollment rejected, valid unlock, secure cookie attributes, Origin/CSRF rejection,
  alert create/delete persistence and session revocation.
- Credential encoding and price-window unit tests passed.
- Offline backup test passed roundtrip, authenticated tamper rejection and rejection
  of a top-level temporary-wallet key field. This is not proof of contents inside an
  opaque spending-wallet backup.
- Locked setup preview rendered successfully; protected dashboard returned 401 and
  the offline generator returned 200. No authenticated browser/passkey hardware
  journey or real AWS/Cloudflare deployment was tested.
