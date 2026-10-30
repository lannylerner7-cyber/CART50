# Developer wallet foundation: local profile

## Independent identity continuation

The opt-in runtime now reuses existing developer email/passkey/session onboarding
with a dedicated developer-only metadata adapter. Shared security primitives have
no custody imports; the legacy combined application's storage adapter remains the
default outside this explicitly configured runtime. No hosted account or database
has been moved.

POST /api/developer-wallet/key issues/rotates or revokes an independent wallet key
using a full developer session, CSRF, same-origin validation and a fresh passkey.
Allowed scopes are wallet:read, wallet:write, wallet:fees and wallet:simulate;
the last is available only in this local-only service. Keys are one-time returned,
hashed in metadata and expire after 30 days. Rotation invalidates the prior key.
Checkout keys do not implicitly authorize this service, and wallet keys do not
authorize personal owner routes.

The foundation page offers key management through the existing developer sign-in
flow. Its isolated fixture seeds two disposable verified account markers for
focused wallet tests; those markers are NOT WebAuthn acceptance evidence.
The fixture now has separate metadata and ledger files, and resolves developer
credentials through persisted account metadata instead of an in-memory access
list. Only independent admin credentials use the explicit administrative list.
Existing onboarding simulation credit is not silently copied into this ledger.

The runtime remains loopback/local-only and rejects production startup.
Per-request authorization is not proof of multi-instance revocation fencing
across the two local databases. See docs/developer-settlement-design.md for the
transactional authorization, signing, observer, outbox and restoration design and
the separately authorized migration/rollback gates.

## Scope and trust boundaries

The new foundation is an opt-in, independent **local service**, not a replacement
for the deployed developer platform. It imports no personal-owner authentication,
metadata, signer or RPC code. It has its own SQLite database, hashed bearer
credentials, scopes, expiry and administrator identity. It rejects production
mode and inherited custody/database credentials. The fixture removes inherited
secrets before importing the service and binds only to loopback.

This proves application-level separation in a disposable profile. It does NOT
prove OS/network isolation: processes in this workspace share an OS user. A
production deployment needs independent service identities, filesystem mounts,
credentials and network policy. The existing combined backend's hosted
metadata layout is intentionally unchanged: switching existing
accounts/storage is not authorized. No existing account has been migrated.

Personal custody must be an unreachable service from developer custody.
Administrative oversight is not a spending capability; the foundation admin
credential cannot create or approve payments. It can inspect its assigned tenant
and apply audited active/frozen/suspended/revoked controls. Revocation is terminal
in this local profile. A recorded Live approval never changes liveEnabled=false.
Existing owner keys, data, network choice, auth RP and sync monitor are untouched.

## Run locally

Build the existing frontend, then run:

```sh
FOUNDATION_LOCAL=1 pnpm --filter @workspace/api-server exec tsx ../../scripts/wallet-foundation-fixture.mts
```

Visit `http://localhost:4401/developers/wallet-foundation`. The startup log gives
the path of a mode-0600 temporary JSON file containing developerA, developerB and
adminA tokens; it never prints them. Tokens expire after 30 minutes. Enter one
in the local console, then the input clears. The UI holds credentials in memory
only and clears protected data on sign-out/401. SIGTERM/SIGINT closes the database
and removes the disposable directory. Never supply owner credentials.

The main app exposes the same exact frontend path but not the foundation API.
It shows an unavailable state there. This is intentional; do not mount the
foundation in the combined hosted service to bypass commissioning.

## API and scopes

All paths below are relative to /api/wallet-foundation.

- GET /session: local-profile availability only; no private account information.
- GET /view?kind=wallet&after=0: authenticated tenant-scoped keyset pages of 50.
  Kinds: customer, wallet, assignment, deposit, withdrawal, transfer, event, fee,
  audit, usage. Cursor is the last row sequence, not an offset.
- POST /commands: body {action,data}, Bearer credential, Idempotency-Key required.
  Runtime validates each action's fields strictly. Tenant comes only from the
  credential, never a request field.

Read scope: wallet:read. Mutations: wallet:write. Fee changes additionally require
wallet:fees. Deposit/chain observations and manual delivery observations require
wallet:simulate. Admin credentials are separate and cannot use payment actions.

Actions and examples:

| Action | Data |
|---|---|
| customer | label |
| wallet | customerId, label |
| batch | walletId, count (1–100) |
| fee | fixedSats, bps (0–1000) |
| deposit | assignmentId, txid (64 hex), vout, amountSats |
| deposit-state | id, state confirmed/reversed, confirmations |
| transfer | from, to, amountSats |
| review | walletId, destination sim:UUID, amountSats, networkFeeSats |
| approve | id, approved:true |
| withdrawal-state | id, state unknown/broadcast/confirmed/failed, confirmations, actualFeeSats |
| event-lease | empty object |
| event-ack | id, lease, delivered |
| control | status, reason, optional liveApproved |

