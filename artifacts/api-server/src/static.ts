import express, { type Express, type Request } from "express";
import path from "node:path";
import { existsSync } from "node:fs";

/**
 * Pages a search engine may index. Everything else served from this origin
 * (owner vault, developer console, Sandbox, hosted checkout, admin) stays
 * noindex through the X-Robots-Tag header, robots.txt and the page meta tag.
 * Keep in step with the public route table in the web app (src/lib/seo.ts).
 */
export const RESOURCE_SECTIONS = ["terms", "privacy", "policy", "documentation", "integration", "contact"] as const;
export const PUBLIC_PAGES: readonly string[] = [
  "/",
  "/developers",
  "/developers/about",
  "/developers/apply",
  "/developers/resources",
  ...RESOURCE_SECTIONS.map(s => `/developers/resources/${s}`),
];
/** Crawlers must fetch these to render the public pages; they are not indexed as documents. */
const PUBLIC_RESOURCES = ["/assets/", "/favicon.svg", "/developer-intro.jpg"];

export function isPublicPage(pathname: string) {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return PUBLIC_PAGES.includes(p);
}
export function isPublicResource(pathname: string) {
  return PUBLIC_RESOURCES.some(r => r.endsWith("/") ? pathname.startsWith(r) : pathname === r);
}
/** Absolute site origin for robots and sitemap: configured in production, request host otherwise. */
export function siteOrigin(req: Request) {
  if (process.env.PUBLIC_ORIGIN) return new URL(process.env.PUBLIC_ORIGIN).origin;
  return `${req.protocol}://${req.get("host")}`;
}
export function robotsTxt(origin: string) {
  const allow = [
    "Allow: /$",
    "Allow: /developers$",
    "Allow: /developers/about$",
    "Allow: /developers/apply$",
    "Allow: /developers/resources$",
    ...RESOURCE_SECTIONS.map(s => `Allow: /developers/resources/${s}$`),
    ...PUBLIC_RESOURCES.map(r => `Allow: ${r}`),
  ];
  return ["User-agent: *", ...allow, "Disallow: /", "", `Sitemap: ${origin}/sitemap.xml`, ""].join("\n");
}
export function sitemapXml(origin: string) {
  // The developer homepage and / render the same page; / is the canonical copy.
  const urls = PUBLIC_PAGES.filter(p => p !== "/developers").map(p => `  <url><loc>${origin}${p === "/" ? "/" : p}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

// Coolify serves both artifacts from one origin; Replit keeps its managed routing.
export function mountDashboard(app: Express, directory?: string) {
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });
  if (!directory) return;
  const root = path.resolve(directory);
  const index = path.join(root, "index.html");
  if (!existsSync(index)) throw new Error("Built dashboard index.html is missing");
  app.get("/robots.txt", (req, res) => { res.type("text/plain").send(robotsTxt(siteOrigin(req))); });
  app.get("/sitemap.xml", (req, res) => { res.type("application/xml").send(sitemapXml(siteOrigin(req))); });
  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    let decodedPath: string;
    try { decodedPath = path.posix.normalize(decodeURIComponent(req.path)); }
    catch { res.sendStatus(400); return; }
    if (isPublicPage(decodedPath) || isPublicResource(decodedPath)) res.removeHeader("X-Robots-Tag");
    else res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    if (process.env.NODE_ENV === "production" && ["/offline-keygen.html", "/signet-setup.html"].includes(decodedPath)) {
      res.sendStatus(404);
      return;
    }
    next();
  });
  app.use(express.static(root, { index: false, dotfiles: "deny", cacheControl: false }));
  app.get("/{*path}", (req, res) => {
    // Missing scripts, images and dotfiles must not get a misleading HTML 200.
    const checkoutRoute = /^\/checkout\/[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}\/?$/.test(req.path);
    if ((req.path.includes(".") && !checkoutRoute) || !req.accepts("html")) {
      res.sendStatus(404);
      return;
    }
    res.sendFile(index, { cacheControl: false });
  });
}
