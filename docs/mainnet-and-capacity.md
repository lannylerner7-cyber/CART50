# Mainnet configuration and capacity — 2026-10-15

## Scope and evidence

Single owner; public API, customer accounts, profile/gift-card uploads, Redis,
database sharding and multi-signer infrastructure remain deferred.
Mainnet **support is opt-in source code**, not an operator approval to fund an
unverified deployment. Existing Signet configurations are unchanged. No live
credentials were changed, production requests load-tested or real BTC sent.

### Local burst measurements

10,000 HTTP requests, driven by 256 concurrent workers, against an isolated
Express admission/read-coalescing fixture on loopback:

| Measurement | Result |
|---|---:|
| Successful responses | 8,829 |
| Explicit HTTP 503 overload responses | 1,171 |
| Unexpected response codes/test failures | 0 |
| Peak admitted requests | 128 |
| Fixture upstream reads | 117 |
| Duration | 13,974 ms |
| Combined success/rejection p95 latency | 423 ms |
| Process RSS at measurement | 316 MiB |

This is **not** 10,000 requests/second, 10,000 successful simultaneous requests,
Bitcoin transaction throughput, a D1 benchmark or a production capacity guarantee.
The fixture omits real authentication, D1, Core, TLS and load-balancer cost.

Separately, 10,000 concurrent in-process reads share one load. The Go admission
test occupies 32 signing-request slots and rejects the remaining 9,968 with 503
and Retry-After; it is a deterministic handler test, not network throughput.
The actual API allows at most 16 in-flight signer fetches per instance, below
the signer's 32 admitted requests. These are protection limits, not performance promises.

### Behavior under load

- Bound open API responses before body parsing/metadata access.
- Coalesce concurrent metadata and fixed-endpoint signer reads; no retained TTL
  cache or stale-success fallback.
- Clear in-flight read references around mutations. Return cloned read results
  so one caller cannot modify another's state.
- Never coalesce writes or treat a cached balance as permission to spend.
- Reject excess work explicitly. Do not automatically retry payment submissions;
  reconcile the existing review/transaction identity first.
- Preserve one signing authority per wallet and the exclusive journal lock.
- Multi-instance D1 write contention, mail workers and startup behavior still need
  a coordinated audit before adding backend replicas.

## Mainnet resource (operator-run; not deployed by this work)

Create a **separate** Coolify Compose resource using:

- Base directory `/`, file `/deploy/coolify-mainnet.compose.yaml`.
- Runtime `ALLOW_MAINNET=true` only after reviewing custody/recovery requirements.
- Runtime `MAINNET_ENGINE_TOKEN`: independently generated mainnet service token.
- Runtime `COOLIFY_NETWORK`: verified existing website network.
- No public domains or host ports for the Core/signer services.

Never reuse Signet volumes or keys. The new Compose stack has distinct
`mainnet-bitcoin-data`, `mainnet-bitcoin-cookie` and `mainnet-signer-data` volumes
and a distinct private `vault-mainnet-engine` hostname.
The signer pins its network in the journal; mismatches and legacy populated
journals proposed for mainnet are rejected.

The new Core image pins 29.4 using its official HTTPS SHA256SUMS:
<https://bitcoincore.org/bin/bitcoin-core-29.4/SHA256SUMS>.
Release announcement reference:
<https://bitcoincore.org/en/2026/07/13/release-29.4/>.
The source checksum was verified; independent GPG release-signature verification
is not claimed. The Signet image is not silently upgraded.

Built and started this mainnet image with no network access; Core reported chain
`main`, genesis height, initial block download and the intended pruning target.
That validates packaging/configuration, not synchronization or mainnet payments.

## Website switch — only after the node is ready

Update existing website runtime configuration together:

```text
BITCOIN_NETWORK=main
ALLOW_MAINNET=true
VAULT_ENGINE_URL=http://vault-mainnet-engine:9090
VAULT_ENGINE_TOKEN=<same value as MAINNET_ENGINE_TOKEN on the new stack>
```

Keep existing owner verifier, passkeys and metadata configuration. Never put raw
keys in Git, chat or this document. The app validates the signer network before
forwarding mutations, including in the Signet-to-main direction. Mainnet uses
server custody; no external savings address is required.

Node initial sync, reconciliation, positive fee/exposure limits and deliberate
unpausing are still required. A mainnet UI label does not prove operational readiness.
Keep Signet services/volumes separate for rollback/testing rather than deleting them.

## Recovery acceptance before meaningful funds

1. Back up Main and Spending with Core backupwallet; encrypt under an independent
   offline key. Verify wallet/network identity and exclude temporary wallets.
2. Restore into an isolated environment and reconcile addresses, coins and known
   transaction identity. Never run two funded signers concurrently.
3. Exercise interrupted broadcast/restart and confirm no duplicate payment.
4. Verify pending -> confirmed and reviewed fee replacement with controlled funds.
5. Confirm monitoring, disk growth, prune/rescan limitations and backup retention.

The full Go suite now also passes with Core 29.4 in an isolated Docker regtest
environment, with race detection and Go vet. It covers the custody round trip,
duplicate identity, replacement, engine reconstruction and reserve restore.
Reproduce with deploy/vault-regtest.Dockerfile's build/run instructions; its
test-only build context includes tests excluded from production images, and the
command fails if no test files were copied. Hosted disaster recovery, live R2
restoration and real-BTC transfers remain unproven.

## Public HTML and routes

Index HTML and SPA routes remain present. Private-vault pages send noindex,
nofollow and noarchive metadata/headers; robots.txt disallows crawlers.
This is crawler guidance, **not authentication**.
Production removes setup-generator HTML from the image and denies those routes,
including encoded names. Development/offline source copies remain available.
Static route tests cover index, SPA fallback, missing JS, dotfiles, setup tools
and missing state-file paths. API authentication remains the access boundary.

## Remaining gates

Host capacity measurement; hosted mainnet sync;
backup/restore drill; outage recovery; controlled real-BTC receive/send; independent
security/release review; live market/replication/R2 commissioning as applicable.
Do not announce production readiness or horizontal scalability from these fixtures.
