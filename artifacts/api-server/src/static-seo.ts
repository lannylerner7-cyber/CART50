import { readFileSync } from "node:fs";
import path from "node:path";

type PageMeta = { title: string; description: string; canonical: string };
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]!);

/** The built frontend ships the same public metadata that its client router uses. */
export function loadPageMetadata(root: string, allowed: readonly string[]): Record<string, PageMeta> {
  const data = JSON.parse(readFileSync(path.join(root, "page-metadata.json"), "utf8"));
  if (!data || Array.isArray(data) || Object.keys(data).length !== allowed.length) throw new Error("Public metadata/allowlist mismatch");
  for (const p of allowed) {
    const m = data[p];
    if (!m || typeof m.title !== "string" || typeof m.description !== "string" || !allowed.includes(m.canonical)) {
      throw new Error(`Missing or invalid public metadata: ${p}`);
    }
  }
  return data;
}

/** Give crawlers the correct metadata before JavaScript, without exposing private route content. */
export function publicPageHtml(shell: string, m: PageMeta, origin: string) {
  const title = escapeHtml(`${m.title} · MainVault`);
  const description = escapeHtml(m.description);
  const canonical = escapeHtml(`${origin}${m.canonical}`);
  const clean = shell
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\b(?=[^>]*(?:name|property)=["'](?:robots|description|og:title|og:description|og:url|twitter:title|twitter:description)["'])[^>]*>/gi, "")
    .replace(/<link\b(?=[^>]*rel=["']canonical["'])[^>]*>/gi, "");
  return clean.replace("</head>", `<title>${title}</title>
    <meta name="description" content="${description}" />
    <meta name="robots" content="index, follow" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${canonical}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <link rel="canonical" href="${canonical}" />
  </head>`);
}
