# Test-vault commissioning status — 2026-10-12

This is a partial commissioning record, **not approval to use real funds**.

## Verified

- Real Docker builds completed on linux/amd64 for the app and signer. The app
  image runs as `node`; its normal entrypoint rejects missing secrets/configuration.
  This is not a successful runtime D1 connection or a Coolify deployment.
- Started the rebuilt signer with an explicitly test-only token, no network,
  no published ports, all capabilities dropped and privilege escalation disabled.
  It ran as UID/GID 10001, reported node reconciliation blocked, and was then stopped
  and removed. This verifies the container's no-node startup, not a live signet node.
- Created dedicated resources through the existing Cloudflare connection:
  - D1 `personal-vault`: `f7f16095-2d5a-4cda-8889-94666a7bea06`.
    Applied `0001.sql`; the service reports all three tables.
  - R2 `personal-vault-encrypted-backups` (no public access was enabled).
  - Queue `personal-vault-replica`: `8f10e01c9eef401c93aa0c51fd2103a9`.
  - DLQ `personal-vault-replica-dlq`: `f525987fd11844bdbd5926cc3465b7e8`.
- Read back the resources. Neither queue has producers or consumers yet.
- Sender race tests cover bounded coalescing, restart replay, durable acknowledgement,
  write failures, whitelist, URL validation, redirects and rollback detection.
  Worker tests use local SQLite, not live D1.
- Replit preview services start cleanly and the locked owner-setup screen renders.
  No real owner verifier has been installed by this work.

## Live blockers

- Public `https://coin.scousgiftcardexchange.com/api/healthz` returned HTTP 503,
  body `no available server`. No credentials were sent.
- DNS-record reads return Cloudflare JSON 403 authentication errors. The existing
  connection uses an API key; the permission recovery flow reports that OAuth
  reconnect does not apply. Update DNS Read on the intended zone in that connection.
- Worker multipart uploads through the connector returned an HTML 403
  browser-challenge page (both serialized multipart and FormData attempts).
  Readback confirmed the vault Worker was not created. This is a different failure
  from the DNS JSON permission denial; do not assume token renewal fixes it.
- No operator-run Coolify deployment, owner-verifier installation, private signet
  Core/signer, or encrypted admin-access evidence is available.
- No live replication, cloud outage/replay, binding exercise or R2 access-policy
  verification has passed. Do not treat successful resource creation as those tests.

## Operator handoff

Use `docs/coolify-deployment.md` to deploy the app and signer on the owner's host.
Use Cloudflare's authenticated dashboard or an authorized local Wrangler session
to deploy `lib/vault-cloudflare/wrangler.jsonc`, install the independent
`REPLICA_TOKEN` as a Worker secret and signer runtime secret, and configure an
HTTPS Worker route. Keep `MARKET_ENABLED=false`. Do not paste secrets into chat.
Verify D1/R2/producer/consumer/DLQ bindings after deployment.

Set signer `REPLICA_URL=https://<verified-worker-host>/replicate`. Leave both
replication variables absent until ready; a partial or insecure configuration is
rejected. The app's owner verifier belongs only in Coolify's runtime secret manager.

Collect sanitized build/startup logs, the public health response, network/port
configuration, and the installed binding names. Then exercise an actual cloud
outage and signer restart with a test-network-only, paused signer: confirm bounded
local pending state, no cloud request under the signer mutex, and eventual D1
sequence advancement after recovery. Confirm wrong/missing tokens fail, old or
duplicate messages cannot lower the sequence, and no wallet data enters the queue.

## Replication semantics

The adjacent `engine.json.health` journal contains a persisted sequence and at
most two pending snapshots: the oldest unacknowledged and the newest coalesced
snapshot. Intermediate health samples may be discarded. This is not an audit log.
Only network, last successfully reconciled block count, fixed recovery status,
and last successful sync time leave the host. Empty sync time means never synced.
An old block count during an outage is not evidence the node is currently healthy.

HTTP is HTTPS-only, redirects are refused, requests time out after five seconds,
and retries back off from 15 seconds up to two minutes. A Queue 202 does not remove
local state: only the authenticated D1 sequence acknowledgement does.
The signer continues independently of cloud errors. Local filesystem calls still
depend on the host disk; monitor storage and replication warnings.

Retain the health journal on the persistent signer volume. Never run overlapping
signers or reset/restore this journal independently without reconciling D1's high
water mark. A cloud sequence ahead of local state blocks replication in that
process; stop it and reconcile offline before restarting. Do not lower D1's
sequence to make an old backup appear current.

## Market-data review

Sources reviewed:
- https://www.kraken.com/legal
- https://www.kraken.com/legal/global-terms
- https://docs.kraken.com/api/docs/guides/global-intro

Kraken's legal landing page distinguishes regional terms. The indexed API guide
states non-personal commercial use of public endpoint data needs permission from
`marketdata@kraken.com`; the live guide URL now redirects to an overview describing
unauthenticated market-data access, not a redistribution license. Public API
availability alone does not establish permission to republish data.

The current Worker `/price` route is public and includes cached history. Before
enabling it, confirm applicable regional terms and permission for that display,
retention and redistribution, or restrict the delivery path to authenticated
personal use and review that scope. No permission was established in this review,
so market sampling stays disabled.
