---
name: Shared limiter choice
description: Owner's infrastructure choice for shared developer abuse controls.
---

Use the existing D1 database for shared developer abuse controls rather than introducing a separate service.

**Why:** the owner explicitly selected “Existing D1 database.” Selection is not authorization for hosted migration or deployment.

**How to apply:** keep local concurrency evidence separate from hosted commissioning, and obtain explicit rollout authorization before modifying hosted infrastructure.
