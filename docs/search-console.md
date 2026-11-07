# MainVault public search and favicon checklist

## Live observation — 2026-11-07

Read-only HTTPS requests to `https://mainvaultwallet.com` using a Googlebot
user-agent returned the older release:

- `/`: HTTP 200, but both the response header and HTML contain `noindex`.
- `/robots.txt`: HTTP 200, `User-agent: *` / `Disallow: /`.
- `/sitemap.xml`: HTTP 404.
- `/favicon.svg`: HTTP 200, but blocked by the crawl policy.
- `/favicon.ico`: HTTP 404.
- Documentation and About URLs also carry `X-Robots-Tag: noindex`.

This is a crawl-readiness check, not a request from a verified Google crawler,
nor proof of Search Console ownership or Google's current index. Source changes
do not change the hosted site until the operator deploys them through the
existing Coolify process. No hosting, DNS, deployment or Git push was performed.

## Search Console setup after deployment

1. Add the **Domain property** `mainvaultwallet.com` (no protocol or path).
   Complete Google's DNS TXT verification with the exact record it supplies.
   Alternatively use the URL-prefix property `https://mainvaultwallet.com/`
   and one of Google's supported verification methods. A property is not
   needed for each page.
2. Verify the public homepage and documentation return HTTP 200 without any
   `noindex` response header or meta tag. Check the rendered HTML as well as
   the initial response in **URL Inspection → Test live URL**.
3. Submit **`https://mainvaultwallet.com/sitemap.xml`** in **Sitemaps**.
   In a URL-prefix property where the host is already shown, enter `sitemap.xml`.
   Do not submit robots.txt, images, API routes, or individual page URLs as sitemaps.
4. Inspect/request indexing for the homepage, About and Documentation first.
   The sitemap supplies the remaining public pages. Check Page Indexing and
   sitemap processing reports later; submission does not guarantee inclusion,
   rankings or immediate updates.
5. Inspect the homepage again to request recrawling of favicon links. Google
   can take days to weeks to update the icon and does not guarantee displaying it.

### Canonical public URLs

```text
https://mainvaultwallet.com/
https://mainvaultwallet.com/developers/about
https://mainvaultwallet.com/developers/apply
https://mainvaultwallet.com/developers/resources
https://mainvaultwallet.com/developers/resources/terms
https://mainvaultwallet.com/developers/resources/privacy
https://mainvaultwallet.com/developers/resources/policy
https://mainvaultwallet.com/developers/resources/documentation
https://mainvaultwallet.com/developers/resources/integration
https://mainvaultwallet.com/developers/resources/contact
```

`/developers` is an alias with `/` as its canonical, not a separate submission.
About's model and Sandbox explanations are sections on the About page; do not
submit their hash fragments as separate pages.

Do not submit owner vault, platform admin, login/onboarding internals, developer
console, Sandbox wallet, hosted checkout capability URLs or `/api/*`.

## Implementation and privacy boundary

- Production serves robots and sitemap from the API server; the Vite preview
  has a matching static robots file but is not the production sitemap host.
- `PUBLIC_ORIGIN` provides production absolute URLs. Keep it set to the
  intended HTTPS origin; don't use a development preview origin.
- Public page titles, descriptions and canonical paths live in
  `artifacts/bitcoin-vault/src/lib/page-metadata.json`. The frontend uses them
  on navigation; Vite emits a copy in the build for the server to insert into
  public HTML before JavaScript.
  The server validates this file against its public-path allowlist at startup.
- Resource section paths render their own content, not six copies of the full
  resources page. The overview preserves older hash links.
- Crawling is allowed for the public page allowlist, its assets, icon files,
  intro media and the exact `/api/developers/session` dependency. That endpoint
  returns public terms to anonymous visitors, remains `noindex`, and does not
  bypass authentication. It is required to render these public SPA pages.
- Other paths retain `noindex` response headers and route metadata and remain
  disallowed in robots. **robots.txt is not access control.** Google cannot
  read a noindex header on a blocked URL; an externally linked blocked URL may
  appear as a URL-only result. Authentication protects private data. If an
  unwanted URL is already indexed, use Search Console's removal process and
  assess a targeted recrawl policy rather than broadly opening private routes.
- Google's rendered crawl is JavaScript-dependent. URL Inspection is the final
  check for Google's actual view; a successful local test does not establish
  that Google has indexed the page.

## Favicon source and compatibility

The existing bracket-and-amber mark is preserved. `favicon.svg` is the source.
Run `node scripts/build-favicons.mjs` to regenerate the raster versions;
`node scripts/build-favicons.mjs --check` verifies exact reproducibility.

- Modern browsers: SVG with `sizes="any"`.
- Small tabs/legacy consumers: PNG 16/32 and multi-frame ICO 16/32/48.
- Search results: stable, square 96px PNG explicitly linked in the homepage.
- Apple touch icon: 180px PNG.
- Safari pinned tabs: monochrome SVG mask with the amber theme colour.
- Manifest icons: 192px and 512px PNG, relative URLs/scope, ordinary browser
  display. This does not claim offline/PWA capabilities.

All paths use the artifact base prefix; all public icons are crawlable and
served with image MIME types. The dark icon background preserves contrast on
both light and dark browser surfaces. Do not frequently rename icon URLs.
Browser caches may retain an earlier favicon; compare in a fresh profile when
checking a deployed update. Headless image decode/render checks do not prove
native browser tab chrome, pinned-tab behaviour or real-device home-screen
appearance.

## References

- [Google: add and verify a property](https://support.google.com/webmasters/answer/34592)
- [Google: build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google: favicon requirements](https://developers.google.com/search/docs/appearance/favicon-in-search)
- [Google: noindex and robots limitations](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
