import express, { type Express } from "express";
import path from "node:path";
import { existsSync } from "node:fs";

// Coolify serves both artifacts from one origin; Replit keeps its managed routing.
export function mountDashboard(app: Express, directory?: string) {
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });
  if (!directory) return;
  const root = path.resolve(directory);
  const index = path.join(root, "index.html");
  if (!existsSync(index)) throw new Error("Built dashboard index.html is missing");
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use(express.static(root, { index: false, dotfiles: "deny", cacheControl: false }));
  app.get("/{*path}", (req, res) => {
    // Missing scripts, images and dotfiles must not get a misleading HTML 200.
    if (req.path.includes(".") || !req.accepts("html")) {
      res.sendStatus(404);
      return;
    }
    res.sendFile(index, { cacheControl: false });
  });
}
