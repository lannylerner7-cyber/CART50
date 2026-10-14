# Live session and commissioning checks

## Implemented locally, not released

- Logout is idempotent for missing, revoked and expired sessions and clears the
  secure cookie. Valid sessions still require the matching CSRF token; all logout
  requests still require the trusted origin.
- An authenticated client's 401 immediately locks the interface, cancels queries,
  drops protected cache and clears CSRF state instead of waiting for another poll.
- Explicit logout notifies other same-origin tabs with a non-secret storage event.
  Session polling, focus/reconnect checks and an expiry timer remain in place.
- Failed network/server logout requests do not claim that the server session was
  revoked. They present a retry message.

## Evidence

- Workspace typechecks passed.
- Isolated API regression checks passed for authenticated, missing, expired and
  revoked logout, cookie clearing, and origin/CSRF rejection.
- Client cache regression passed: delayed successful session/wallet responses
  cannot restore unlocked state after cancellation.
- The new Bitcoin Core container built successfully and passed an isolated,
  network-disabled startup check: non-root UID 10001, Signet chain, cookie
  authentication at the configured shared path, and graceful shutdown. It did
  not synchronize with peers or commission the user's host.
- Authenticated browser checks are pending until the commissioning scope is ready
  for its single final test pass. No owner credential was used in these tests.
- No new GitHub push or Coolify rollout has been performed.

## Infrastructure blockers

The public Coolify domain responds and advertises configured owner access on
Signet. This proves web/API availability, not node, signing or recovery readiness.
No signer URL/token, market Worker URL or Coolify management connection is
configured in the current workspace. The operator subsequently reported no
Bitcoin services deployed. A private-service compose configuration and setup
guide are now prepared in `docs/coolify-bitcoin-setup.md`; host deployment and
authorized access remain outstanding.

Required operator inventory:

1. Existing Bitcoin Core service, network and sync state; persistent storage and
   private RPC connectivity.
2. Existing signer service, private service hostname, persistent volume and Core
   cookie mount; separately configured matching app/signer token.
3. Pinned cold descriptor configuration and completed wallet reconciliation.
4. Approved market source and deployed Worker URL. The existing deployment
   instructions explicitly leave market ingestion disabled pending source
   permission; do not silently bypass that condition.

Enter credentials only in the appropriate secret manager, never in chat or this
document. Do not expose Core RPC or signer ports publicly. AWS remains the host
for Coolify, not a new application integration.

## Required before any real-money readiness claim

Demonstrate private authenticated node/signing connectivity, live test-network
receive/send confirmation tracking, restart and outage recovery, and restored
wallet reconciliation on the actual host. Local/regtest results cannot establish
those facts for Coolify.

Mainnet remains disabled. Five-day expiry and drainage checks do not authorize
destruction: actual key/history erasure remains blocked under the existing storage
decision. No real funds or production wallet data may be used for these checks.
