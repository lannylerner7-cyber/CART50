---
name: Temporary wallet destruction
description: User's privacy goal and desired retention boundary for temporary wallets.
---
The user explicitly selected five days for temporary-wallet self-destruction, including their transaction history in the application's database, rather than indefinite retention. They want the main vault balance and outgoing history retained, outgoing transfers tracked to three confirmations, and a separate spending vault.

They want over 100 temporary wallet addresses active simultaneously, with individual creation timestamps, total received, confirmed/unconfirmed balances, live pending-transaction timing and an in-app explorer using their own node rather than public tracking services.

On expiry, the user wants the wallet marked Expired in the vault history and wants to manually delete that history entry as well. They also requested a self-healing engine and complete table columns. They explicitly chose only their own node's live wallet activity in BTC/satoshis, not an external market-price feed.

**Why:** The user wants to limit exposure if their infrastructure or a payment service is compromised.

**How to apply:** Respect destruction as a product goal, while explaining that blockchain records cannot be deleted and expired addresses can still receive funds. The choice between a strict deadline and waiting for confirmed drainage is not yet resolved; do not interpret this preference as authorization to destroy actual keys or funds.
