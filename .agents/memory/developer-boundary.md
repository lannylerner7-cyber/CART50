---
name: Developer access boundary
description: Separate multi-user developer onboarding and staged homepage relocation without owner-custody changes.
---
Developer accounts are separate from the personal owner: signup with name/email,
verify a one-use 24-character email key, require passkey enrollment, then issue
an 86-character login credential. Passkey authentication can replace a lost
credential; it must not recover its plaintext.

**Why:** The owner explicitly requested this developer onboarding sequence while
keeping the personal vault unchanged.

**How to apply:** Never open the shared owner ledger to developers or authorize
owner APIs with developer sessions. Reuse Sandbox presentation with isolated
data. Live approval is distinct from hosted custody readiness; Signet stays paused.

The developer homepage replaces the root only after acceptance. The personal
vault moves to the exact owner-supplied concatenated-1-through-256 URL prefix
ending in `/mainvaultwallet`, without moving Core/signer storage or changing domains.

**Why:** The owner requested a staged path-only switch, not a new vault.

**How to apply:** Preserve owner login and nested navigation. A long path is not
an authentication boundary. Keep the supplied video intro separate from the
15-second provisioning presentation; neither timer establishes server readiness.
