# Developer release commissioning — 2026-10-28

## Authorized hosted observations (read-only)

The attached Cloudflare connection successfully listed the account and queried
the D1 database identified by the source configuration (`personal-vault`).
Read-only queries reported zero rows written:

- Schema migration **1** only, applied 2026-10-17.
- Tables: `_cf_KV`, `prices`, `replica`, `vault_schema_migrations`, `vault_state`.
  Developer tables and migrations 2–4 are absent in this database.
- The available account listed only Worker `wandering-butterfly-6a6e`, whose
  settings returned no bindings. The source Worker `personal-vault-metadata`
  was not listed. This does not prove what runs under a different account.
- `personal-vault-replica` and its DLQ exist with no consumers listed.
- R2 listing returned HTTP 403/code 10042, “Please enable R2 through the
  Cloudflare Dashboard.” Do not infer that older backups are safely elsewhere.
- An unauthenticated GET to the previously supplied website
  `https://mainvaultwallet.com/api/developers/session` returned HTTP 404 JSON.
  It did not provide the new registration/terms configuration.

No hosted data, queue, Worker, DNS, environment variable or deployment changed.
The Cloudflare connection does not establish the Coolify website's actual
runtime environment or prove it uses this database. That mapping remains a gate.

## Hosted commissioning blockers

Obtain authorized test website, controlled mailbox and HTTPS webhook receiver.
Obtain a sanitized runtime configuration report: variable names/presence only,
network, public origin, selected database ID and deployed revision; never secret
values. Compare approved legal terms/version to the owner's approved document,
not merely whether two environment variables are nonempty.

Then, only on an approved isolated test deployment:

1. Verify delivery to Inbox/Spam/Junk and key expiry/replay rejection. SMTP
   acceptance alone is not proof of mailbox delivery.
2. Verify quote provider timestamp, freshness under three minutes and explicit
   provisioning failure for stale/unavailable prices.
3. Apply reviewed additive migrations only with separate rollout authorization.
   Export/snapshot and restore to a separate disposable database, never overwrite
   the personal-vault production database. Compare schema, row counts and hashes;
   do not publish account JSON or credentials.
4. Restore encrypted webhook state together with its original SESSION_SECRET
   through the approved secret channel. Verify successful signing after restart,
   failure with a different key and recovery with the original. Rewrapping must
   retain the old key until all records and queued snapshots are checked.
5. At a controlled public HTTPS IPv4 receiver, verify HMAC over timestamp plus
   exact raw body, constant-time comparison and timestamp tolerance. Persist
   event ID uniquely before applying a business effect. Return 2xx for repeats.
   Reject altered body/signature, stale timestamp and mismatched event IDs.
6. Exercise receiver 500, delay beyond five seconds, connection failure and
   acknowledgment loss after durable receipt. Confirm retry has the same event
   ID/body, new timestamp and exactly one receiver effect. Confirm eight-attempt
   stop, manual retry and restart/lease recovery.

These hosted checks have not passed. The owner authorized the existing website,
a controlled test mailbox and `https://webhook.mainvaultwallet.com`. Receiver DNS
lookup returned `ENOTFOUND`; no webhook was sent. The website's developer endpoint
returned 404, so no enrollment mail was sent. No isolated restore target or
Coolify read-only connection was established in this run.
Local virtual authenticators, synthetic quotes, mail sinks and injected transport
are categorically different evidence.

## Measured capacity and proposed design (not deployed)

`scripts/developer-capacity-check.mts` creates synthetic in-memory SQLite rows
without any hosted connection. A 500-account sample, each with five checkouts,
five deliveries and 20 audit entries, produced:

| Read | Serialized result | p50 | p95 |
| --- | ---: | ---: | ---: |
| Existing 501-row read | 12,083,501 bytes | 48.75 ms | 167.98 ms |
| 51-row cursor candidate | 1,232,518 bytes | 4.07 ms | 7.26 ms |

These are local SQL/JSON timings, not network, D1, concurrent HTTP or SLA evidence.
A synthetic account at 500 checkouts/deliveries and 2,000 audit entries was
2,347,238 bytes. It is unsafe to treat count limits alone as storage capacity
guarantees. Actual passkeys, sessions and ledger data add further bytes.

Before public scale:

