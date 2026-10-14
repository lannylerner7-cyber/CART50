import type { RequestHandler } from "express";

// Bound open API responses before parsing bodies or reading metadata. This is
// overload protection, not a public-API quota or a substitute for an edge proxy.
export function admission(limit = 128): RequestHandler {
  let active = 0;
  return (_req, res, next) => {
    if (active >= limit) {
      res.setHeader("Retry-After", "1");
      res.status(503).json({ error: "Vault busy; no new operation was admitted. Retry reads later; reconcile payments before retrying." });
      return;
    }
    active++;
    let released = false;
    const release = () => { if (!released) { released = true; active--; } };
    res.once("finish", release);
    res.once("close", release);
    next();
  };
}
