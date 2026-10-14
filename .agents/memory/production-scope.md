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

The owner approved a fixed Trust Wallet native-Bitcoin savings address after
being told that address reuse makes transfers easier to link.

**Why:** Explicit approval of the fixed-address option during mainnet setup.

**How to apply:** Keep its private keys/seed out of the server and chat. Implement
the fixed savings destination without replacing separate temporary receiving
addresses. Trust Wallet on a phone must not be described as offline cold custody.
Approval of this design does not prove address ownership or authorize an arbitrary
payment; confirm the actual receiving destination before enabling transfers.
