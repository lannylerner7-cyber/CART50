---
name: Live and Sandbox boundary
description: Owner's testing scope, navigation and real-money separation.
---
The owner wants Live and Sandbox kept separate, with Return to Live in Sandbox
and manual logout only in Live. Automatic security locking must still apply in
both environments.

**Why:** The owner explicitly requested this navigation and security boundary.

**How to apply:** Sandbox balances, receipts and destinations must never be
presented as real BTC or mixed into Live balances. The requested $3,000 is test
credit, not a claim that Signet coins have a dollar value.

The owner wants testing restricted to the assigned sandbox wallet/destination,
not arbitrary recipients. Actual Signet was stopped in Coolify while mainnet
was syncing; a visual redesign does not authorize restarting it or altering
mainnet storage.

**Why:** The owner is concerned about losing the long-running mainnet sync and
specified a single assigned test destination.

**How to apply:** Keep simulation distinctly labelled until real Signet is
separately commissioned. Do not claim a simulated receipt verifies on-chain
double-spend protection, deposits or withdrawals.
