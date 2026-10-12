# GitHub and Coolify readiness — 2026-10-12

## Decision

**Not approved for real funds or live commissioning.** Code can be prepared for
a private repository; no GitHub push was performed during this verification.
The owner selected `https://github.com/lannylerner7-cyber/CART50.git` and confirmed
retaining Cloudflare storage. Configuration consolidation is not a database migration.
Repository access and private visibility have not yet been verified: the GitHub
connection reports active, but CLI authentication is unavailable and remote
inspection timed out. No existing remote content has been overwritten.

## Verification actually performed

- Workspace TypeScript and Worker typechecks passed.
- 20 Node tests passed across the full verification script and the added template
  test: API access (27 protected route/method combinations), credential encoding, market alert windows,
  configuration rejection, static routing, replication, backup integrity and
  isolated production bundle execution.
- Go race tests and `go vet ./...` passed using workspace Go 1.26.5.
- Both Linux amd64 Docker builds passed after dependency changes. Signer image
  now builds with Go 1.26.9 rather than the old Go 1.24 image.
- Both images refuse startup without mandatory runtime configuration. This
  proves fail-closed configuration checks, **not successful live D1/Core access**.
- API and frontend workflows restarted cleanly. Public setup screen renders
  locked and awaiting the owner verifier. No real owner key was generated,
  inspected, installed or tested.
- Static and privacy scanners returned no findings.
- Dependency scan initially reported 1 critical, 4 high and 45 moderate findings.
  Compatible overrides for proxy-addr, brace-expansion, source-map-js and fast-uri
  reduce the report to 0 critical, 1 high and 43 moderate.
- Heuristic scan of 333 reachable Git-history blobs found no private-key header,
  supported provider-token or 219-character vault-credential pattern. It is not a
  comprehensive secret/PII clearance. Existing tracked uploaded documents and
  project memory remain in history and require publication review.

Repeat local checks with `bash scripts/vault-verify.sh`. This does not exercise
the deployed vault and cannot certify security "once and for all."

## Remaining security findings

1. **High:** braces 3.0.3, via the mockup sandbox's development fast-glob/micromatch
   dependency. Registry latest remains 3.0.3 with no reported patched version.
   Not in the production app Docker allowlist. Never give this tooling untrusted
   glob patterns; replace/update the preview dependency before calling the
   entire repository vulnerability-free.
2. **Moderate:** postcss-selector-parser 6.0.10 through build-time
   @tailwindcss/typography. Scanner recommends 7.1.6, a major transitive upgrade.
   Evaluate the parent upgrade and CSS output rather than silently forcing an
   untested major version. Not an app request-path parser.
3. **Go scan interpretation:** the scanner reports stdlib 1.24.99 based on module
   metadata, while the workspace runs 1.26.5 and the rebuilt container uses
   1.26.9. Do not call the remaining 42 Go advisories resolved based on this
   mismatch. Perform binary-aware vulnerability analysis and image/OS scanning
   before operational approval. Node/Debian images also remain mutable tags.

## File and service boundaries

| Area | Purpose | Deployment treatment |
|---|---|---|
| `artifacts/bitcoin-vault` | React UI, offline generator, UI routes | Built into app image |
| `artifacts/api-server` | Authentication, API, D1 metadata, signer bridge | App image, port 3000 |
| `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` | API contract, validators, generated client | Source/build dependencies |
| `lib/db` | Shared DB package scaffold | Not evidence of production PostgreSQL; vault metadata uses D1 |
| `services/vault-engine` | Core RPC, wallet lifecycle, payments, replication | Separate private signer |
| `lib/vault-cloudflare` | Worker, schema, queues, R2 bindings | Separate Cloudflare deployment |
| `deploy`, `Dockerfile` | Startup guards, image builds and host service | Operator deployment package |
| `scripts/vault-backup*` | Encrypted recovery document utility and tests | Operator-only; not automatic live backup |
| `artifacts/mockup-sandbox` | Design preview | Not deployed by app Dockerfile |
| `attached_assets`, `.agents` | Uploaded plans and project notes | Not runtime; review before Git publication |
| `.vault-data`, Core/signer state, keys | Private operational data | Never Git or Docker build context |
| `generated-artifacts`, build outputs, dependencies | Generated local files | Excluded from Git |

Repository-wide typechecks/scans are not a line-by-line independent cryptographic
audit. No claim is made that every possible execution path was exercised.

## Route inventory and access boundaries

Frontend routes, all behind the session gate: `/`, `/wallets`, `/wallets/:id`,
`/transactions`, `/spending`, `/explorer`, `/market`, `/settings`; unknown routes
show the not-found screen. `/offline-keygen.html` is a public static download;
generation is blocked on hosted copies and allowed only from `file:`.

API routes below have prefix `/api/vault`:

