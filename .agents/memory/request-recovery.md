---
name: Request recovery boundaries
description: Why monitoring recovery must not imply automatic replay of wallet writes.
---
Prefer automatic recovery of read-only observations with bounded backoff and
clearly aged last-known data, rather than 2ms polling or unbounded waiting.
Never extend this to blindly retry wallet-changing operations.

**Why:** The user reported having to refresh repeatedly to see mainnet sync
progress and asked for continuous recovery across requests. A lost send response
does not mean the send failed; replaying writes can have financial consequences.

**How to apply:** Keep transient read failures recoverable without reloads,
preserve real freshness timestamps, expose sustained/configuration failures,
and require reconciliation before retrying ambiguous writes.
