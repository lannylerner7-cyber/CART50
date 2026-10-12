# Temporary-wallet destruction boundary

## Approved funds policy

The owner selected **wait for verified drainage**, not strict deadline destruction.
An address expires 120 hours after creation. The application stops displaying it
for receipt, but keys must remain usable until drainage and settlement are checked
against a healthy node. Expiry is not key revocation or permission to delete a
wallet database. Late deposits before revocation restart the drainage checks.
Late deposits after revocation may be permanently inaccessible.

## Implementation boundary today

The engine implements read-only readiness checks. There is **no destructive
storage backend**, no verified destruction receipt, and no enable switch.
`blocked_storage_verification` means only that current drainage checks passed;
it does **not** mean deletion is safe. Existing ordinary Core wallets cannot
acquire a historical no-copy guarantee by moving them to encrypted storage.
Do not destroy or automatically migrate them.

The owner subsequently chose to **keep the existing storage**, rather than add a
separate key-management service. The delivered scope is therefore expiry and
read-only readiness checks, not actual erasure. Keyed storage provisioning,
revocation, crash-safe purge and recovery across revocation are not implemented
or authorized under this retained-storage scope. No signing keys were deleted.

## Reference design only — not selected for implementation

Use a dedicated key custodian, outside the rollback domain of the Bitcoin host.
Each newly created temporary wallet receives a unique, randomly generated,
non-exportable key object; do not derive it from a retained master seed or
application secret. It must not have a recoverable key export or backup.
Deleting a shared wrapping key is not selective per-wallet destruction.

The custodian must support:

1. Idempotent provisioning by opaque wallet identity; unique keys must never be
   reused for a different wallet.
2. Authenticated encryption of per-wallet storage, with wallet identity and
   format version as authenticated data.
3. Irreversible, idempotent key revocation and an independently queryable terminal
   revoked state. A revoked identity must never be provisioned again.
4. A monotonic revocation registry outside host backups; restoring an old engine
   journal must not roll back revocation.
5. Explicit scope evidence for key replicas, exports, backups and retention.
   An HTTP success response or a local “deleted” flag is insufficient evidence.

The encrypted boundary must cover the **whole wallet**, not just its seed:
Core's database and auxiliary files, per-wallet temporary transaction history,
PSBTs, raw signed transactions and sweep intent journal. The global engine journal
may retain only an opaque identity, lifecycle phase and minimal expiry fields.
Cold descriptor/index state and spending-vault outgoing history remain separate.
Do not derive cold-index rollback protection from temporary-wallet state.

Core needs a plaintext working directory. That directory must be memory-backed
and exclude swap, hibernation, crash dumps and host memory snapshots. Its contents
must be checkpointed into the encrypted boundary before acknowledgement of any
state-changing operation. Recovery must restore ciphertext only after checking
the custodian's live revocation state. A custodian outage blocks recovery; it must
never trigger creation of replacement keys or a new Core wallet under the old ID.

This adds a service and an availability dependency: losing the custodian or its
active keys can lose unswept funds. A RAM-only key store is not an acceptable
shortcut because restarting the host would destroy funded wallets.

## Required storage inventory

This is an inventory of surfaces to verify on the eventual host, **not evidence
that they have been inspected or disabled in a deployed environment**.

| Surface | Required containment / evidence |
| --- | --- |
| Core descriptor SQLite `wallet.dat` | Entire database inside the independent encrypted boundary; working copy memory-only |
| SQLite `-wal`, `-shm`, rollback journal and temp files | Same containment as database; no plaintext spill to `/tmp` or an ordinary volume |
| Core `backupwallet`, exports and descriptors containing private keys | Disable/export-deny for temporary wallets; inventory existing exports |
| Core logs, RPC logging, process traces | No sensitive RPC payloads, descriptors, addresses or raw transaction logging |
| Engine `engine.json`, `.new`, intent state and file-system journal | No plaintext temporary-wallet detail; separately encrypted per-wallet checkpoint |
| Filesystem page cache and Core/engine process memory | Wallet unload, quiescence, teardown of working directory; no blanket claim of physical RAM erasure |
| Swap, zram writeback, hibernation and crash/core dumps | Disabled or otherwise proven outside recoverability boundary; restarting services alone is not proof |
| Coolify volume backups, tar exports and replicas | Ciphertext-only, with no key exports; verify schedules and retained historical copies |
| EBS/host snapshots, AMIs and disaster-recovery replicas | No plaintext working copies or key authority included; document existing retained snapshots |
| Key custodian replicas, snapshots and exports | All key copies within the revocation boundary; no backup that can restore revoked objects |
| Cloudflare D1, R2 and operational checkpoints | No temporary signing material or detailed temporary-wallet history |
| Offline spending backups and main-vault records | Retain; cannot include temporary wallets or their keys |

Neither unlinking nor overwriting proves SSD/EBS physical erasure. Cryptographic
revocation is meaningful only within the explicitly inventoried key-copy boundary.
It cannot remove blockchain records, recipient records or previously stolen keys.

## Destruction transaction required if the storage decision changes

1. Reconcile the node and require expiry, all balance buckets zero (including
   unconfirmed and immature), no UTXOs or locked inputs, settled sweeps and a
   stable active-chain observation. Check tracked replacements transitively.
   A missing/conflicted/evicted transaction blocks destruction.
2. Quiesce that wallet's signing and background operations. Anchor the observation
   to the exact tip; reload balances and transaction confirmations immediately
   before committing revocation. No Bitcoin protocol operation can prevent an
   unsolicited deposit racing the final check.
3. Durably enter a revoking phase before requesting revocation. On uncertain
   responses, query the same key identity; never create or import a substitute.
4. Unload the Core wallet, remove plaintext working copies and verify the
   custodian's terminal revoked state and absence of accessible key replicas.
   Partial failures stay blocked, not completed.
5. Remove ciphertext and detailed temporary history/intent remnants. Commit only
   a minimal expired record after every required boundary check succeeds.
   Resume this cleanup idempotently after a crash.
6. Allow authenticated, CSRF-protected, idempotent manual removal of that minimal
   UI record. Keep the custodian's opaque anti-resurrection marker, which is not
   transaction history. Main balances and spending outgoing history stay intact.

## Verification still required for the storage implementation

- Independent keys: destroying one wallet cannot affect another.
- Restore an old engine checkpoint and encrypted wallet backup after revocation:
  decryption fails, old identity cannot be reprovisioned, no keys are recreated.
- Crash at every revocation/cleanup boundary; ambiguous acknowledgements converge
  to the same terminal result without bypassing settlement checks.
- A late deposit after revocation is observable on the chain but cannot cause the
  engine to recreate a signer. Test with worthless regtest coins only.
- Confirm main/spending history survives temporary-history purge and manual delete.
- Exercise custodian outages, stale receipts and rejected authentication.

No production destruction or mainnet use is authorized by the approved funds
policy. Production activation requires separate approval and host-specific evidence.
