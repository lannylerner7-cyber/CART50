# Developer release commissioning — 2026-10-28

## Owner-authorized homepage cutover

The owner explicitly requested root developer entry now. The default build
therefore enables the existing homepage switch; explicit
`VITE_DEVELOPER_HOMEPAGE=false` remains a rollback option. The existing personal
prefix (concatenated 1 through 256, followed by `/mainvaultwallet`) remains its
entry point. Developer deep links remain `/developers/...`. No duplicate page
files, database movement, domain/RP change or custody enablement is involved.
Older notes below describing the switch as off are historical. Intro Skip and
other unpassed acceptance items are not reclassified as passed by this decision.

Cutover verification: normal frontend typecheck/build passed. After restarting
the Replit frontend, 390px screenshots confirmed `/` renders Developer access
and the complete owner-requested long URL renders the locked personal vault.
No owner credential was entered; no signed-in acceptance was rerun or implied.

## Current continuation status

The isolated fixture now supports `VAULT_UI_FIXTURE_HTTPS=1` on loopback 4443,
with one-day disposable localhost certificates and its own random SESSION_SECRET,
owner credential and SQLite. `VAULT_UI_FIXTURE_STATIC_DIR` can serve a temporary
staged build. Normal preview/root routing has not been switched.

Owner selected **existing D1** for shared quotas. Source now includes additive
schema version 5 and atomic database-clock quota counters, ingress/IP budgets,
authenticated tenant/key budgets and Retry-After. Owner admin routes bypass
developer quotas; quota-store failures deny developer admission. Existing explicit
trusted-proxy configuration supplies req.ip, not raw forwarded headers. Tests
use independent SQLite connections, not hosted D1 performance evidence.

Admin source now uses a 50-account keyset page plus lookahead, SQL field
projections and bounded recent audit, with matching generated contract and
Previous/Next UI. The outbox now projects ten due event IDs across all accounts,
ordered by due time, instead of reusing the 501-account admin scan. Its existing
CAS leases remain authoritative. A 505-account regression and independent-connection
quota race/outage checks passed, alongside checkout/admin/schema regressions:
10 selected tests and both typechecks.

**Not complete:** production archival policy/operation, summary pagination's
authenticated browser acceptance and hosted multi-instance D1 commissioning.
Archive copies/pruning were exercised only with disposable data; existing
production retention guards remain.
The normal Replit `/developers` landing was visually checked at 390px, without
browser errors. Normal `/` remains the owner page pending acceptance.

The HTTPS staged root rendered developer entry and its checkout deep link worked.
Public checkout displayed “not found” during the first HTTPS browser run,
although a direct request for the stored token returned HTTP 200 pending.
The exact-URL follow-up below resolved that observation. Do not enable the normal
homepage switch while Intro Skip acceptance remains blocked.

The diagnostic browser report subsequently confirmed the public API used the
correct 80-character token, matched the stored URL and returned 200 pending,
then 200 simulation_paid. This narrows the issue but is not a completed QR/UI/
automatic-redirect assertion. Normal owner login now provides a Developer access
link to `/developers`, making the existing pages reachable without root cutover.

**Subsequent focused checkout report:** A new preview opened from the exact
returned URL rendered the branded QR and status-only button over local HTTPS.
Pressing the button left status pending and the developer balance unchanged.
Explicit simulation changed the buyer UI to simulated-paid and automatically
redirected to the locally intercepted callback. No external callback was made.
The initial not-found observation was not reproduced with that exact URL.
The callback was not reached within five seconds of the merchant's simulation
click, but was reached within an additional four seconds. Source starts its
five-second countdown when the buyer observes paid status, after up-to-five-second
polling latency; five seconds from the server-side action is **not certified**.

Final continuation checks passed both typechecks, the normal frontend build and
17 tests spanning quota concurrency/outage, beyond-bound paging/outbox scanning,
checkout/admin, encrypted backup recovery, static routing and additive schema.
The actual Replit owner login rendered its Developer access link at 390px.
Neither this evidence nor the temporary staged build enables normal root cutover.
At that intermediate checkpoint, archive and browser isolation/expiry evidence
were still incomplete; the final continuation results below supersede it.

### Final continuation evidence and remaining gate

The follow-up verified A/B separation in the disposable HTTPS fixture: B's key
could not retrieve A's checkout (404), B's session could not simulate it (404),
and A's balance/history were unchanged. B session expiry automatically returned
to login without reload within 36 seconds; old balance and key patterns were
absent from the DOM. An expired protected deep link returned to login. Staged
developer root and the exact locked owner prefix rendered correctly.

**Intro Skip remains NOT PASSED.** Fresh contexts did not show its control,
including an explicit no-reduced-motion context with test-only video pause hooks
and immediate click. The MP4 is served as HTTP 200 video/mp4 and ffprobe identifies
H264/yuv420p; this does not prove browser decoding or gate visibility. Stop broad
reruns and diagnose the gate before enabling normal homepage cutover.

Source migration 6 adds verified checkout archive copies scoped by account,
with checksum validation and a unique hashed idempotency index. Receipt/public
lookup and create replay consult archived records, failing closed on corruption.
CAS callbacks now await archive lookups before committing. Copy-first retention
considers only checkouts older than 90 days with no undelivered events. Copies
are verified before any removal; **pruning is restricted to NODE_ENV=test** and
there is no scheduler, public endpoint or hosted deletion. Disposable tests cover
copy-before-removal, receipt/replay, changed-input rejection, account isolation,
corruption and the production pruning prohibition. This is an archival primitive,
not authorized production retention policy or a commissioned archive/restore
service. Audit archival and production operator rollout still require review.

The final selected suite has **18 passing tests** and API typecheck passes;
frontend typecheck/build remain valid (no subsequent frontend changes). Hosted
D1 migrations 5/6 have not been executed. Replit development has no CF_ACCOUNT_ID
or CF_D1_DATABASE_ID configured; its local tests are not hosted D1 evidence.

The HTTPS fixture was stopped and its disposable SQLite/credential/certificate
directories and temporary staged build were discarded after acceptance work.
Replit preview services are running current source. No GitHub push occurred.

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
