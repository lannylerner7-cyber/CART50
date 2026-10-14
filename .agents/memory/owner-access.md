---
name: Owner access requirement
description: User-stated authentication scope and conflicting source wording.
---
The user wants this single-user crypto project to use a manually saved random secret for account access, without a username/password. On 2026-10-14 they explicitly changed the owner login key from 164 bytes to 64 random bytes and confirmed the existing key was exposed.

**Why:** The user explicitly requested secret-based access. AES key sizes and access credentials must not be conflated.

**How to apply:** Preserve the no-username/password requirement and 64-byte owner credential. Do not confuse this credential with the separate signer token, AES backup key or Bitcoin seed. Treat legacy access as compromised, not as a compatibility requirement.
