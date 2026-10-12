# Coolify deployment — test networks only

This is an **operator-run deployment package**, not evidence of a commissioned
vault. No Coolify login is needed by the agent. The root Dockerfile packages the
dashboard and API together. The optional signer image is separate; neither image
installs Bitcoin Core or provisions Cloudflare.

## 1. Exact app settings

Connect the repository and the branch containing this package to a new Coolify
application on the existing host. Select **Dockerfile** as the build pack.

| Setting | Value |
| --- | --- |
| Build context / base directory | Repository root (`/` in Coolify) |
| Dockerfile location | `/Dockerfile` |
| Docker build target | Leave empty (final `runtime` stage) |
| Host architecture | Linux **x86-64 / amd64**, not ARM |
| Domain | `https://coin.scousgiftcardexchange.com` |
| Container port / Ports Exposes | `3000` |
| Host port mapping / Ports Mappings | **Leave empty**; use Coolify's proxy |
| Health check | HTTP `GET /api/healthz`, port `3000` |
| Build / install / start overrides | Leave empty; Dockerfile owns these |
| Replicas | `1` |
| App persistent storage | None; production metadata is in D1 |

Do **not** use port `8000`: that is Coolify administration, not this application.
Do not select Nixpacks or a static-site-only deployment. API and UI share port
3000 so `/api/*` cannot accidentally reach Vite or a separate origin.
The image runs as the unprivileged `node` user. If configuring extra runtime
options, use `--cap-drop=ALL --security-opt=no-new-privileges`; do not add
privileged mode or mount the Docker socket.

The lockfile currently excludes ARM and musl native build packages, so this
Dockerfile deliberately rejects a non-amd64 builder. Debian/glibc is intentional.
Node 24 and Go 1.26.9 image tags are mutable, not digest-pinned. Review current
security updates and record/pin tested image digests before operational approval.
pnpm is pinned to 10.26.1 and dependency installation uses the frozen lockfile.

## 2. Cloudflare prerequisites (not automatically created)

For resources already provisioned and remaining blockers, first consult
`docs/vault-commissioning-status.md`. Reuse the dedicated resources recorded there;
do not create duplicates. Their existence does not mean the Worker is deployed.

Use dedicated vault resources, not databases or buckets belonging to other apps:

1. Create D1 `personal-vault`; apply
   `lib/vault-cloudflare/migrations/0001.sql` to that database.
2. Create private R2 `personal-vault-encrypted-backups`.
3. Create Queues `personal-vault-replica` and `personal-vault-replica-dlq`.
4. Replace the placeholder database ID in
   `lib/vault-cloudflare/wrangler.jsonc` with the real D1 ID; verify all bindings.
5. Deploy the Worker separately with an independently generated `REPLICA_TOKEN`
   (at least 32 characters). `MARKET_ENABLED=false` must remain in place until
   applicable market-data terms are reviewed and permission is confirmed.

Do not supply Worker upload/replication credentials to the frontend. A Replit
Cloudflare connection is **not** automatically available inside Coolify.
The Coolify API needs its own runtime Cloudflare token, restricted to D1 access
on the selected account. DNS, Worker provisioning and tunnel permissions belong
to separate operator credentials, not this runtime token.

## 3. Runtime variables

Enter these in Coolify's environment/secrets manager as **runtime-only** values.
Use `deploy/coolify.env.example` as the consolidated variable inventory, not as a
place to save real secrets in Git. Variables configure services; they do not move
D1 records, Core wallets or signer state into Coolify's environment manager.
Do not expose secrets to builds or use Docker build arguments for credentials.
Never paste a login key, seed, RPC cookie or backup key in chat or commit it.

