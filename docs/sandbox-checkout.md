# Sandbox checkout and owner administration

This is a simulated checkout service, not Signet and not a live Bitcoin gateway.
Signet remains paused. No QR generated here is a Bitcoin payment request: it
encodes the opaque hosted checkout URL and must be labeled accordingly.

## Routes and identity

- `/admin`: existing owner session, separate from developer authentication.
  All admin writes require a user-verified owner passkey authentication within
  five minutes, CSRF, same-origin JSON and a reason. No password admin was added.
- `/developers/checkout`: verified, enrolled developer's own integration settings,
  API key, sessions, simulation control and webhook deliveries.
- `/checkout/:token`: public status-only hosted checkout. Random token is a
  read capability; avoid sharing sensitive order references. No PII, credential,
  signer or webhook secret appears in its response.
- `/api/v1/checkout/sessions`: merchant server creates sessions with a
  `Bearer sk_test_…` key and `Idempotency-Key` header (8–100 safe characters).
- `/api/v1/checkout/sessions/:id`: bearer-authenticated, tenant-owned status.
- `POST /api/v1/checkout/sessions/:id/simulate`: bearer-authenticated completion
  for automated tests (same `sk_test` key that created the session). Sandbox
  only; identical to the console's manual action, `paid_via: "manual_simulation"`,
  idempotent on paid sessions, 404 cross-tenant, 409 expired, 429 daily cap.

API keys are independent of login keys, stored as hash verifiers, checkout-only,
expire after 90 days and can be revoked. Creating one replaces the old key and
requires recent developer passkey authentication. Lost issuance responses require
fresh passkey confirmation and replacement; the original cannot be recovered.
Never put these keys in frontend HTML or browser scripts.

## Create and redirect

Configure exact HTTPS return URLs first. No wildcard matching, credentials,
fragments or custom ports. Creation body:

```json
{"amount_sats":25000,"reference":"order-123","return_url":"https://merchant.example/result"}
```

Response includes `id`, `url`, `status`, `environment: "simulation"`,
`amount_sats`, `reference`, `expiresAt`, `qrPayload`, `sandbox_destination`,
`paid_at`, `paid_via` and `return_url`.
`return_url` remains null until simulated receipt; once paid it is the saved
return URL with `checkout_id=<id>&status=simulation_paid` appended (existing
query parameters preserved), and the hosted page navigates there. Merchants
must accept those two parameters in their route validation and treat them as a
lookup hint only. Redirect the shopper to `url`.
A repeated idempotency key and identical body returns the original checkout;
different input with the same key returns 409. Sessions expire after 30 minutes.
Amounts are integer satoshis, capped at 10,000,000 per checkout.

Customer “I've made the payment” only re-reads the existing state. It does not
mark paid. Nothing reachable from the public page can.

### Settlement from a Sandbox wallet

The hosted page prints `sandbox_destination` (`checkout:<token>`). A developer
Sandbox wallet accepts that destination in Send: the lookup
(`GET /api/developers/sandbox/address?destination=checkout:…`) returns
`kind: "checkout"` with the order reference, exact `amount_sats`, the payer's
own demo-credit conversion, status and expiry, never the merchant's identity or
balance. `review` only accepts the server-computed amount; `pay` then runs a
three-phase settlement because payer and merchant are separate versioned rows:

1. Payer row: re-check the session is still payable, debit the balance and
   append a durable `settlements[]` record in state `debited`.
2. Merchant row: idempotent on the settlement id. Credits the balance, marks the
   checkout `paidAt`/`paidBy {via: "sandbox_transfer", accountId, settlementId}`,
   appends a merchant receipt with `direction: "in"` and queues the webhook event
   in the same CAS write. A session that is expired, already paid, suspended or
   over the balance/history limits refuses the credit instead of throwing.
3. Payer row: a refusal releases the debit (state `released`, review reopened,
   409 to the payer with the reason); otherwise the payer receipt is written and
   the settlement becomes `settled`.

