import { useEffect } from 'react';
import pages from './page-metadata.json';

/**
 * Route-level document metadata. Only the public developer pages are indexable;
 * every other route (owner vault, developer console, Sandbox, hosted checkout,
 * admin) carries a noindex meta tag in addition to the server header and robots.txt.
 * Keep the public list in step with the API server's PUBLIC_PAGES (static.ts).
 */
export const SITE_NAME = 'MainVault';

export type PageMeta = { title: string; description: string; canonical: string };

const PUBLIC: Record<string, PageMeta> = pages;
export const RESOURCE_SECTION_META = Object.fromEntries(
  Object.entries(PUBLIC).filter(([p]) => p.startsWith('/developers/resources/')).map(([p, m]) => [p.split('/').pop()!, m]),
);

export function publicMeta(pathname: string): PageMeta | null {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return Object.hasOwn(PUBLIC, p) ? PUBLIC[p] : null;
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
