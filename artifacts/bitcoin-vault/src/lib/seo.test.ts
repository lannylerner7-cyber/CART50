import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRouteSeo, publicMeta } from './seo';

/** Minimal <head> stand-in: enough for querySelector/createElement/appendChild/remove. */
function fakeHead() {
  type El = { tag: string; attrs: Record<string, string>; content: string; remove(): void; setAttribute(k: string, v: string): void };
  const els: El[] = [];
  const make = (tag: string): El => {
    const el: El = { tag, attrs: {}, content: '', remove() { els.splice(els.indexOf(el), 1); }, setAttribute(k, v) { el.attrs[k] = v; } };
    return el;
  };
  const head = {
    querySelector(sel: string) {
      const m = /^(\w+)\[(\w+:?\w*)="([^"]+)"\]$/.exec(sel)!;
      return els.find(e => e.tag === m[1] && e.attrs[m[2]] === m[3]) ?? null;
    },
    appendChild(el: El) { els.push(el); },
  };
  const doc = { title: '', head, createElement: make };
  return { doc, els, get(tag: string, attr: string, key: string) { return els.find(e => e.tag === tag && e.attrs[attr] === key); } };
}

test('only the public developer pages are indexable, with / as the homepage canonical', () => {
  assert.equal(publicMeta('/')!.canonical, '/');
  assert.equal(publicMeta('/developers')!.canonical, '/');
  assert.equal(publicMeta('/developers/about/')!.canonical, '/developers/about');
  assert.match(publicMeta('/developers/resources/documentation')!.title, /documentation/i);
  for (const p of ['/developers/login', '/developers/sandbox/send', '/developers/checkout', '/checkout/abc.def', '/mainvaultwallet/personal/admin', '/developers/aboutx']) {
    assert.equal(publicMeta(p), null, p);
  }
});

test('route metadata marks protected routes noindex and public routes with canonical + description', () => {
  const h = fakeHead();
  // Simulate what the hook does, with a stubbed document and the Link/Meta elements captured.
  const g = globalThis as unknown as { document: unknown };
  const saved = g.document;
  g.document = h.doc;
  try {
    applyRouteSeo('/developers/sandbox', 'https://mainvaultwallet.com', '');
    assert.equal(h.get('meta', 'name', 'robots')!.attrs.content, 'noindex, nofollow, noarchive');
    assert.equal(h.get('link', 'rel', 'canonical'), undefined);
    applyRouteSeo('/developers/about', 'https://mainvaultwallet.com', '');
    assert.equal(h.get('meta', 'name', 'robots')!.attrs.content, 'index, follow');
    assert.equal(h.get('link', 'rel', 'canonical')!.attrs.href, 'https://mainvaultwallet.com/developers/about');
    assert.equal(h.get('meta', 'property', 'og:url')!.attrs.content, 'https://mainvaultwallet.com/developers/about');
    assert.match(h.doc.title, /About MainVault · MainVault/);
    applyRouteSeo('/developers', 'https://mainvaultwallet.com', '');
    assert.equal(h.get('link', 'rel', 'canonical')!.attrs.href, 'https://mainvaultwallet.com/');
    applyRouteSeo('/checkout/abc.def', 'https://mainvaultwallet.com', '');
    assert.equal(h.get('meta', 'name', 'robots')!.attrs.content, 'noindex, nofollow, noarchive');
    assert.equal(h.get('link', 'rel', 'canonical'), undefined);
    assert.equal(h.get('meta', 'property', 'og:url'), undefined);
  } finally {
    g.document = saved;
  }
});