A batch is atomic, with no partial success. Reuse its idempotency key and body
after a lost response. It returns the original assignments. Separate new batches
have distinct destinations; there is no hardcoded lifetime wallet-count limit.
There are bounded requests, pagination and database-backed per-principal budgets.
No payment/order API credential is exposed in a generated receiving destination.

## Ledger and lifecycle

The code-defined foundation_* tables exist only in the isolated database:
entities, postings, idempotency, output identity and budgets. No request controls
table/column names. SQLite BEGIN IMMEDIATE makes mutation, postings, idempotency,
audit, usage and outbox insertion atomic on this local file. Postings are balanced
integer satoshis; triggers prohibit update/deletion. Wallet buckets are available,
pending and reserved. Customer identifiers never authorize cross-tenant reads.

Receiving assignments create no balance. They expire after 120 hours and retain
ownership, with destruction disabled. Late observations are marked late.
Deposits are unique by txid:vout globally within this one environment. Pending
funds become available after an explicit observation of at least three
confirmations. Reversals create compensating entries. Reversal after spending
may produce a truthful deficit and freezes the tenant; never conceal the loss.
Restoring a reversed output requires a future explicit reconciliation workflow,
not silently crediting the same output again.

Internal transfers are ledger transfers, not blockchain withdrawals.
Withdrawal review snapshots fee version, destination and amount for two minutes.
Approval atomically reserves funds. The local signer stand-in persists a
deterministic simulation artifact/txid for unknown/broadcast observations; it
does not hold keys, sign Bitcoin or broadcast anything. Unknown outcomes cannot
be marked failed/released. Confirmation settles recipient, developer and network
amounts and releases unused network-fee reservation. Definitive failure is
allowed only before a signed artifact exists. A frozen tenant can reconcile
existing transactions but cannot initiate new signing.

Fees are added on top, snapshotted and integer-rounded with BigInt calculations.
The developer fee is earned at confirmation, distinct from network fees.
Platform application/subscription billing never debits these wallet accounts.
No real settlement wallet is linked to this profile.

Outbox events are created with the ledger commit. Manual leasing provides
expiring leases, attempt counts, backoff, fixed event IDs and stale-ack rejection.
No HTTPS webhook transport or automatic global dispatcher is wired to this new
profile. Existing checkout webhook code is separate; hosted transport integration
must preserve encryption, signing, replay protections and fair tenant traversal.

## Storage recommendation and migration gate

Recommend a dedicated transactional relational ledger service (for example,
PostgreSQL with explicit transaction/locking semantics) for the eventual
developer financial system, independent of personal metadata and signers.
Keep appropriate nonfinancial metadata in D1 if desired; changing all metadata
providers is unnecessary. Evaluate transaction throughput, row locking, failover,
backup/restore, operational ownership and reconciliation before approval.
This is a recommendation, not an installed database or authorized migration.

Do not make money updates across separate databases as independent writes.
Keep ledger postings/reservations and event outbox in one transaction boundary;
project other services asynchronously with idempotent consumers. Isolation
requires narrow credentials, not only different table prefixes.

Cutover needs a read-only deployed inventory, approved target/schema, offline
backup and restore drill, repeatable account mapping, reconciled balances and
idempotency tombstones, controlled writers and rollback checks. No dual financial
writes without a proved protocol. R2 stores encrypted backups, not a running Core
datadir or ledger filesystem.

## Billing and operations decisions

The proposed application fee is $8–$10; exact price, timing, refund/rejection
terms, tax handling and payment provider are undecided. Payment must not approve
Live access automatically. Monthly billing needs an agreed unit and pricing
version, included allowance and duplicate-free metering. Current usage rows are
explicitly non-billable. Retries do not create extra usage rows.

Define delinquency policy without silently seizing customer balances or blocking
fund access unpredictably. Customer service fees, network fees, platform
application fees and platform subscriptions require separate accounting.
No billing collection integration is enabled.

Back up SQLite using the online backup API; copying a live database alone is not
a restore plan. Tests restore a disposable backup and compare balances.
Before hosted rollout, exercise crash recovery, restore keys/config together,
reconcile every tenant's liabilities against assets, and define recovery-point
and recovery-time targets. Do not archive/delete financial postings or
idempotency tombstones until retention and recovery policies are approved.
Protect audit capacity independently of tenant limits. Storage exhaustion still
fails closed; no finite service can promise infallibility.

## Commissioning tracks

1. Personal node: preserve datadir, verify current chain tip/IBD/freshness,
   authorization, retained signer storage, private RPC and recoverable backups.
   Only then seek explicit authorization for a small personal receive/send.
2. Developer service: independent credentials/storage/signing identity,
   accounting reconciliation, tenant controls and capacity verification.
   Personal-vault success does not establish this track's readiness.
3. Self-hosted starter: separate new domain/host selected by owner, DNS/TLS,
   actual API key/receiver signature/retry/redirect checks. Do not deploy on the
   existing personal vault host based on the superseded subdomain plan.

Signet remains paused. No hosted migration, namespace rollout, deployment, push,
host resize, real transfer or fee collection is authorized by this profile.
