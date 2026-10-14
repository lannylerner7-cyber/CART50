---
name: Owner access requirement
description: User-stated authentication scope and conflicting source wording.
---
The user wants this single-user crypto project to use a manually saved random secret for account access, without a username/password. On 2026-10-14 they explicitly changed the owner login key from 164 bytes to 64 random bytes and confirmed the existing key was exposed.

**Why:** The user explicitly requested secret-based access. AES key sizes and access credentials must not be conflated.

**How to apply:** Preserve the no-username/password requirement and 64-byte owner credential. Do not confuse this credential with the separate signer token, AES backup key or Bitcoin seed. Treat legacy access as compromised, not as a compatibility requirement.

The user requested a cooldown after three invalid access keys, protection against
attempts from changing VPN addresses, and email alerts for incorrect keys/login
attempts. They confirmed a one-hour cooldown; "temporary login" means retrying
after the countdown, not a bypass credential.

**Why:** These are explicit owner requirements for the personal vault's access controls.

**How to apply:** Never include submitted credentials in alerts. Trusted proxy
configuration can identify the observed client IP, not reveal an original IP behind
a VPN. Do not promise VPN-proof attribution or create an authentication bypass.

Use Cloudflare SMTP configured through Coolify runtime variables for security
alerts, not the Resend integration.

**Why:** The user explicitly chose their Cloudflare SMTP setup in Coolify.

**How to apply:** Keep the email token separate from D1 credentials and out of
source control; verify Email Sending enablement and sender onboarding before
claiming live delivery. SMTP retries are not exactly-once delivery.