| Variable | Value / purpose |
| --- | --- |
| `NODE_ENV` | `production` (image default; do not change) |
| `PORT` | `3000` (image default) |
| `BITCOIN_NETWORK` | `signet` (default); `regtest` only for isolated local tests |
| `PUBLIC_ORIGIN` | `https://coin.scousgiftcardexchange.com` — no trailing slash |
| `VAULT_OWNER_VERIFIER` | 64-character lowercase SHA-256 verifier from the offline generator; **not the 219-character login credential** |
| `CF_ACCOUNT_ID` | Actual Cloudflare account ID |
| `CF_D1_DATABASE_ID` | Actual dedicated D1 database UUID |
| `CF_API_TOKEN` | Least-privilege runtime D1 API token |
| `VAULT_STATIC_DIR` | `/app/public` (image default) |
| `VAULT_ENGINE_URL` | Leave absent initially, or set to the verified private signer endpoint |
| `VAULT_ENGINE_TOKEN` | Set with the engine URL; independent random value, at least 32 characters |
| `MARKET_WORKER_URL` | Leave absent until the Worker and market permission are verified; then HTTPS `/price` URL |

Get the offline generator from the repository at
`artifacts/bitcoin-vault/public/offline-keygen.html`. Save it, disconnect from the
network, generate the owner credential and retain the keyfile offline. Install
only its verifier. Do not create a new key on every container restart.

### Login cooldown and security email

See `docs/login-security.md`. Three invalid keys restrict the observed client IP
for one hour; counters persist in D1. Set `TRUSTED_PROXY_IPS` only after verifying
the actual reverse-proxy chain and isolating the app container from direct access.
An empty setting trusts no forwarded headers and may group users under a proxy IP.
Do not add Apache or trust arbitrary headers to try to discover a VPN user's
original IP.

Set `SECURITY_ALERT_TO`, `SECURITY_ALERT_FROM` on an onboarded Cloudflare sending
domain, and runtime-only `SMTP_PASSWORD` (Email Sending: Edit token) through
Coolify. Use `SMTP_HOST=smtp.mx.cloudflare.net`, `SMTP_PORT=465` and
`SMTP_USER=api_token`; TLS is mandatory. Email delivery is not commissioned
until a controlled invalid-key alert reaches the owner's inbox. Neither the
Replit recipient variable nor a Replit provider connection is automatically
copied to Coolify.

The container refuses startup on missing/invalid required settings, mainnet,
an absent built dashboard, or a failed D1 schema/access check. It never silently
uses SQLite in production. The signer URL/token may both be absent for initial
UI setup: the dashboard will report a disconnected node and cannot make payments.
A passing container health check proves HTTP liveness, **not** node sync, current
D1 health, safe signing, recovery readiness or market availability.

## 4. DNS and HTTPS

The intended hostname is `coin.scousgiftcardexchange.com` (not
`scousgiftcardexachange.com`). Point its A record to the chosen Coolify host and
set the same HTTPS domain in Coolify. DNS alone does not deploy or route the app.

Allow ports 80/443 to the Coolify reverse proxy for routing and certificate
issuance as required by its certificate setup. If using Cloudflare proxying,
use **Full (strict)** with a valid origin certificate; do not use Flexible.
Never disable certificate verification to get a green test. Confirm both
origin routing and public HTTPS before uploading the owner keyfile.

Keep Coolify administration separate. The existing IP/port can be retained;
use an SSH tunnel or HTTPS for authenticated administration, and restrict public
access to port 8000. From a computer already authorized to SSH to the host:

```sh
ssh -N -L 18000:127.0.0.1:8000 <ssh-user>@<host-ip>
```

Then open `http://127.0.0.1:18000` on that same computer. HTTP is inside encrypted
SSH, not crossing the public network unencrypted. Verify the SSH host fingerprint
against a trusted source. Do not close existing admin access until the alternative
has been tested. This tunnel does not provide the app-to-signer connection.

## 5. Private Core and signer — separate prerequisite

Use the existing `deploy/vault-engine.service` for a host-based signer beside
Core, **or** build the optional container with:

```sh
docker build -f deploy/vault-engine.Dockerfile -t personal-vault-engine:test .
```

For the signer container:

