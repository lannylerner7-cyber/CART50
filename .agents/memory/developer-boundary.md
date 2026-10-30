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

The owner subsequently explicitly authorized the developer homepage at root,
while unresolved acceptance items remain documented rather than treated as passed. The personal
vault moves to the exact owner-supplied concatenated-1-through-256 URL prefix
ending in `/mainvaultwallet`, without moving Core/signer storage or changing domains.

**Why:** The owner explicitly requested the path-only switch so they can visit the personal vault manually; this is not a new vault or permission to open Live custody.

**How to apply:** Preserve owner login and nested navigation. A long path is not
an authentication boundary. Keep the supplied video intro separate from the
15-second provisioning presentation; neither timer establishes server readiness.

The checkout starter test will be hosted separately on a new domain, not on
the existing MainVault host/subdomains proposed earlier.

**Why:** The owner corrected the hosting plan explicitly.

**How to apply:** Keep MainVault as the API provider. Do not provision starter
subdomains or containers on the existing vault host based on the superseded plan.
The new domain has not yet been supplied.

The owner wants approved Live developers to create batches of temporary receiving
wallets, with a unique receiving wallet per payment, and configure developer fees
in their Live dashboard. They described batch receiving creation as "unlimited."

**Why:** External developer applications should create receiving destinations on
their customers' behalf and request withdrawals through the API.

**How to apply:** Treat these as intended product scope, not implemented or
commissioned capabilities. Explain capacity/rate controls separately from product
wallet-count limits. Preserve the temporary-wallet drainage/destruction boundary.

Personal owner custody must never be accessible, debited, swept or used as a
funding fallback through developer APIs. The owner describes developer accounts
as child vaults and the personal account as the "brains": administrative
oversight must not imply shared signing authority or pooled personal funds.
They want a separate Live developer-management/admin surface and stronger
storage separation rather than relying on one D1 database for everything.

**Why:** The owner explicitly prioritizes protecting personal and customer funds.

**How to apply:** Diagnose process, credentials, signer, storage and network
isolation before Live commissioning. This direction is not authorization to
migrate databases, move keys or deploy. The proposed platform revenue model is
an $8–$10 application fee plus monthly API-usage billing; exact price, refund
terms, billing units and payment provider remain undecided.