- Introduce stable keyset pagination (50 items plus one lookahead), cursors bound
  to filters/tenant, explicit `nextCursor`, and summary projections excluding full
  account JSON. Test inserts between pages and cursor tampering. API/UI contract
  changes must ship together; do not simply remove the 500-account guard.
- Page outbox processing fairly across all accounts. The present 501-account
  scan must not strand later accounts. Use due-time/event-ID cursors, leases and
  per-tenant budgets; retain atomic credit-plus-outbox creation.
- Introduce versioned archival only after terminal status, expired retry windows
  and backup verification. Preserve idempotency tombstones and receipt lookup.
  Never archive pending deliveries or lose duplicate-payment protection. Store
  a verified checksum/manifest before deleting any source; require explicit
  retention approval. Emergency security audit remains independent and durable.
- Use a shared atomic limiter at the trusted ingress or dedicated shared store,
  keyed by tenant/key hash, trusted client IP and endpoint class. Define separate
  registration/email/verification/key-issuance/create/status budgets. Return
  bounded Retry-After, cap payload size and concurrency, and protect reads against
  amplification. Do not block owner emergency revocation behind tenant quotas.
  Validate proxy/IP trust before using forwarded headers.
- Measure with at least two API instances, bursts, a noisy tenant, shared-store
  outage and recovery. Set final quotas from measured D1/SMTP/receiver capacity,
  not from the single-process limits or this local benchmark.

Homepage cutover, live custody and public-scale readiness remain gated.

## Local browser evidence

One persistent Chromium tester used only the isolated fixture and a CDP virtual
authenticator with resident keys and user verification. This exercised actual
server-side WebAuthn verification, not a seeded passkey timestamp:

- Scroll-end terms acceptance, 24-character email key from local mailbox,
  mandatory passkey enrollment and synthetic-quote provisioning.
- One-time 86-character key issuance, passkey recovery, rotation, old-key
  rejection (401) and successful login with the replacement key.
- Developer console settings, fresh-passkey API key issuance, preview creation,
  explicit simulation confirmation and one 21,000-satoshi credit.
- Console and Sandbox had no document-level horizontal overflow at
  360/390/768/1366px. This is not proof of every responsive component/state.
- Expiring the fixture session then reloading redirected to empty login with no
  balance or key reveal. Immediate clearing without reload remains unverified.

The public checkout browser route returned 404 despite its API returning the
correct pending/paid statuses. Root cause was the server's dotted-path asset
guard rejecting the token separator. Source now allows only the exact checkout
token path through SPA fallback; regression tests retain missing-file/dotfile
rejection. Public checkout tokens are also redacted from request logs.
The fixed public browser flow has not been reverified on HTTPS. The HTTP fixture
intentionally does not render HTTPS-only preview links/QRs. Callback parameters
were checked separately and navigation intercepted locally, not proof of the
automatic public-page redirect or real receiver delivery.

Intro skip click, a second developer's full browser journey, automatic expiry
cache clearing and HTTPS public checkout/QR/redirect remain open release gates.

Owner-prefixed Settings, Sandbox and admin loaded and survived reloads. Owner
authentication remained valid after developer expiry; a developer-only browser
context saw owner login rather than the admin listing. Real virtual-authenticator
owner passkey enrollment and step-up succeeded. Reason-required Freeze/Activate
changed the disposable account and its account audit, while Live stayed disabled.
Return to Live remained under the owner prefix. These pages had no document
overflow at 390/768/1366px. Transient 503 resource responses were observed on
initial owner pages; the fixture has no hosted engine/monitor credentials, and
these observations do not establish hosted service readiness.

The global pause/resume audit was empty after account actions, correctly stored
in their separate account audit. Its ambiguous UI heading has been clarified.
An intermediate test observation exposed the disposable owner credential; the
fixture is discarded after testing and this credential must never be reused.
No real owner credential was used.

Final local checks: API typecheck and 11 selected tests passed (static routing,
checkout/admin, encrypted backup recovery and additive schema). The development
preview's invalid-checkout screen rendered at 390px; that is error-state evidence,
not a successful hosted checkout acceptance.

The local encrypted-backup test copies a disposable SQLite fixture and recovers
the encrypted signing secret with the original synthetic SESSION_SECRET. A
different key fails authentication. It does not establish D1 backup/restore or
recovery of any production secret.
