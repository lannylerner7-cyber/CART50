---
name: Phone-based Signet setup
description: User approved HTTPS generation for disposable test wallets, not production cold custody.
---
The user chose an HTTPS browser generator for the disposable Signet wallet setup.
Do not apply that choice to the owner login credential or production cold-wallet keys.

**Why:** The downloaded HTML generator did not respond on the user's phone.
They explicitly selected a phone-compatible HTTPS version after the distinction
between online test-wallet setup and offline cold storage was explained.

**How to apply:** Keep generation on-device with no network/storage writes by the
generator, state the website-delivery trust boundary, support mobile backup saving,
and require backup confirmation before showing deployment variables. Never
represent this as commissioned mainnet custody.
