import { randomUUID } from "node:crypto";
import { changeState } from "./store";
import { GetMarketResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

export type PricePoint = { time: string; price: number };
export function alertCondition(kind: string, threshold: number, windowMinutes: number, price: number, now: number, history: PricePoint[]): boolean | null {
  if (kind === "below") return price < threshold;
  const target = now - windowMinutes * 60000;
  const base = [...history].reverse().find(p => Date.parse(p.time) <= target);
  if (!base || target - Date.parse(base.time) > 180000 || base.price <= 0) return null;
  return (base.price - price) / base.price * 100 >= threshold;
}
const unavailable = () => ({
  available: false, price: null, currency: "USD", source: "Kraken via Cloudflare Worker",
  updatedAt: null, stale: true, message: "Market Worker not connected. No market prices are being fabricated.", history: [] as PricePoint[],
});
let cache = unavailable() as ReturnType<typeof GetMarketResponse.parse>;
let nextFetch = 0;
let running = false;
export async function refreshMarket() {
  if (running || Date.now() < nextFetch || !process.env.MARKET_WORKER_URL) return;
  running = true; nextFetch = Date.now() + 60000;
  try {
    const url = new URL(process.env.MARKET_WORKER_URL);
    if (url.protocol !== "https:") throw new Error("Worker requires HTTPS");
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Price feed unavailable");
    const candidate = GetMarketResponse.parse(await response.json());
    const timestamp = Date.parse(candidate.updatedAt ?? "");
    if (!candidate.available || candidate.stale || !candidate.price || !Number.isFinite(timestamp) || Date.now() - timestamp > 180000 || timestamp > Date.now() + 30000 || candidate.currency !== "USD") throw new Error("Price feed is stale");
    cache = candidate;
    const now = Date.now();
    await changeState(s => {
      for (const a of s.alerts) {
        if (!a.enabled) continue;
        const crossed = alertCondition(a.kind, a.threshold, a.windowMinutes, candidate.price!, now, candidate.history);
        if (crossed === null) continue;
        if (!crossed) { a.armed = true; continue; }
        if (!a.armed || (a.lastTriggeredAt && now - Date.parse(a.lastTriggeredAt) < a.cooldownMinutes * 60000)) continue;
        a.armed = false; a.lastTriggeredAt = new Date(now).toISOString();
        s.notifications.push({ id: randomUUID(), title: a.name, message: `Bitcoin price alert: $${candidate.price!.toFixed(2)} USD (${a.kind === "below" ? "below threshold" : "percentage drop"}). Source: Kraken.`, createdAt: a.lastTriggeredAt, read: false });
      }
      s.notifications = s.notifications.slice(-500);
    });
  } catch {
    cache = { ...cache, available: false, stale: true, message: "Price feed unavailable or stale. Alerts are paused until fresh data returns." };
    logger.warn("Market feed refresh failed; price alerts suppressed");
  } finally { running = false; }
}
export function getMarket() {
  const stale = !cache.updatedAt || Date.now() - Date.parse(cache.updatedAt) > 180000;
  return { ...cache, stale, available: cache.available && !stale };
}
export function startMarketPolling() {
  void refreshMarket();
  setInterval(() => void refreshMarket(), 60000).unref();
}
