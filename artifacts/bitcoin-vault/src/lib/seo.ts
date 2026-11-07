import { useEffect } from 'react';

/**
 * Route-level document metadata. Only the public developer pages are indexable;
 * every other route (owner vault, developer console, Sandbox, hosted checkout,
 * admin) carries a noindex meta tag in addition to the server header and robots.txt.
 * Keep the public list in step with the API server's PUBLIC_PAGES (static.ts).
 */
export const SITE_NAME = 'MainVault';
const DEFAULT_DESCRIPTION = 'Bitcoin checkout API for developers: create hosted checkout sessions from your server, test the full flow in an isolated Sandbox and confirm orders with signed webhooks.';

export type PageMeta = { title: string; description: string; canonical: string };

export const RESOURCE_SECTION_META: Record<string, { title: string; description: string }> = {
  terms: { title: 'Developer terms', description: 'Terms that govern developer access to the MainVault Sandbox and checkout API.' },
  privacy: { title: 'Privacy', description: 'What MainVault stores for developer accounts, how credentials are protected and what is never collected.' },
  policy: { title: 'About the Sandbox', description: 'Sandbox policy: simulated balances only, how test checkouts settle, limits and operator controls.' },
  documentation: { title: 'API documentation', description: 'Create checkout sessions, redirect shoppers, settle test payments from a Sandbox wallet and verify signed webhooks.' },
  integration: { title: 'Integration guide', description: 'Return URLs, API keys, hosted checkout, Sandbox settlement and webhook verification for a MainVault integration.' },
  contact: { title: 'Contact', description: 'How to reach MainVault and apply for developer access.' },
};

const PUBLIC: Record<string, PageMeta> = {
  '/': { title: 'Bitcoin checkout API for developers', description: DEFAULT_DESCRIPTION, canonical: '/' },
  '/developers': { title: 'Bitcoin checkout API for developers', description: DEFAULT_DESCRIPTION, canonical: '/' },
  '/developers/about': { title: 'About MainVault', description: 'What MainVault is, how the Sandbox, review and Live model works, and what the Sandbox does and does not do.', canonical: '/developers/about' },
  '/developers/apply': { title: 'Apply for developer access', description: 'Apply with a name and email, verify, enrol a passkey and issue a Sandbox test key.', canonical: '/developers/apply' },
  '/developers/resources': { title: 'Developer resources', description: 'Terms, privacy, Sandbox policy, API documentation, integration guide and contact for MainVault developers.', canonical: '/developers/resources' },
  ...Object.fromEntries(Object.entries(RESOURCE_SECTION_META).map(([s, m]) => [`/developers/resources/${s}`, { ...m, canonical: `/developers/resources/${s}` }])),
};

export function publicMeta(pathname: string): PageMeta | null {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PUBLIC[p] ?? null;
}

function upsert(selector: string, create: () => HTMLElement, valueAttr: 'content' | 'href', value: string | null) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (value === null) { el?.remove(); return; }
  if (!el) { el = create(); document.head.appendChild(el); }
  el.setAttribute(valueAttr, value);
}
const meta = (attr: 'name' | 'property', key: string, content: string | null) =>
  upsert(`meta[${attr}="${key}"]`, () => { const m = document.createElement('meta'); m.setAttribute(attr, key); return m; }, 'content', content);
const canonical = (href: string | null) =>
  upsert('link[rel="canonical"]', () => { const l = document.createElement('link'); l.setAttribute('rel', 'canonical'); return l; }, 'href', href);

/** Applies metadata for the current route. Non-public routes keep their own titles and are marked noindex. */
export function applyRouteSeo(pathname: string, origin: string, base: string) {
  const m = publicMeta(pathname);
  if (!m) {
    meta('name', 'robots', 'noindex, nofollow, noarchive');
    canonical(null);
    meta('property', 'og:url', null);
    return;
  }
  const url = `${origin}${base}${m.canonical === '/' ? '/' : m.canonical}`;
  document.title = `${m.title} · ${SITE_NAME}`;
  meta('name', 'robots', 'index, follow');
  meta('name', 'description', m.description);
  meta('property', 'og:title', `${m.title} · ${SITE_NAME}`);
  meta('property', 'og:description', m.description);
  meta('property', 'og:url', url);
  meta('name', 'twitter:title', `${m.title} · ${SITE_NAME}`);
  meta('name', 'twitter:description', m.description);
  canonical(url);
}

export function useRouteSeo(pathname: string) {
  useEffect(() => {
    applyRouteSeo(pathname, window.location.origin, import.meta.env.BASE_URL.replace(/\/$/, ''));
  }, [pathname]);
}
