---
name: Coolify mount parsing
description: Hosted Compose parsing can weaken read-only and missing-storage safeguards.
---
Do not infer live mount protections from native Compose tests alone.

**Why:** The hosted signer cookie mount became writable despite read_only in the
repository. Docker inspection confirmed an explicit :rw bind. The inspected
Coolify beta.446 parser converts long-form binds to strings and loses options;
its raw-mode loader also mkdirs direct service-level bind sources. Thus switching
to raw mode alone does not provide a reliable missing-disk startup guard.

**How to apply:** Use raw deployment with local-driver bind volumes for this
mainnet stack, preserving the existing encrypted data paths. Inspect live mount
RW flags and volume driver options after deployment. Do not put substitute data
directories on the root filesystem under an unmounted encrypted mountpoint.
Stop the previous mainnet resource before switching deployment modes so no old
signer remains against shared state. Never stop or change unrelated applications.

The owner subsequently verified the raw-mode/local-driver arrangement on the
host: the signer cookie was read-only and the driver devices referenced the
intended encrypted directories. Preserve this approach rather than reverting
to direct binds based solely on native Compose tests.
