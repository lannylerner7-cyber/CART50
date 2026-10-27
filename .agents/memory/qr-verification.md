---
name: Branded wallet QR verification
description: Visual centering is not proof that a logo-bearing payment QR remains readable.
---
Verify the actual rendered QR, including the local center logo, by decoding long
Taproot payment URIs as well as shorter legacy addresses.

**Why:** A small branded QR looked valid but failed software decoding for the
longer payload. High error correction alone did not establish readability.

**How to apply:** Preserve the quiet zone and conservative logo size, and run
the render/decode test after changing QR dimensions, logo, styling or library.
Do not claim that software decoding proves compatibility with every camera.
