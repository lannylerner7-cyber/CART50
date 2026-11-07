---
name: Verification mail privacy
description: Privacy and delivery semantics for registration email diagnostics.
---
Keep diagnostics within the existing verification record's lifetime, not a separate durable mail history. Do not copy provider responses, message contents, credentials, or verification codes into diagnostics.

**Why:** The requested admin troubleshooting feature must preserve existing privacy and retention boundaries; the product's retention policy is still under review.

**How to apply:** Future expansions to mail history need an explicit retention decision. SMTP acceptance is not evidence of inbox delivery; distinguish these outcomes in admin wording.
