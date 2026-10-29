---
name: Developer intro experience
description: User's direction for video-led developer entry and homepage imagery.
---

Let the uploaded intro finish before revealing the homepage, unless the visitor
explicitly skips or needs reduced motion. Keep playback failures honest and
recoverable rather than treating a failed start as a completed video.

**Why:** the user reported the homepage appearing before the video finished and
asked for a lively homepage inspired by the video's imagery.

**How to apply:** keep the supplied video as the intro, not a source of repeated
screenshots across the homepage. Clearly identify the video's bonus graphic as
simulation credit, not real Bitcoin, withdrawable money or cash.

**Browser compatibility:** successful MP4 inspection with ffprobe does not prove
browser decoding. The acceptance browser rejected the H264 stream, which the
old error handler disguised as a completed intro; VP9 WebM playback worked.
Keep a browser-compatible source and distinguish actual completion from error
recovery when checking the intro.

The developer homepage should use professional, product-led messaging, with
Meld's Blockchain.com integration page as a reference for explaining value,
integration flow and next steps. Use product-focused floating cards and scroll
transitions, not repeated video frames, storm/lightning slogans or unrelated copy.
Include a professional footer with Terms, Policy, Privacy, Documentation,
Integration and Contact links to substantive content.

**Why:** the user rejected the existing homepage write-up as random and asked
for a coherent fintech product explanation based on that reference.

**How to apply:** explain the actual checkout workflow and developer capabilities
first, distinguish available simulation from gated Live access, and never borrow
Meld's partner logos, coverage statistics or service claims.
