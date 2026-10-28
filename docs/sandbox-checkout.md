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
`amount_sats`, `reference`, `expiresAt`, `qrPayload` and `return_url`.
`return_url` remains null until simulated receipt. Redirect the shopper to `url`.
A repeated idempotency key and identical body returns the original checkout;
different input with the same key returns 409. Sessions expire after 30 minutes.
Amounts are integer satoshis, capped at 10,000,000 per checkout.

Customer “I've sent” only checks the existing state. It does not mark paid.
The authenticated merchant's explicit **simulate** action credits its simulation
balance once and creates a durable webhook event atomically in the same account
CAS write. Duplicate simulate calls cannot credit twice. Per-account daily
simulated receipts are capped at 10,000,000 satoshis. No external wallet, Core
RPC, mempool or signature is involved. The test receipt event must never fulfill
a real order. A URL redirect is not proof of payment.

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
Archive/export retention and pagination must be implemented before public scale,
never by putting the emergency controls behind the ordinary history limit.
The owner list currently supports at most 500 accounts; pagination/archival is
a launch gate. Rate limits include per-process limits, not a production-wide
distributed quota. Measure and strengthen these before public scale.

Continuation source supersedes those original limits: owner admin now pages 50
summary rows by stable ID cursor, with recent audit projections and matching
Previous/Next controls. Due outbox event IDs are selected across all accounts,
not the former 501-account scan. Source migration 5 adds D1-backed atomic quota
counters (database-clock minute windows), ingress/IP, selected endpoint and
authenticated tenant/key budgets with Retry-After. Developer quota failures do
not gate owner admin routes. Shared-store errors deny developer admission.
The existing explicit proxy-CIDR configuration controls client IP attribution.
These are locally tested source changes, not a hosted migration or capacity SLA.
Verified archival and tombstone preservation remain a release blocker; histories
have not been deleted and the per-account retention guards remain in place.

## Evidence and remaining gates

Local HTTP tests cover owner/developer separation, recent-passkey admin gate,
return URL rejection, idempotency mismatch, public status non-mutation, concurrent
simulation credit, tenant access denial, encrypted-secret storage, webhook lease,
pause/freeze/suspend, adjustment reconciliation and approval remaining disabled.
These are not proof of hosted mail, real-device passkeys, public webhook delivery,
restoration, production abuse resistance or actual Bitcoin readiness.

The prior signed-in browser run did not return a completed report. Do not count
its scenarios as passed. Root homepage cutover remains off pending acceptance.
No production deployment, Signet restart or real transfer is authorized here.
