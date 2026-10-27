# Hosted readiness audit — 2026-10-27

**Release gate: NOT CLEARED.** No deployment, resize, Signet restart or real
transfer was performed. Cloudflare requests were read-only, including SELECT
queries submitted through D1's query API. No secrets or wallet data were read.

## Independently observed hosted facts

| Check | Observation | Conclusion |
|---|---|---|
| Published website | An unauthenticated request to `https://mainvaultwallet.com/api/vault/session` returned `authenticated: false`, `network: signet` | Published runtime is not verified as the new mainnet-only website. This does not reveal which signer it can reach or authorize any operation. |
| D1 | The configured `personal-vault` database exists and matches the source binding | Database identity verified for the connected Cloudflare account. |
| D1 schema | `vault_state`, `prices`, `replica`, `vault_schema_migrations`, plus Cloudflare's `_cf_KV` | No duplicate application tables observed. |
| Metadata | Existing singleton state is valid JSON; version was 98 at observation | Not a custody or backup-integrity test. No JSON contents or sessions were fetched. |
| Replica | No rows returned | No stored node-health snapshot verified. |
| R2 | Bucket-list API returned HTTP 403, code 10042, “Please enable R2 through the Cloudflare Dashboard.” | Cannot verify operational R2 backups in this account. Do not infer that backups exist elsewhere or that none exist anywhere. |
| Workers | Returned script list did not contain `personal-vault-metadata` | Expected vault Worker not verified deployed; no namespace configuration could be verified. |
| Queues | `personal-vault-replica` and its dead-letter queue exist, both list no producers/consumers | Expected Worker replication pipeline is not verified connected. |

The connector API base includes `/client`; correct requests start with `/v4`.
Earlier requests using `/accounts` or `/client/v4/accounts` had not verified
Cloudflare deployment state. The current successful reads supersede that
earlier connectivity limitation.

## Earlier screenshot evidence — not a fresh hosted test

- Mainnet Core and signer were running; old Signet containers were stopped.
- Core's named-volume devices referenced `/mnt/vault-mainnet/bitcoin` and
  `/mnt/vault-mainnet/cookie`.
- Mainnet and Signet had distinct volume references/private RPC networks.
- Signer volume references existed, but this audit did not read their contents,
  independently validate their underlying mount device, or perform a restore.
- No proof of disk encryption follows from a volume name containing “encrypted.”
- Screenshots do not verify current port publishing, firewall policy, runtime
  credentials, sync freshness or wallet readiness.

## Remaining hosted gates

1. From the **website container**, inspect only safe network flags and
   presence/absence of connection variables. Do not paste tokens or environment
   dumps. Keep Signet disabled and do not move its credentials into Live.
2. Verify authenticated read-only mainnet sync freshness and correct signer
   network. Website publication/version, explicit mainnet authorization and
   signer readiness must agree; a mainnet monitor alone is insufficient.
3. Inspect current Core/signer mount mappings, port bindings and firewall
   boundaries without restarting or altering them.
4. Resolve Cloudflare deployment/binding gaps through an explicitly authorized
   rollout. Set independent network namespaces/credentials/queues. Do not deploy
   the new Worker without `REPLICA_NETWORK`; preserve any legacy records/files.
5. Verify an encrypted backup and perform an authorized restore into an isolated
   destination. Read-only inspection alone cannot prove restore success.
6. Only after full sync and the preceding gates, obtain explicit owner approval
   for a small real-BTC receive/send. Signet remains paused.

## Local UI acceptance — separate evidence

Two focused portions of the same disposable-fixture pass returned reports:

- Settings save/unpause, explicit recipient lookup, hiding old observations
  after an address change or failed refresh, explicit payment approval and one
  pending mock receipt passed.
- QR/logo visibility and logo centering were visually checked at 390px and
  1024px. Screenshots used the existing built fixture; the later outer
  receive-card centering CSS adjustment is separately source/typechecked, not
  represented as screenshot-verified.
- Short review expiry blocked submission. A one-shot lost-response interceptor
  let the backend accept once and then aborted the browser response. The UI
  prevented resubmission; Activity showed the resulting txid once.
- Assigned-identifier Sandbox simulation produced a TEST receipt with no real
  value or TXID. Downloaded text was inspected and print invoked with printing
  stubbed. Signet remained unavailable; Return to Live worked.
- Session revocation returned HTTP 401 and the locked view without visible
  private content. This is not a direct inspection of query-cache memory.

Not browser-verified: invoking Live receipt print/download, offline node
recheck, automatic time-based session expiry or complete all-route viewport
coverage. No real BTC, hosted signer or external indexer was used in the UI test.

## GitHub preparation status

The initial fetch failed with SSH `Permission denied (publickey)`. This blocker
has since been resolved: the owner added the new repository-specific deploy key
with write access, and a successful fetch authenticated to GitHub.

Working branch `main` was eight commits ahead and zero behind the freshly fetched
`origin/main` at verification. The working tree was clean and the diff whitespace
check passed before this documentation update. Push permission was not exercised.

GitHub's ED25519 host fingerprint was verified against its HTTPS `/meta` API.
Repository-local SSH configuration selects the new key and retains strict host
checking. Its private key is outside the repository with restricted permissions;
no existing Coolify key was replaced.

No force push, rebase, push or deployment was performed. A push may trigger
Coolify deployment; it requires a separate explicit decision while the hosted
readiness gates remain open.
