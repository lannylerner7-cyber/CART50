---
name: Temporary wallet destruction
description: User's privacy goal and desired retention boundary for temporary wallets.
---
The user explicitly selected five days for temporary-wallet self-destruction, including their transaction history in the application's database, rather than indefinite retention. They want the main vault balance and outgoing history retained, outgoing transfers tracked to three confirmations, and a separate spending vault.

They want over 100 temporary wallet addresses active simultaneously, with individual creation timestamps, total received, confirmed/unconfirmed balances, live pending-transaction timing and an in-app explorer using their own node rather than public tracking services.

On expiry, the user wants the wallet marked Expired in the vault history and wants to manually delete that history entry as well. They also requested a self-healing engine and complete table columns.

The user subsequently selected “Track real prices and market drops,” superseding their earlier no-price-feed choice. Permit external read-only market prices and market-drop alerts, while retaining their own node for wallet activity and confirmations; this does not authorize trading.

**Why:** The user wants to limit exposure if their infrastructure or a payment service is compromised.

The user selected “Wait for verified drainage”: expire at 120 hours, but retain keys until the node is healthy, balances are zero and sweeps have settled. This is not authorization for destructive production operations.

When asked about adding a separate key-management service versus keeping existing storage with destruction blocked, the user ultimately said “No keep the existing one,” superseding their initial approval of a new service. Keep existing storage and the existing sign-in credential; do not add a key-management service without renewed approval.

**How to apply:** Respect destruction as a product goal, while explaining that blockchain records cannot be deleted and expired addresses can still receive funds. Under the retained-storage decision, actual key destruction stays disabled; do not substitute file deletion for verified erasure. The drainage policy does not authorize a strict fund-losing deadline.
