---
name: Search indexing allowlist
description: Which pages Google may index and how the three layers (header, robots.txt, route meta) are kept consistent.
---
Only public developer pages are intended for indexing. Owner vault, developer
console, Sandbox, hosted checkout and platform admin stay outside the public
allowlist. A robots disallow rule limits crawling but does not guarantee
removal from search: a blocked crawler cannot read the noindex header.
Authentication, not SEO settings, protects private data.

**Why:** the user wants the public site submitted to Search Console but
protected routes kept out; the shell previously carried a global noindex meta
that would have blocked everything.

**How to apply:** preserve the public-only policy, homepage canonical and
existing intro experience. See replit.md for the metadata/allowlist maintenance
instructions. Explain crawl-readiness separately from verified Google indexing
or Search Console ownership; source changes alone do not update the Coolify site.

Crawlers must be able to fetch anonymous rendering dependencies as well as JS.

**Why:** blocking the public session/terms request prevents the SPA from
rendering even when the page itself and its scripts are allowed.

**How to apply:** test page rendering with the served robots rules enforced on
subrequests. Allow only the specific public dependency; keep its response
non-indexable and never weaken authentication.
