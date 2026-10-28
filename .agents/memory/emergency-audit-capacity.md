---
name: Emergency audit capacity
description: Developer-controlled history quotas must not block owner revocation.
---
Emergency owner suspension and credential revocation must not depend on capacity
that an authenticated developer can exhaust through ordinary activity.

**Why:** A shared bounded audit history lets a compromised developer disable
owner controls merely by filling the log. Preserve history in a separate durable
audit stream rather than throwing from the emergency account update.

**How to apply:** Test full-history cases when changing admin/audit behavior.
Distinguish requested and applied actions across crash boundaries. Ordinary
history limits and future archival must never reintroduce the same dependency.
