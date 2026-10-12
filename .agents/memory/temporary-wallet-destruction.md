---
name: Temporary wallet destruction
description: User's privacy goal and desired retention boundary for temporary wallets.
---
The user explicitly wants temporary wallets to self-destruct after 72 hours or a recommended interval, including their transaction history in the application's database, rather than retaining them indefinitely. They want the main vault balance and outgoing history retained, and outgoing transfers tracked to three confirmations.

**Why:** The user wants to limit exposure if their infrastructure or a payment service is compromised.

**How to apply:** Respect destruction as a product goal, while explaining that blockchain records cannot be deleted and expired addresses can still receive funds. The choice between a strict deadline and waiting for confirmed drainage is not yet resolved; do not interpret this preference as authorization to destroy actual keys or funds.
