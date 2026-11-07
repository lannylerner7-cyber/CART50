---
name: Independent fixture browser boundary
description: Verify the browser's actual origin before claiming isolated wallet acceptance.
---

Confirm the actual browser URL and the full API request URL before entering
credentials into an independent local fixture. A successful shell request to
the fixture does not establish that the browser is reaching it.

**Why:** Repeated acceptance attempts reached the ordinary preview's unavailable
page despite being asked to use the separate loopback service; later attempts
also timed out without reports. Database mutations and successful API seeds
cannot substitute for asserted browser behavior.

**How to apply:** Resolve browser transport first, preserve the independent
runtime boundary, use disposable credentials only, and record partial/blocked
evidence rather than inferring that unreported scenarios passed.

Verify a non-secret per-run response fingerprint as well as enabled service
state before credentials. Browser navigation alone is insufficient provenance.

**Why:** Direct loopback browser navigation eventually worked, but browser-side
request interception either missed its target or hung before proving an
upstream response. An abort alone did not establish post-commit response loss.

**How to apply:** When interception is unreliable, use an opt-in fixture-only
post-commit response fault and private request evidence. Prove the original
commit and same-key retry; never put fault controls into production routes.

Verify temporary credential-directory removal after stopping a fixture.

**Why:** Stopping a package-manager-wrapped background process closed the
listener without completing the child process's temporary-directory cleanup.

**How to apply:** Check both listener shutdown and directory absence. Remove
only the known disposable run directory if shutdown left it behind.

For multi-tab WebAuthn testing, CDP virtual authenticators may be target-scoped
even when cookies are shared. Enroll a disposable passkey through the UI in each
target rather than fabricating authentication responses.

**Why:** A shared browser context did not make the first target's virtual
authenticator available to the second target.

**How to apply:** Keep the shared cookie context for session-rotation tests,
but use genuine UI enrollment per target. Avoid accessibility snapshots while
a disposable credential input is populated; masking screenshots does not
necessarily mask the accessibility tree.

The disposable developer fixture (`scripts/developer-ui-fixture.mts`, HTTP on
localhost:4400) serves `artifacts/bitcoin-vault/dist/public`, so build first
with `NODE_ENV=production PORT=3000 BASE_PATH=/`. Its mail sink keys messages
by lower-cased email; the fixture origin is http, so UI that assumes https
links (e.g. preview URLs) must accept `https?`. Remove `/tmp/developer-ui-isolated-*`
after stopping it.
