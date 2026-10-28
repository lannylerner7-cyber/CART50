---
name: Developer intro experience
description: User's direction for video-led developer entry and homepage imagery.
---

Let the uploaded intro finish before revealing the homepage, unless the visitor
explicitly skips or needs reduced motion. Keep playback failures honest and
recoverable rather than treating a failed start as a completed video.

**Why:** the user reported the homepage appearing before the video finished and
asked for a lively homepage inspired by the video's imagery.

**How to apply:** use the supplied mascot/lightning imagery as the homepage's
visual reference. Clearly identify the video's bonus graphic as simulation
credit, not real Bitcoin, withdrawable money or cash.

**Browser compatibility:** successful MP4 inspection with ffprobe does not prove
browser decoding. The acceptance browser rejected the H264 stream, which the
old error handler disguised as a completed intro; VP9 WebM playback worked.
Keep a browser-compatible source and distinguish actual completion from error
recovery when checking the intro.
