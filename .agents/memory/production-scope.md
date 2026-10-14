---
name: Production transition and later public API
description: Owner's release ordering for real BTC and the future public API.
---
Focus the current phase on mainnet receiving and sending. A public API with rate
limits comes later, after the owner confirms real-Bitcoin transfers work; the owner
will explain the API operating model then.

**Why:** The owner explicitly set this ordering and asked not to add unrelated
restrictions during the production transition.

**How to apply:** Do not build the public API now or reinterpret it as exposing
Core RPC/the private signer. Keep essential custody and transaction safeguards.
Mainnet authorization is not evidence of deployment or payment readiness.

The owner selected Trust Wallet for mainnet savings.

**Why:** Explicit wallet choice during mainnet setup.

**How to apply:** Keep its private keys/seed out of the server and chat. Verify
receiving compatibility before changing the fresh-address design. A fixed
destination would require explaining address reuse and obtaining approval;
Trust Wallet on a phone must not be described as offline cold custody.
