# Request recovery

Read requests use bounded recovery, not indefinite HTTP requests or 2ms polling.
Two-millisecond polling would generate 500 requests per second per client and
make an overloaded Bitcoin host less responsive.

## Mainnet monitor

- The API waits up to 20 seconds for an engine observation; simultaneous reads
  share the existing in-flight request.
- The browser treats an `available: false` observation as a failed read, not
  replacement progress. It retries after 2, 4, and 8 seconds.
- The normal 15-second polling continues after retry exhaustion while the
  page is active. Returning to the page or regaining connectivity refreshes it.
- The last successful observation remains in the query cache during an outage.
  Its original timestamp is retained, and the UI labels it last known progress.
  Nothing is persisted to local storage; the existing session lock clears caches.
- Initial failures show connecting/reconnecting; sustained failures also show
  the actual diagnostic message. Missing configuration still requires repair.
- This does not make a disconnected Signet wallet available or enable transfers.

## Application request audit

Generated browser API reads share the fetch transport and React Query defaults.
GET/HEAD requests have a 45-second timeout and respect caller cancellation.
Transient network/timeouts and HTTP 408/429/5xx get up to three retries, with
2/4/8-second delays. Other HTTP errors are not retried. Reads without their own
polling interval retry transient terminal failures after 30 seconds; existing
dashboard, wallet, transaction, market, alert, session and notification polling
keeps its own interval. Focus and reconnection refresh active reads.

Mutation retries are explicitly disabled. Login, signing, sending, wallet
creation, deletion, and settings writes must not be replayed merely because a
response was lost. Existing caller reconciliation/error handling remains.
No retry was added to D1 SQL writes or engine mutations.

The server engine client already bounds requests (20 seconds, or 120 seconds
for wallet creation), market reads use 10 seconds, and D1 uses 10 seconds.
Bitcoin Core RPC can take up to 45 seconds and engine handlers share a mutex.
Therefore a monitor timeout alone does not prove the node is offline. These
changes improve automatic recovery; they do not prove or fix the live host's
underlying latency. Persistent outages require server-side investigation.

Deploy the updated website/API image in Coolify to use these changes.
Bitcoin Core does not need to be restarted.
