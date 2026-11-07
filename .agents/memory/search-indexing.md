---
name: Search indexing allowlist
description: Which pages Google may index and how the three layers (header, robots.txt, route meta) are kept consistent.
---
Only the public developer pages (homepage, about, apply, resources and its
section paths) are indexable. Everything else — owner vault, developer console,
Sandbox, hosted checkout, platform admin — stays noindex via `X-Robots-Tag`,
`robots.txt` and a per-route meta tag set at runtime.

**Why:** the user wants the public site submitted to Search Console but
protected routes kept out; the shell previously carried a global noindex meta
that would have blocked everything.

**How to apply:** the allowlist exists in both the API server (`static.ts`) and
the web app (`lib/seo.ts`) and must change together. `/` is the canonical copy
of the developer homepage (`/developers` canonicalises to it and is omitted from
the sitemap). Origins come from `PUBLIC_ORIGIN`/request host or
`window.location.origin`; never hardcode the domain. Resource sections have
path routes (`/resources/<section>`) so each has a distinct title/description;
hash links still work.
