---
name: Health replication semantics
description: Privacy and delivery boundaries for signer operational metadata.
---
Health replication is a bounded snapshot stream, not an event audit log. Coalescing
intermediate samples is intentional; retain pending data until D1 acknowledges it,
not merely until Queues accepts it.

**Why:** Cloud outages must not stall signing or grow the host journal without
bound, and queue acceptance does not prove durable application after consumer errors.

**How to apply:** Keep the outbound whitelist free of wallet data and keep cloud
I/O outside the signer lock. Preserve sequencing across restarts; restoring an old
health journal requires reconciliation against the cloud high-water mark.

Cloudflare multipart Worker uploads through the existing connector returned HTML
403 browser challenges while JSON account resource operations succeeded.

**Why:** This differs from a JSON permission-denied response and should not trigger
repeated token rotation or be reported as a successful deployment.

**How to apply:** Verify upload responses and read back Worker existence; use an
operator-authorized deployment path when the proxy upload remains challenged.

Pin each replication Worker to one explicit network and keep credentials and
queues distinct; health sequence keys and backup object prefixes must include
that network.

**Why:** A shared legacy engine-health ID would allow one network's higher
sequence to suppress the other network's updates and acknowledge the wrong
stream. Unscoped backup filenames can also collide.

**How to apply:** Verify the network before deploying a Worker upgrade. Retain
legacy data and only associate old encrypted backups with a network after an
operator verifies their origin; never guess or delete them automatically.

Cloudflare connector proxy paths start with `/v4`; its base already includes
`/client`.

**Why:** Earlier `/accounts` and `/client/v4/accounts` calls returned route 404s
and prevented a real deployment audit. The documented `/v4/accounts` route
worked without changing credentials.

**How to apply:** Follow the connector skill's current base-path notes before
diagnosing missing permissions, reconnecting, or inferring absent resources.
