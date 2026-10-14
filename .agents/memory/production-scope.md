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