- Create a private Docker network shared only by the app, `vault-engine`, and
  a separately provisioned Core service. Use `vault-engine` as the signer network
  alias and `http://vault-engine:9090` as the app's engine URL.
- Set **no domain, no proxy route and no host port mapping** for Core RPC or
  the signer. Do not add them to a shared public-proxy network.
- Mount a dedicated persistent directory at `/var/lib/personal-vault`, writable
  by UID/GID `10001:10001`. Never run two signers against the same state.
- Mount the **RPC cookie's parent directory read-only**, not a single cookie
  file, so Core's atomic cookie replacement remains visible. Ensure UID 10001
  can traverse the directory and read the cookie; do not make it world-readable.
- `BTC_RPC_URL` must name Core on that private network, not `127.0.0.1` in
  another container. Restrict Core RPC bind/allow rules to that private network.
  Core on the host's loopback cannot be reached this way without a separately
  configured private connection; do not solve that by opening RPC publicly.
- Set `BTC_RPC_COOKIE_FILE` to the cookie path inside the container.
- Set `BITCOIN_NETWORK=signet`, the same `VAULT_ENGINE_TOKEN` as the app, and
  `COLD_DESCRIPTOR` / `COLD_DESCRIPTOR_SHA256` only after verifying the public
  descriptor's fingerprint offline. Never install a cold seed in either image.
- After the Worker is verified, set `REPLICA_URL` to its HTTPS `/replicate`
  endpoint and set independent `REPLICA_TOKEN` in the signer runtime secret
  manager. Preserve the adjacent health journal on the persistent volume.
  See the commissioning record for bounded replay and rollback rules.
- Retain the image defaults `ENGINE_LISTEN=0.0.0.0:9090` (container-only) and
  `ENGINE_DATA_DIR=/var/lib/personal-vault`.
- Configure restart-on-failure with a bounded retry count (for example 5).
  Drop capabilities, disable privilege escalation and core dumps. Do not scale
  the signer or deploy overlapping old/new signer instances.

A host-based signer should instead remain on loopback and use a verified
authenticated private tunnel to the API. This package does **not** create that
tunnel or claim it has been tested. Do not use the public host IP with port 9090.
Do not enable automatic snapshots of hot-wallet/state volumes while claiming
five-day destruction.

## 6. Deployment and acceptance

Build on the Coolify server (not the Replit workspace):

```sh
docker build --platform linux/amd64 -t personal-vault:test .
```

After deploying through Coolify, check:

1. `/api/healthz` returns JSON `{"status":"ok"}`.
2. `/` and a direct dashboard route load; `/offline-keygen.html` is available.
3. `/api/not-a-route` is JSON 404, not dashboard HTML.
4. Unlock through the HTTPS app using the saved owner keyfile. Check expiry,
   revocation, optional passkeys, tables, alerts and test-network payments.
5. Connect and sync the private node, then verify restart and outage behavior.

Do not unpause sweeps until fee/exposure limits and the cold descriptor have been
independently checked. Keep mainnet disabled. This package is not production
custody approval.

## Verification boundary

Local checks can run without Docker:

```sh
node --test deploy/app-config.test.mjs
pnpm --filter @workspace/api-server exec tsx --test src/static.test.ts
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build
NODE_ENV=production PORT=3000 BASE_PATH=/ pnpm --filter @workspace/bitcoin-vault run build
node --test scripts/vault-package.test.mjs
cd services/vault-engine && go test ./...
```

The isolated bundle test copies only the built API/dashboard into a temporary
directory without workspace dependencies. It deliberately tests the bundle
directly, not the entrypoint's real D1 connectivity gate. There is no fake D1
success reported as real infrastructure verification.

Still unverified: the Docker image build/run on Coolify, external signet,
live D1/R2/Queue/Worker bindings, private tunnel policies, host-health replication,
cloud outages/replay, authenticated browser/hardware passkeys, actual encrypted
backup restoration and cold-index anti-rollback. See `docs/vault-operations.md`.
