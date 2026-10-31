# Independent settlement and recovery design

Status: design only. The implemented local runtime still uses explicit simulation
observations and deterministic transaction stand-ins. Nothing in this document
authorizes deployment, signing, host changes, billing collection or a transfer.

## Service boundaries

The developer identity service owns verified email, passkeys, sessions and scoped
API credentials. The financial service owns wallet assignments, postings,
reservations, review snapshots, transaction artifacts and outbox. A separate
developer signer owns developer signing material; a separate observer reads the
selected chain/indexer. Neither receives owner keys, owner storage mounts or
owner RPC credentials. Administrative oversight never provides a fallback source
of personal funds.

Use independent authentication per service and explicit network/environment IDs
in every command, artifact and observation. Reject mismatches, unknown networks
and credentials from other environments. A developer API must never choose its
own signer URL or RPC destination. Allowlist service identities, not arbitrary
URLs supplied in payment payloads. Keep private RPC unexposed.

## Observer contract

An observation identifies network, tenant, assignment, txid/vout, integer sats,
block hash/height, confirmations, observation time and source cursor. Validate
ownership and assignment provenance against persisted assignments, not a sender
claim or amount-only match. Deduplicate outputs across tenants within a network.

Track block hashes and parent links. Reorgs/conflicts produce compensating
entries; they do not overwrite postings or claim finality. Pending, confirmed,
conflicted and reversed states must have recorded transitions and source evidence.
Late deposits remain attributable to expired assignments. Do not destroy keys
or assignment maps merely because their 120-hour expiry elapsed.

Persist cursor advancement with financial effects and outbox publication.
Replay from a checkpoint is safe through output identity and observation
idempotency. Use overlapping scans after outages; reconcile against UTXOs and
chain history. A stale/unreachable observer cannot fabricate a balance or confirm
a transaction. Destination lookup is informational, not proof of payment.

## Signer and broadcast contract

1. Quote locks destination, network, amount, selected inputs, fee bounds, policy
   version and expiry. Explicit approval references this exact quote hash.
2. Reserve wallet funds and the selected outpoints atomically under a unique
   withdrawal ID. Persist the signer request and outbox in the same transaction.
3. The signer authenticates the financial service, validates network/destination/
   policy and deduplicates by withdrawal ID plus request hash. A different request
   for the same ID is a conflict, never a new signature.
4. Persist the signed raw transaction encrypted, its txid and request hash before
   any broadcast. The signer must also durably retain its idempotent result so a
   crash after signing but before the caller saves it can recover the exact bytes.
5. Broadcast that exact artifact. A timeout means unknown, not failed. Query the
   node and observer using the persisted txid; retransmitting identical bytes is
   not a second payment. Never construct a fresh payment to resolve uncertainty.
6. Release a reservation only on definitive pre-broadcast failure, or a separately
   reviewed reconciliation proving that no potentially spendable artifact remains.
   Confirmed settlement allocates recipient, developer fee and actual network fee
   and releases the unused fee cap using compensating ledger entries.

Replacement transactions require an explicit fee-bump policy and linked
replacement lineage under the same withdrawal identity and reservation.
Never count both original and replacement as separate payouts. Transaction
eviction alone is not proof that funds may safely be spent again.

Crash drills: before/after reservation, signer persistence, response delivery,
caller artifact persistence, broadcast and confirmation. Each restart must recover
one withdrawal identity without a second economic payment.

## Fair outbox and receiver delivery

Keep event insertion in the financial transaction. Events have stable IDs,
tenant IDs, payload versions, creation sequence, delivery attempts, lease token,
lease expiry and next-attempt time. Lease using compare-and-swap or row locks and
a fencing token; acknowledgement must match the current lease.

Select at most a bounded number of due events per tenant per sweep, then rotate
across tenants using a durable traversal cursor. An unbounded backlog for one
tenant must not starve newer tenants or emergency controls. Avoid fixed first-N
account scans. Reclaim expired leases; cap concurrency globally and per tenant.
Back off with jitter, honor a bounded Retry-After, and park exhausted deliveries
for explicit replay while preserving event identity.

Webhook registration requires an exact HTTPS URL. Validate DNS and pin a public
resolved address per attempt; forbid private/link-local targets, credentials in
URLs and redirects. Enforce request size/time limits. Encrypt signing secrets
with a versioned key separate from developer API keys; rotation preserves recovery
for deliveries already queued under the prior secret.

Sign timestamp + raw payload with HMAC and transmit event ID/version. Receiver
checks signature with constant-time comparison and a timestamp window, then
atomically records event ID plus its business effect. Duplicate deliveries return
success without applying twice. Acknowledge only after durable commit.
Do not trust a return URL, browser button or webhook alone as settlement authority;
query the authenticated API for canonical order status when needed.

