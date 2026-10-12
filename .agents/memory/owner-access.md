---
name: Owner access requirement
description: User-stated authentication scope and conflicting source wording.
---
The user wants this single-user crypto project to use a manually saved long random secret for account access, without a username/password. Their current request says 164 bytes; the older supplied blueprint says 164 characters and incorrectly calls it an AES key.

**Why:** The user explicitly requested secret-based access. AES key sizes and access credentials must not be conflated.

**How to apply:** Preserve the no-username/password requirement. Treat 164 bytes as the current planning interpretation, distinguishing it from the older document; do not treat proposed passkey, custody or key-retirement recommendations as confirmed user decisions.

The user requested a cooldown after three invalid access keys, protection against
attempts from changing VPN addresses, and email alerts for incorrect keys/login
attempts. They also mentioned a temporary login; its meaning and the cooldown
duration require clarification.

**Why:** These are explicit owner requirements for the personal vault's access controls.

**How to apply:** Never include submitted credentials in alerts. Trusted proxy
configuration can identify the observed client IP, not reveal an original IP behind
a VPN. Do not promise VPN-proof attribution or create an authentication bypass.
