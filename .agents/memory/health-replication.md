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
