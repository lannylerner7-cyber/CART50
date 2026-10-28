# Developer access and release gates

## Separation

Developer accounts are not owner accounts or Bitcoin signers. Their simulated
checkout integration is described in `docs/sandbox-checkout.md`.
`/api/developers` has its own `__Host-developer_session` cookie, CSRF header,
session records, passkeys and login credential verifiers. The existing
`/api/vault` owner middleware is unchanged. A developer cookie cannot authorize
an owner operation. Application code never selects a signer from a key prefix.

`developer_accounts` stores one versioned JSON record per developer, with a
unique normalized email and independent simulation ledger. Updates use
compare-and-swap at the database, not an in-process wallet lock. The separate
`developer_challenges` table stores expiring, hashed-ID WebAuthn challenges,
atomically consumed once. It does not contain secret private passkeys.
Migration version 2 is additive; owner state, replica rows and old encrypted
backups are not rewritten. D1 is still required in production; local acceptance
uses disposable SQLite. Deployment, not editing source, runs schema changes.

## Onboarding and credentials

Apply requires viewing the end of the agreement and explicitly accepting it.
This records the accepted version and server time; scrolling is not proof that
someone understood a contract. Draft preview terms must not be used for public
production enrollment.

Email keys use 18 cryptographically random bytes encoded into 24 base64url
characters, are stored only as SHA-256 verifiers, expire in 15 minutes and allow
five attempts. Resend invalidates the previous key, with a 60-second cooldown.
Pending delivery/sent/failed state is durable; plaintext mail payloads are not
queued in D1. A server interruption during delivery requires an explicit resend
after cooldown, not replay of a stored plaintext email. SMTP acceptance is not
proof of Inbox delivery. Inbox, Spam and Junk guidance appears in the UI.

Email verification creates a limited onboarding session, not full workspace
access. A user-verified, discoverable WebAuthn passkey is mandatory. If an
onboarding session is lost before enrolling a passkey, the user may verify a
fresh email key; after enrollment, email alone can no longer restore access.

Provisioning uses a fresh existing market-feed quote (maximum age 3 minutes).
It allocates an integer simulated-satoshi balance corresponding to at most
3,000 demoUSD at that captured quote, rounded down by less than one satoshi.
No quote means provisioning waits with an explicit error: no fake BTC amount.
The 15-second animation is client presentation; the server never sleeps for it.
Retrying provision cannot credit an account twice.

The separate 86-character login key is 64 random bytes in unpadded base64url,
stored only as a SHA-256 verifier. It is not a wallet private key or merchant
API key. Initial issuance and rotation require passkey authentication within
five minutes; that proof is consumed. A key is revealed once, not recoverable
from the database. Rotation invalidates old keys and other sessions. If the
response is lost, sign in with a passkey again and rotate; do not blindly retry.
Loss of all passkeys and the saved key has no email-only bypass.

Session cookies are HttpOnly, Secure, SameSite=Strict and host-only. Sessions
expire after 30 minutes. All developer responses are no-store; writes require
same-origin JSON and authenticated writes require their separate CSRF header.
No optional analytics cookies are implemented, so ignoring optional consent
does not cause tracking. Necessary authentication cookies are disclosed.

## Simulation amounts and payment behavior

Simulation satoshis are the source of truth. The reused USD input is converted
with the recorded quote; outgoing amounts round up to the next simulated satoshi
so precision never creates balance. The displayed valuation is explicitly the
recorded provisioning quote, not a claim of current market value. Existing owner
demoUSD history is unchanged.

Each developer has a distinct assigned identifier. No arbitrary address query,
external wallet transfer or actual Signet send occurs. Reviews bind account,
session, destination, amount and expiry. Approval is explicit. A repeated review
returns the same receipt, including after an interrupted response; concurrent
updates use CAS. Histories are bounded and reject new reviews when full rather
than silently deleting payment evidence. Receipts remain simulation disclosures.

