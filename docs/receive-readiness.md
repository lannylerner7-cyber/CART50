# Receive and interface verification

## Boundary

This app is not approved for real Bitcoin deposits. The engine explicitly
supports signet/regtest only. A hosted app and a configured owner verifier do not
establish custody readiness. Never deposit mainnet BTC to test-network addresses.

## Receive behavior

Receive requires owner authentication and CSRF protection, matching API/node
networks, an active wallet, a synced node and recent reconciliation. Every open
verifies the address with Core before revealing it. Cold receiving reserves a
descriptor index durably, extends the watch-only range, and persists the address.
Repeated requests reuse that address. Temporary and spending addresses are
verified as tracked by their Core wallet. Expired addresses are not offered.

The client generates QR locally using bitcoin:ADDRESS. There is no external QR
provider or embedded fabricated amount. Copy and Share use the same full address.
Disconnected, stale or expired states suppress receiving. On-chain addresses do
not stop receiving when a local wallet expires.

Signer policy is read from the signer, not the metadata mirror. Unknown policy
is an error rather than a claim that sweeps are paused.

## Checks performed on 2026-10-14

- Typechecks, access/CSRF/revocation and credential-format checks passed.
- Signer-authoritative settings/outage test passed.
- Core 29.0 regtest passed: 101 temporary wallets, main cold/spending receiving,
  stable cold receiving index, payments, RBF, sweeps, confirmations, reorgs and
  drainage blockers. Unsafe receiving state unit checks passed.
- Production web build and standalone Node runtime-package test passed.
- Deployment configuration and encrypted backup roundtrip/tamper tests passed.
- Real locked login rendered at phone width; short credentials rejected locally.
- Browser-only fixtures exercised desktop/phone portfolio, all three receiving
  wallet types, copy/share fallback, failed verification, disconnection and expiry.
  These were NOT real authenticated owner or live-node browser checks.
- Browser review found an unnamed QR and a timestamp-only expiry count mismatch;
  both were corrected. QR payload was verified in code, not independently decoded.

## Still required before funds

Configure the private signer endpoint and separate service token in the actual
Coolify deployment. Verify the owner's new key against that deployment without
sharing it, and complete a signet receive/send cycle, passkey checks, restarts,
outages and real restore/reconciliation from independently secured backups.
Audit exposed-key incident recovery, deployed image/network isolation, cold seed
custody and descriptor pinning. Any mainnet enablement requires a separate
explicit decision and implementation after these checks, not a UI toggle.

No GitHub push, Coolify deployment, mainnet enablement or production payment was
performed as part of this interface update.