Interrupted settlements are completed by the next `pay`, by `GET /sandbox`, and
by the webhook dispatcher sweep across tenants, so a merchant is credited even if
the payer never returns. Self-payment (merchant settles its own session) takes
the same path and nets to zero. The daily 10,000,000-satoshi receipt cap applies
only to manual simulation; funded transfers conserve simulated balance.

The authenticated merchant's **manual** console action (`simulate`) and the
bearer `POST /v1/checkout/sessions/:id/simulate` endpoint remain as the path for
automated tests without a payer wallet and report
`paid_via: "manual_simulation"`. Duplicate calls and later transfers cannot
credit twice. No external wallet, Core RPC, mempool or signature is involved.
The test receipt event must never fulfill a real order. A URL redirect is not
proof of payment.

## Webhooks

Setting/changing a webhook endpoint reveals a signing secret once. At rest it is
AES-256-GCM encrypted using a domain-separated key derived from SESSION_SECRET.
That existing server secret must contain at least 32 characters. Losing/changing
it without rewrapping prevents old pending deliveries from being signed. Back up
configuration through the approved secret flow; never place it in documentation.
Each event captures its destination, encrypted signing key and exact JSON body.
Changing settings does not redirect older events to a new destination.
If the secret reveal was lost, use **Replace signing secret**. Keep the prior
secret during a transition if previously queued events still need verification.

`X-Vault-Signature: t=<unix_seconds>,v1=<hex_hmac_sha256>`

Verify the HMAC over `<timestamp>.<raw_request_body>` with the saved secret,
using constant-time comparison; reject timestamps outside a small tolerance
(for example five minutes). Deduplicate by event `id`/`X-Vault-Event-Id`.
Retries retain the event ID and body but obtain a new signature timestamp.
Event type is `checkout.simulation_paid`, never a real-money `payment.paid`.
The body's `data.paid_via` names the settlement path.

### Why a spoofed webhook cannot mark an order paid

A webhook URL is not a secret; anyone may POST to it. The receiver, not the
sender, provides the protection, and the starter templates implement all of it:
the HMAC over `<timestamp>.<raw body>` with a secret only the merchant and this
service hold (missing signature = invalid signature), the five-minute timestamp
window against replays of captured deliveries, the unique event-ID insert
against replays inside the window, and binding of checkout id, reference,
`amount_sats`, `environment` and `type` to an order the merchant created. When
in doubt the merchant confirms with its own bearer key via
`GET /api/v1/checkout/sessions/:id`; `paid_at` is set only by a funded
settlement or the merchant's own console action. The return redirect carries
`checkout_id` and `status` for display only.

The API process checks the durable outbox every 30 seconds, up to ten due
deliveries per sweep. CAS leases prevent parallel instances from claiming the
same live attempt. Delivery is **at least once**, not exactly once: a process
can die after the receiver accepts but before acknowledgment is saved.
Non-2xx and timeout responses fail; redirects are not followed. Backoff is bounded
to one hour, automatic retries stop after eight attempts, manual retry requeues.
The UI exposes delivery status/attempts and generic failure details, never raw
upstream responses. This implementation requires a long-running API process.

Only public IPv4 HTTPS endpoints on port 443 are supported. DNS is resolved
before delivery and the vetted address is pinned while preserving TLS hostname
validation. Private, loopback, link-local and reserved addresses are rejected.
IPv6-only endpoints are not supported. No local webhook is called in tests:
the unit transport is injected and explicitly recorded as local evidence.

## Admin semantics

- Freeze blocks new outgoing reviews, sends and checkout creation; it does not
  confiscate a balance. Simulated incoming receipts remain possible.
- Suspend revokes sessions and API keys and blocks developer access.
- Revoke invalidates API keys and existing sessions, not the personal owner.
- Pause blocks new developer simulation writes, not monitoring reads or admin
  corrections. Already admitted in-flight operations can finish; it is not a
  transactional emergency stop on a real signer.
- Credit/debit is explicitly simulated, reason-required and integer-based.
  Adjustments require a unique `requestId`; retries must reuse the same ID/body.
  An unknown response must be reconciled, not resubmitted as a new adjustment.