## Route and authorization matrix

| Plane | Route | Authority |
| --- | --- | --- |
| Developer entry | `/developers` and auth children | Public information / limited onboarding |
| Developer Sandbox | `/developers/sandbox/*` | Verified, passkey-enrolled developer, own data only |
| Developer Live introduction | `/developers/live` | Developer; locked, no real balances or signer |
| Developer API | `/api/developers/*` | Separate developer session and CSRF |
| Owner API | `/api/vault/*` | Existing owner session and CSRF |
| Sandbox merchant API | `/api/v1/checkout/sessions` | Hashed checkout-only tenant API keys; no live transfers |
| Simulated checkout | `/checkout/:token` | Opaque public status; explicit authenticated simulation only |
| Admin decisions | `/admin` | Existing owner authentication, recent passkey and audit; no custody enablement |

The long personal-vault path is only a routing prefix, not a secret. The root
homepage cutover must be tested with nested navigation, direct reloads, owner
passkeys and existing APIs. Do not move Core files, signers or change domains.
Changing the frontend path does not change the WebAuthn RP ID.

## Production configuration and launch blockers

Names only; never put real secrets in these documents:

- `DEVELOPER_TERMS_VERSION` and `DEVELOPER_TERMS_TEXT`: owner-approved legal terms
  and privacy disclosure. Both are required to open production registration.
- `DEVELOPER_MAIL_FROM` (or existing `SECURITY_ALERT_FROM`), existing SMTP
  configuration: independently verify authorized sender and actual delivery.
- Existing `PUBLIC_ORIGIN`: exact same-origin HTTPS and passkey RP boundary.
- Existing market feed configuration: fresh quotes are required for provisioning.

Before public launch, verify D1 schema privileges/restore and tenant controls,
mail delivery, WebAuthn on real supported devices, rate limits across deployed
instances, retention/deletion policies for personal information and approved
terms. Per-process global/IP limits are not a distributed abuse-control system;
email resend and verification-attempt limits are persisted per account. Capacity
and shared throttling need a separate measured deployment decision.

No Worker, queues, R2 objects, production settings, domains or hosted signer were
changed. Signet remains paused. Mainnet operations require separate explicit
authorization and readiness checks. Developer Live custody is not enabled
and cannot be inferred from an approved application.

## Acceptance tooling

`scripts/developer-ui-fixture.mts` requires `VAULT_UI_FIXTURE=1`, clears hosted
service configuration and binds loopback only. It supplies a disposable owner,
SQLite, in-memory mail sink and explicitly synthetic price. It does not bypass
WebAuthn. Its local control endpoint is not mounted in production. Unit tests
model enrollment for storage/payment tests; browser acceptance must exercise
the actual cryptographic WebAuthn verification with a virtual authenticator.

### Current acceptance limits

For the subsequent focused browser results and actual Cloudflare read-only
findings, see `docs/developer-release-commissioning.md`. Signup/recovery/rotation
and owner-prefixed admin now have completed local reports. HTTPS checkout,
two-developer browser isolation, intro skip and automatic expiry clearing remain
open. The homepage switch remains off. The older broad-run record below is
historical evidence, not the latest complete list of assertions.

On 2026-10-28, both TypeScript checks and the frontend build passed. Twelve
targeted tests cover owner access, additive schema and developer lifecycle/ledger
rules. A public 390px login screenshot rendered correctly. The broader local
browser run stalled without a report; it was stopped, not counted as a pass.
Its disposable database recorded verified email, one enrolled passkey, ready
provisioning, key issuance and one simulated transaction. No completed browser
assertion report establishes recovery, rotation, tenant isolation, responsive
signed-in acceptance or owner-prefix routing.

The `VITE_DEVELOPER_HOMEPAGE=true` build is a staging-only cutover switch.
The default stays false pending that acceptance. The owner root and existing
login remain intact; the separate developer entry is `/developers`.