## Transactional storage recommendation

Recommend a dedicated transactional relational ledger (for example PostgreSQL),
with unique network/output and withdrawal/input identities, row locking,
constraints, immutable postings and an atomic outbox. Evaluate operational
ownership, recovery targets and capacity before selecting a hosted provider.
Do not migrate or create it automatically.

The current local identity and ledger databases are distinct files. The
independent runtime now invalidates its financial credential epoch before
metadata changes, activates only the latest successfully persisted grant, and
rechecks it inside the financial write transaction. An interrupted change stays
disabled; fresh passkey-authorized issuance is the recovery path. An
independent-process local test rejects an already-resolved stale principal after
revocation, including approval and idempotent replay.

This is not a distributed transaction across the files. Coordinate general
metadata suspension with financial controls before exposing administrative
account changes. Future signer authorization must consume the same fence.
Hosted storage locking/failover and account-control races still need evidence;
the local protocol does not prove a hosted deployment safe.

D1 remains the chosen shared abuse-budget candidate. Verify its authorized
binding/configuration read-only before integration; no new database is implied.
Derive IP identity only through explicit trusted-proxy validation. Apply endpoint,
tenant, API-key and IP budgets independently; fail closed for money-changing
operations on limiter outage. Emergency suspend/revoke needs its own bounded
admission path and durable audit, independent of tenant quotas.

The local service now gives a verified, unexpired independent admin credential a
separate ingress lane as well as its separate tenant-role budget. Forged admin
headers and untrusted forwarded IPs do not select that lane. Its local HTTP test
exhausts ordinary shared-IP ingress and still permits emergency revocation.

## Backup, restoration and reconciliation

Define RPO/RTO, encryption key ownership, offsite retention and restoration access.
Test transactionally consistent ledger/metadata backups, signer backups and
encrypted outbox-secret recovery together. R2/S3 may hold encrypted backup objects;
neither is a mounted Core or ledger database.

Restore to isolated services with outbound signing and delivery disabled.
Verify checksums/schema versions, restore signing/secret key versions, compare
ledger liabilities with controlled assets and pending reservations, reconcile
chain cursors and uncertain broadcasts, then replay idempotent outbox events.
Measure restore time and reconcile all differences before permitting writers.
Maintain network namespaces and preserve legacy objects until their network is
verified. Never infer namespace from filename alone.

## Archival and rollback

Separate read projections from immutable records. Archive in bounded keyset
batches with checksums and verified retrieval before removing hot projections.
Preserve receipt lookup, output ownership, withdrawal lineage and idempotency
tombstones for the approved retention period. Do not silently expire tombstones
while clients can retry an old request. Retention/privacy/legal decisions remain
unapproved; implement no destructive archival until approved.

Before migration: inventory authorized deployed bindings, backup and restore,
validate schemas and account mappings, reconcile balances, fence old writers,
perform a reversible cutover and verify reads/receipts/tombstones.
Rollback must stop new writers and reconcile any post-cutover transactions; do
not restore an old snapshot over newer payments or run two independent writers.

### Disposable local restoration evidence

recovery.test.ts uses SQLite's online backup API, not a copy of the main file
that omits WAL content. It fences the old writer before exercising the snapshot.
The restored copy retains the unknown withdrawal's exact persisted synthetic
artifact/txid, reservation, idempotency result and outbox lease identity.
Replaced-lease acknowledgements fail; an attempted pre-broadcast release of an
unknown payment fails. A subsequent observation/confirmation retains identity,
releases only the unused fee cap and keeps postings balanced and immutable.

Before any restored service is exposed, invalidate restored credential grants
and require fresh issuance: restoring an older ledger plus identity snapshot
could otherwise resurrect old keys. The drill exercises that invalidation.
This is ledger-only disposable evidence, not a complete identity/secret backup,
real signer recovery, chain reconciliation or hosted restore-time measurement.

## Billing decisions kept separate

Decide application price within the proposed $8–$10 range, rejection/refund policy,
monthly billable units, allowances, metering version, taxes, invoice provider and
delinquency policy. A paid application never implies Live approval.
Keep platform application/subscription charges separate from customer balances,
developer fees and miner fees. No fee is collected by this design.

## Required future evidence

Prove hosted multi-instance fencing and coordinated suspension, observer reorg recovery, signer
idempotency across crashes, broadcast uncertainty, fee replacement lineage,
fair outbox traversal, real HTTPS receiver replay safety, shared-budget outage
handling, full backup restoration and reconciliation. Local mocked tests and
browser screenshots cannot establish hosted custody readiness.
