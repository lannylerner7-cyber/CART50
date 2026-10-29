---
name: Public market pricing
description: Why Sandbox provisioning uses a direct public quote instead of requiring Cloudflare Access.
---
Keep basic Sandbox price lookup independent of Cloudflare Access.

**Why:** The owner authorized a direct public provider after Access authorization
repeatedly blocked onboarding. A protected Worker is optional, not a prerequisite
for developer registration.

**How to apply:** Use timestamped real quotes with bounded caching and fail closed
on stale prices. Never invent prices or timestamps to complete provisioning.
Price data is not payment proof and does not authorize real custody or Signet.
