---
name: Hosted checkout settlement
description: Who pays a Sandbox hosted checkout, how the cross-account settlement is kept safe, and why the manual fallback stays.
---
A hosted checkout is paid from a **developer Sandbox account** (any developer,
including the merchant itself), never from the owner's personal Sandbox store.

**Why:** the user asked for "pay from MainVault Sandbox wallet, API recognises
it, debit payer / credit merchant, auto-mark paid, receipt, return URL" while
owner custody and developer tenants must stay isolated. The owner's Sandbox
lives in a different store, so routing it into developer sessions would couple
the two principals. Flagged to the user as an assumption.

**How to apply:** payer and merchant are separate versioned rows, so the
settlement is a durable three-phase record on the payer row (debited → settled
or released) with idempotent completion keyed by settlement id on the merchant
side; interrupted ones are resumed by the next request and the dispatcher sweep.
A refused credit must release the debit and answer 409 with the reason.

Keep the console's manual "Mark paid manually" action: automated API tests and
merchants without a payer wallet rely on it. Expose which path settled a session
(`paid_via`) rather than hiding the manual path.

Nothing reachable from the public page may set a session paid; webhook
anti-spoofing is the receiver's job (HMAC with shared secret, timestamp window,
event-id dedupe, order binding, authenticated GET confirmation) and the docs
now say so explicitly — keep that section when editing the guide.
