# Server-held personal vault — first custody milestone

The owner confirmed personal-vault scope: no customer accounts, public API,
gift-card uploads, Redis or database sharding in this milestone.

## Implemented mode

The original milestone was test-network only. Explicit mainnet support and a
separate resource are now prepared; see [mainnet and capacity](mainnet-and-capacity.md).
The existing live environment has not been switched by this work.

Set `VAULT_CUSTODY_MODE=server` on the **signer** runtime. It creates an independent
Core descriptor wallet named `vault-reserve` with private keys, displayed as
**Main vault**, alongside `vault-spending`. No external destination or
`COLD_DESCRIPTOR` is needed for this mode.

Existing installs default to `external`; missing descriptors in external mode
leave cold receiving/sweeping unavailable rather than inventing a destination.
Existing watch-only wallet records and funds are not deleted or converted.
Changing modes requires sending/sweeps paused and no unresolved payment intents.
If those conditions are not met, startup fails explicitly. Do not bypass this by
editing the journal. Core wallet identity must have private keys; a watch-only
wallet named `vault-reserve` is rejected.

The Send screen selects Main or Spending and shows the source again at review.
Review/sign/send and RBF use that selected wallet, rejecting cold/temporary wallets
as user payment sources. Temporary sweeps allocate fresh Main-vault addresses in
server mode and retain the existing three-confirmation, fee-limit and journal
rules. The main vault is online/hot custody, not cold storage.

## Operator transition (not performed automatically)

1. Preserve volumes and independent backups of existing permanent wallets.
2. Pause sending and sweeps. Resolve pending/review/uncertain/conflicted intents
   through normal reconciliation before attempting a mode change.
3. Deploy matching website/API and signer code so the contract accepts `reserve`
   wallet kinds and payment source selection.
4. Set signer runtime `VAULT_CUSTODY_MODE=server`; do not mark it as build-time.
   Descriptor variables can be omitted for server custody. Leave network Signet.
5. Restart signer, verify healthy reconciliation and Main-vault receipt/source
   selection. Old cold records remain separate.
6. Back up the new reserve wallet before funding it. Verify recovery with
   disposable funds and configure positive policy limits before unpausing.

Do not delete volumes, reuse a Signet private wallet as mainnet custody, or start
additional signers against this wallet state. This milestone does not enable
mainnet or claim readiness for real money.

## Backups

The encrypted recovery JSON permits an optional `reserveWalletBackupBase64`
alongside `spendingWalletBackupBase64`. For server mode with no external descriptor,
use `coldDescriptor: ""` and `coldIndex: 0`; keep version 1.
Use Core `backupwallet` separately on `vault-reserve` and `vault-spending`, then
encode those backups for the offline encryption utility. Never export temporary
wallets or the whole journal. A private backup remains sensitive even as base64.

Encryption validates the JSON envelope, not the contents of opaque wallet blobs.
The operator must verify wallet identity and restore them with the right node
network. Permanent reserve backups are **not** subject to five-day temporary expiry.
Offline key storage and actual hosted recovery remain operating responsibilities.

## Validation and limits

Real isolated Core regtest covers reserve receipt, reviewed send, duplicate-send
identity, source-isolated fee replacement, confirmation, engine reconstruction,
temporary consolidation, and Core reserve backup restoration.
These checks are not evidence of mainnet transfers or hosted disaster recovery.

The signer still serializes stateful operations and owns an exclusive journal
lock. There is no claim of 10,000-request capacity. Scaling later needs bounded
admission/queues, idempotent submission, coordinated UTXO locking and measurements.
Do not horizontally clone signing authority or treat cached balances as spend
authorization. Shared D1 state and browser session semantics require a separate
multi-instance audit before adding web/API replicas.
