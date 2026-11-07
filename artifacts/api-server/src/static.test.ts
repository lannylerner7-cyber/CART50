import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtempSync, writeFileSync, rmSync, copyFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mountDashboard, PUBLIC_PAGES, PUBLIC_RESOURCES, robotsTxt } from "./static";

function metadataFixture(dir: string) {
  copyFileSync(new URL("../../bitcoin-vault/src/lib/page-metadata.json", import.meta.url), path.join(dir, "page-metadata.json"));
}

test("single-origin container routing keeps API and missing assets out of SPA fallback", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vault-static-"));
  writeFileSync(path.join(dir, "index.html"), '<html><head><title>Default</title><meta name="description" content="Default" /></head>vault-test</html>');
  metadataFixture(dir);
  writeFileSync(path.join(dir, "app.js"), "/* asset */");
  writeFileSync(path.join(dir, "offline-keygen.html"), "<html>offline-generator</html>");
  const app = express();
  app.use((_req, res, next) => { res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive"); next(); });
  app.get("/api/healthz", (_req, res) => { res.json({ status: "ok" }); });
  mountDashboard(app, dir);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const checkout="/checkout/12345678-1234-1234-1234-123456789abc."+"A".repeat(43);
    for (const route of ["/", "/wallets", "/settings/security",checkout,"/developers/resources/terms","/developers/login","/mainvaultwallet/personal/admin/wallets"]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.match(await response.text(), /vault-test/);
      // Only the public developer pages may be indexed; vault, console, checkout and admin routes stay hidden.
      const indexable = ["/","/developers/resources/terms"].includes(route);
      assert.equal(response.headers.get("x-robots-tag"), indexable ? null : "noindex, nofollow, noarchive", route);
    }
    assert.equal((await fetch(base + "/developers/about/")).headers.get("x-robots-tag"), null);
    assert.equal((await fetch(base + "/developers/aboutx")).headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
    const robots = await (await fetch(base + "/robots.txt")).text();
    assert.match(robots, /^User-agent: \*$/m);
    assert.match(robots, /^Allow: \/\$$/m);
    assert.match(robots, /^Allow: \/developers\/resources\/documentation\$$/m);
    assert.match(robots, /^Allow: \/assets\/$/m);
    assert.match(robots, /^Disallow: \/$/m);
    assert.match(robots, new RegExp(`^Sitemap: ${base.replace(/[.*+?^$()|[\]\\]/g, "\\$&")}/sitemap.xml$`, "m"));
    assert.doesNotMatch(robots, /mainvaultwallet\/personal|checkout|sandbox|login/);
    const sitemapResponse = await fetch(base + "/sitemap.xml");
    assert.equal(sitemapResponse.headers.get("x-robots-tag"), null);
    assert.match(sitemapResponse.headers.get("content-type") ?? "", /xml/);
    const sitemap = await sitemapResponse.text();
    for (const p of ["/", "/developers/about", "/developers/apply", "/developers/resources", "/developers/resources/privacy"]) assert.ok(sitemap.includes(`<loc>${base}${p}</loc>`), p);
    assert.doesNotMatch(sitemap, /personal\/admin|\/sandbox|\/checkout\/|\/login|<loc>[^<]*\/developers<\/loc>/);
    assert.deepEqual(await (await fetch(base + "/api/healthz")).json(), { status: "ok" });
    const missingAPI = await fetch(base + "/api/missing");
    assert.equal(missingAPI.status, 404);
    assert.match(missingAPI.headers.get("content-type") ?? "", /json/);
    for (const route of ["/missing.js", "/.env","/checkout/.env",checkout+".js",checkout+"/.env"]) assert.equal((await fetch(base + route)).status, 404);
    assert.equal((await fetch(base+checkout,{headers:{accept:"application/json"}})).status,404);
    assert.match(await (await fetch(base + "/app.js")).text(), /asset/);
    assert.match(await (await fetch(base + "/offline-keygen.html")).text(), /offline-generator/);
    for (const p of PUBLIC_PAGES) {
      const html = await (await fetch(base + p)).text();
      assert.match(html, /<meta name="robots" content="index, follow"/, p);
      assert.ok(html.includes(`<link rel="canonical" href="${base}${p === "/developers" ? "/" : p}"`), p);
      assert.equal((html.match(/<title>/g) ?? []).length, 1);
      assert.equal((html.match(/<meta name="description"/g) ?? []).length, 1);
    }
    const doc = await (await fetch(base + "/developers/resources/documentation")).text();
    assert.match(doc, /<title>API documentation · MainVault<\/title>/);
    assert.equal((await fetch(base + "/developers/resources/missing")).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    rmSync(dir, { recursive: true });
  }
});

test("production blocks setup HTML while keeping index and SPA routes available", async () => {
  const dir=mkdtempSync(path.join(tmpdir(),"vault-public-"));
  const old=process.env.NODE_ENV;
  process.env.NODE_ENV="production";
  for(const f of ["index.html","offline-keygen.html","signet-setup.html"]) writeFileSync(path.join(dir,f),"<html>fixture</html>");
  metadataFixture(dir);
  const app=express(); mountDashboard(app,dir);
  const server=app.listen(0,"127.0.0.1");
  await new Promise<void>(resolve=>server.once("listening",resolve));
  const addr=server.address(); assert.ok(addr && typeof addr!=="string");
  try {
    const base=`http://127.0.0.1:${addr.port}`;
    for(const url of ["/offline-keygen.html","/signet-setup.html","/%73ignet-setup.html","/.env","/.git/config","/engine.json","/missing.js"]) {
      assert.equal((await fetch(base+url)).status,404,url);
    }
    for(const url of ["/","/index.html","/spending"]) assert.equal((await fetch(base+url)).status,200,url);
  } finally {
    if(old===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=old;
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    rmSync(dir,{recursive:true});
  }
});

test("Google-style longest-rule matching allows rendering dependencies but excludes private routes", () => {
  const rules = robotsTxt("https://example.test").split("\n").flatMap(line => {
    const m = /^(Allow|Disallow): (.+)$/.exec(line);
    return m ? [{ allow: m[1] === "Allow", rule: m[2] }] : [];
  });
  const allowed = (p: string) => {
    const matching = rules.filter(r => r.rule.endsWith("$") ? p === r.rule.slice(0, -1) : p.startsWith(r.rule));
    matching.sort((a, b) => b.rule.length - a.rule.length || Number(b.allow) - Number(a.allow));
    return matching[0]?.allow ?? true;
  };
  for (const p of [...PUBLIC_PAGES, ...PUBLIC_RESOURCES, "/api/developers/session", "/sitemap.xml"]) assert.equal(allowed(p), true, p);
  for (const p of ["/api/vault/wallets", "/api/developers/sandbox", "/developers/login", "/developers/sandbox", "/developers/checkout", "/checkout/private", "/mainvaultwallet/vault-admin/admin"]) assert.equal(allowed(p), false, p);
  const dev = readFileSync(new URL("../../bitcoin-vault/public/robots.txt", import.meta.url), "utf8");
  const crawlRules = (text: string) => text.split("\n").filter(l => /^(Allow|Disallow):/.test(l)).sort();
  assert.deepEqual(crawlRules(dev), crawlRules(robotsTxt("https://example.test")), "development and production crawl rules agree");
});