- Approve/reject records an application decision only. `liveEnabled` stays false.
  No live keys, Core credentials, failed-chain “refund” or RBF action exists here.

Controls live in additive `developer_control`; tenant checkouts, outbox and admin
audit live within their existing versioned developer account record for atomicity.
No duplicate ledger table, R2-mounted database or source-derived live migration.
History limits fail explicitly (500 sessions/account, 2,000 admin audit entries).
The 2,000-entry limit applies to ordinary tenant-embedded history, not emergency
owner suspension/revocation. Those actions write separate append-only
`developer_security_audit` rows: `requested` before the account update and
`applied` after success. This prevents a developer from filling its history to
disable the owner's controls. The original history is never truncated or replaced.
A crash may leave a `requested` event; reconcile against account status and
sessions before claiming the action was applied. If acknowledgment fails after
revocation, rechecking/repeating revocation is safe.

Security history has no application row-count cap and does not grow the tenant's
JSON row. Database capacity/backup monitoring still applies. No automatic deletion
or purge is authorized. The admin view shows the last 100 ordinary entries per
account plus up to 100 security entries per account from the latest 1,000 global
security events; older security records remain stored for authorized export.
Owner admin pages 50
summary rows by stable ID cursor, with recent audit projections and matching
Previous/Next controls. Due outbox event IDs are selected across all accounts,
not the former 501-account scan. Source migration 5 adds D1-backed atomic quota
counters (database-clock minute windows), ingress/IP, selected endpoint and
authenticated tenant/key budgets with Retry-After. Developer quota failures do
not gate owner admin routes. Shared-store errors deny developer admission.
The existing explicit proxy-CIDR configuration controls client IP attribution.
These are locally tested source changes, not a hosted migration or capacity SLA.
Verified archive copy and receipt/idempotency lookup are implemented and locally
tested. Pruning is restricted to disposable tests; no scheduler or public API
performs archival. Hosted retention/restore approval remains a release blocker.
Histories have not been deleted and per-account retention guards remain in place.

## Live behaviours not yet defined

Documented explicitly in the API guide (chapter 9) so integrators do not infer
them from Sandbox: confirmation depth, under/overpayment, late funds after
expiry, refunds, fees, settlement timing/payout, and real-payment event names and
statuses. These are unspecified until Live activation, not silently absent.

## Evidence and remaining gates

Local HTTP tests cover owner/developer separation, recent-passkey admin gate,
return URL rejection, idempotency mismatch, public status non-mutation, concurrent
simulation credit, tenant access denial, encrypted-secret storage, webhook lease,
pause/freeze/suspend, adjustment reconciliation and approval remaining disabled.
These are not proof of hosted mail, real-device passkeys, public webhook delivery,
restoration, production abuse resistance or actual Bitcoin readiness.

The prior broad signed-in browser run did not return a completed report. Do not
count its scenarios as passed; see developer-release-commissioning.md for later
focused reports. The developer homepage is now the source default at root
unless VITE_DEVELOPER_HOMEPAGE=false; owner navigation uses its configured prefix.
No production deployment, Signet restart or real transfer is authorized here.

## Pricing and verification — 2026-10-29

The default backend price source is Coinbase Exchange BTC-USD, not Cloudflare
Access. MARKET_PROVIDER=coinbase selects it explicitly. Requests are shared
within each API process with a 60-second refresh throttle, one in-flight fetch,
a ten-second timeout and no redirects or credentials. Provider errors stop
provisioning; no synthetic price or automatic provider fallback is used.
The trade timestamp must be within three minutes (maximum future skew 30 seconds).
History contains observed quotes only; it is not a backfilled chart.

All seven developer test files plus the public-price and Access-request suites
passed (16 top-level tests). A separate disposable HTTP lifecycle run with
LIVE_MARKET_TEST=1 used an actual fresh public quote and verified successful
provisioning, repeat-call non-duplication, tenant separation and simulated sends.
Its email transport and passkey enrollment are modeled: this is not a hosted
signup, real-device WebAuthn, public webhook or real-Bitcoin acceptance claim.
