# Owner login protection

## Implemented policy

- Three invalid credentials within a one-hour window block that observed client IP
  for one hour from the third failure. Requests during cooldown do not extend it.
- Correct credentials do not bypass the cooldown. After expiry, retry normally.
  A successful allowed login resets that IP's failure count.
- All key-login attempts share a persistent 30-attempt/60-second budget, including
  requests from different IPs. This limits distributed guessing but can also deny
  the owner temporarily under attack. It is not a VPN detector or a DDoS service.
- State updates use the existing D1 compare-and-swap storage (SQLite only in local
  development). Concurrent attempts cannot overwrite each other's counters.
  A storage outage fails closed. No new D1 migration is needed for the optional
  state fields. Bounds cap IP records at 2,000; expired entries are pruned.
- Passkey login respects an active key-login cooldown; it retains its existing
  independent request throttle. The three-failure counter applies to access keys,
  not cancelled WebAuthn ceremonies.
- HTTP 429 responses include `Retry-After`. The lock page disables submission and
  displays a countdown; session refresh/reload restores server-authoritative timing.
  Changing the browser clock or re-enabling a button does not bypass server checks.

## Proxy configuration is a deployment gate

`TRUSTED_PROXY_IPS` is a comma-separated list of **exact** trusted proxy IPs.
Blank means do not trust forwarded headers. Never use `true`, a hop count, or
arbitrary internet ranges. Invalid entries fail API startup.

Express walks X-Forwarded-For from the socket peer toward the first untrusted hop.
Forged leftmost addresses and CF-Connecting-IP/X-Real-IP headers are not accepted
as independent authority. IPv4-mapped addresses are normalized.

Verify the actual Coolify/Cloudflare chain before entering proxy addresses.
Block direct access to the app container, and configure the reverse proxy to
sanitize forwarded headers. Without correct settings clients may share the
proxy's cooldown. Changing the deployment topology requires repeating this check.
No Apache component was added: another proxy cannot reveal the original address
behind a VPN. IPv6 address rotation is covered only by the overall budget.

## Security email

Configure runtime-only `SECURITY_ALERT_TO`, `SECURITY_ALERT_FROM` (verified Resend
sender), and `RESEND_API_KEY` (sending-only, domain-restricted where possible) in
Coolify. The recipient selected in chat has been saved in the development
environment rather than application source. Resend authorization and the sender
still need setup. A Replit connection is not automatically exported to Coolify.

Invalid-key events create a bounded durable alert slot. At most one event is
queued every 15 minutes; intervening events are suppressed, not a full audit log.
The worker polls every minute, uses a stable provider idempotency key, and retains
failed deliveries for retry. At 23 hours an undelivered alert expires with an
explicit warning, preventing indefinite IP retention/idempotency-window replay.
An accepted email API response does not prove delivery to the recipient's inbox.

Only event time and the observed IP go in the email—not submitted keys, hashes,
session cookies, wallet addresses or balances. The IP may identify a VPN exit, not
a person. Alert IP data is removed after acknowledgement or expiry; IP counter
keys are hashed but are pseudonymous, not guaranteed anonymous.

The request path never waits for the email provider. Missing configuration and
provider errors produce explicit generic logs without secret values.

## Verification boundary

Local tests cover three failures, exact cooldown expiry, serialized state reload,
changing IPs, concurrent failures, rejected correct keys during cooldown, trusted
and spoofed proxy headers, HTTP countdown state, and mocked email failure/retry.
Live D1 concurrency, deployed proxy topology and real email delivery are separate
commissioning gates. Keep mainnet disabled until the broader recovery work passes.

The browser test runner could not reach the isolated temporary server on port
8095 (connection refused despite local startup). Therefore the interactive
countdown/restart journey has not been browser-verified. The HTTP integration
and state-transition tests passed; do not equate those with an end-to-end pass.
