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

The owner reconfirmed personal-vault-first scope when discussing 10,000 concurrent
requests, horizontal scaling and uploads.

**Why:** They selected the personal-vault option rather than multi-user expansion.

**How to apply:** Do not add customer accounts, profile/gift-card uploads, sharding
or public API work to the current custody milestone. Do not claim traffic capacity
without measurement or use additional signers as general-purpose replicas.

Treat overload handling and completed-work throughput as separate claims.

**Why:** The owner requested 10,000-request capacity, but shedding a burst is not
equivalent to completing 10,000 payments or sustaining that rate on the live host.

**How to apply:** Report accepted/rejected counts, concurrency and test scope.
Require separate network-pinned wallet storage during the mainnet transition.

The owner clarified that the vault must itself hold spendable keys, receive/send
through its own Core infrastructure, support multiple wallets/transfers and track
failed/incomplete transactions for recovery. An external savings wallet must not
be a prerequisite. This supersedes the earlier fixed Trust Wallet destination choice.

**Why:** The owner corrected the external-wallet assumption: they are building
their own self-held, spendable and receivable infrastructure.

**How to apply:** Plan server-held main/reserve and spending custody, label it hot
custody rather than cold storage, and keep private RPC/signing boundaries. Recovery
must reconcile durable transaction identity before retrying; concurrent activity
must not double-spend the same UTXOs. Do not promise to reverse confirmed payments
or recover erased keys. Do not request an external address to unblock this design.
