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