| Methods and paths | Protection / intent |
|---|---|
| GET `/session` | Public session status; no owner credential returned |
| POST `/login` | Exact origin, rate limit, canonical credential verification |
| POST `/passkey-login/options`, `/passkey-login/verify` | Origin, rate limit, expiring one-use challenge and WebAuthn verification |
| GET `/passkeys` | Owner session |
| POST `/passkeys/options`, `/passkeys/verify`; DELETE `/passkeys/:id` | Owner session, origin, CSRF; registration challenge |
| POST `/logout`, `/security/revoke`, `/security/rotate` | Owner session, origin, CSRF; rotation also current-key check/rate limit |
| GET `/dashboard`, `/wallets`, `/wallets/:id`, `/transactions` | Owner session; signer-backed wallet data |
| POST `/wallets`; PATCH/DELETE `/wallets/:id` | Owner session, origin, CSRF; authoritative signer policy |
| GET/PUT `/settings`; POST `/node/reconnect` | Owner; mutations require origin/CSRF |
| GET `/market`, `/alerts`, `/notifications` | Owner session |
| POST `/alerts`; PUT/DELETE `/alerts/:id`; POST `/notifications/:id/read` | Owner session, origin, CSRF |
| GET `/explorer` | Owner session; own-node query |
| POST `/payments/review`, `/payments/send` | Owner session, origin, CSRF; send requires explicit approval and signer checks |

`GET /api/healthz` is public liveness only. Unknown `/api/*` paths return JSON
404 instead of SPA HTML. Protected API access, origin/CSRF rejection and revoked
sessions have local tests; every listed route has not been exercised against live
Core/D1. Hardware passkeys and real browser session expiry remain unverified.

Private signer exposes `/status`, `/wallets`, `/wallets/create`,
`/wallets/:id` and rename/delete operations, `/transactions`, `/settings`,
`/payments/review`, `/payments/send`, `/explorer`, behind its bearer token.
It must have no public domain or published port. Core RPC is also private.

Worker `/replicate` POST and `/replica` GET require the independent replication
token. `/price` remains disabled by `MARKET_ENABLED=false`. Worker upload,
bindings and live outage/replay are still outstanding.

## Key and data handling

The owner access credential contains **164 random bytes**, encoded as exactly
219 canonical base64url characters. It is not a Bitcoin seed or AES key.
Tests verify matching SHA-256, altered-key mismatch, wrong sizes, malformed
encoding, padding and noncanonical input. Access tests verify valid login,
wrong-key rejection, secure cookie flags, origin/CSRF checks and revocation.
These tests use disposable random test credentials, not the owner's real key.

Use `deploy/coolify.env.example` for the app and
`deploy/coolify-signer.env.example` for the separate private signer. Enter real values
only into the correct service's runtime secret manager. Do not share all secrets
with all containers. Coolify stores the verifier, not the owner login key; Core
cookie files and signer data require private persistent mounts. Backup encryption
keys stay separate from encrypted backups. Worker secrets still belong in
Cloudflare unless a separately approved architecture change removes the Worker.

## Outstanding commissioning gates

### Deployment-variable and packaging recheck

- App port is **3000**; HTTP health probe is **GET /api/healthz**, expected **200**.
  Do not use Replit's 8080, the Coolify admin port, or the signer's private 9090.
- App template includes the confirmed non-secret D1 IDs and SMTP addresses.
  Required blank runtime fields: owner verifier, D1 API token, SMTP password.
  Tests prove the example passes configuration validation once those three are
  filled with valid-format fixtures. This is not proof that real tokens work.
- Production now fails startup on missing/malformed SMTP configuration and invalid
  trusted-proxy entries, rather than discovering them only when an alert fires.
- Docker isolation checks exposed an absolute build-directory path in development
  logging workers. Build output now uses relocatable worker paths from the runtime
  working directory. Production uses JSON logging without that development worker.
- Run `bash scripts/vault-verify.sh` for workspace checks; after building both
  amd64 images, run `node scripts/vault-docker-verify.mjs` for offline container
  checks. It publishes no ports and uses only disposable test credentials.
- Live HTTPS was rechecked and still returns **503 / no available server**.
  The owner confirmed only settings have been saved in Coolify; the app is not
  yet deployed. No live SMTP test or GitHub push is claimed.

- Verify access and private visibility of the selected repository and publish only reviewed content.
  GitHub integration is present, but `gh repo list` currently reports missing CLI
  authentication; push capability has not been proven.
- Retain Cloudflare D1 as confirmed by the owner. No storage migration is needed.
- Follow `docs/vault-commissioning-status.md` for the previously observed public
  503, DNS permission failure and Worker upload challenge; this pass does not
  claim these external problems were fixed.
- Install real runtime settings through the operator, verify HTTPS and separate
  encrypted administration, sync signet Core and verify private-network isolation.
- Prove live outage/restart/replay, recovery restoration and anti-rollback.
- Mainnet, market feed and destructive wallet erasure remain disabled/blocked.
