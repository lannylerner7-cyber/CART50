---
name: Wallet presentation
description: User's visual direction and boundaries of the supplied wallet references.
---
The user wants a clean, intuitive wallet dashboard and login, rather than making the interface look like an engine to communicate its power. Their mobile-wallet references emphasize balances, receiving QR codes and simple actions.

**Why:** The user explicitly requested this direction for the existing vault on 2026-10-14.

**How to apply:** Keep main and temporary wallet receiving approachable while keeping network and expiry warnings visible. The reference screenshots do not themselves authorize swaps, altcoins, simulated balances or removal of custody safeguards.

The user approved closely matching the supplied black mobile wallet screens: floating navigation/actions, receive/send sheets, orange-and-white receive QR presentation, address options, and grouped transaction history, adapted to the vault's own brand and Bitcoin-only scope.

**Why:** The user approved this interpretation of their five screenshots on 2026-10-17. Their reference is a visual and interaction direction, not permission to copy example addresses, balances, earnings claims, or guaranteed processing times.

**How to apply:** Preserve real wallet data, supported actions, and visible synchronization/readiness safeguards when reproducing the reference presentation.

The login coin-rain audio should attempt autoplay, with a visible manual sound control when the browser blocks it.

**Why:** The user requested autoplay after the initial opt-in audio implementation.

**How to apply:** Respect browser playback restrictions; do not claim autoplay is guaranteed on iPhone/iPad or remove the mute control.

Show mainnet synchronization progress after login without requiring repeated terminal commands, independently of the wallet's active network during commissioning.

**Why:** The user asked for in-app progress while mainnet is still syncing and the wallet remains on Signet. Monitoring must not prematurely enable real-Bitcoin transfers.

**How to apply:** Keep monitoring read-only, label freshness and unavailable data explicitly, and distinguish blockchain synchronization from custody readiness.
