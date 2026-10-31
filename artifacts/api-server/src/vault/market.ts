import { randomUUID } from "node:crypto";
import { changeState } from "./store";
import { GetMarketResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { marketRequest } from "./market-request";
import { fetchPublicPrice } from "./public-market";
import { marketProviderLabel } from "./market-provider";

export type PricePoint = { time: string; price: number };
export function alertCondition(kind: string, threshold: number, windowMinutes: number, price: number, now: number, history: PricePoint[]): boolean | null {
  if (kind === "below") return price < threshold;
  const target = now - windowMinutes * 60000;
  const base = [...history].reverse().find(p => Date.parse(p.time) <= target);
  if (!base || target - Date.parse(base.time) > 180000 || base.price <= 0) return null;
  return (base.price - price) / base.price * 100 >= threshold;
}
const unavailable = () => ({
  available: false, price: null, currency: "USD", source: marketProviderLabel(),
  updatedAt: null, stale: true, message: "Price data is temporarily unavailable. Updated quotes will appear when the connection is restored.", history: [] as PricePoint[],
});
let cache = unavailable() as ReturnType<typeof GetMarketResponse.parse>;
let nextFetch = 0;
let running = false;
export async function refreshMarket() {
  if (running || Date.now() < nextFetch) return;
  running = true; nextFetch = Date.now() + 60000;
  try {
    const provider = process.env.MARKET_PROVIDER ?? "coinbase";
    let body: unknown;
    if (provider === "coinbase") {
      body = await fetchPublicPrice();
    } else if (provider === "cloudflare-worker") {
      const { url, options } = marketRequest();
      const response = await fetch(url, options);
      if (!response.ok) {
        logger.warn({ status: response.status }, "Market Worker rejected request");
        throw new Error("Price feed unavailable");
      }
      body = await response.json();
    } else {
      throw new Error("Unsupported market provider");
    }
    const candidate = GetMarketResponse.parse(body);
    const timestamp = Date.parse(candidate.updatedAt ?? "");
    if (!candidate.available || candidate.stale || !Number.isFinite(candidate.price) || candidate.price! <= 0 || !Number.isFinite(timestamp) || Date.now() - timestamp > 180000 || timestamp > Date.now() + 30000 || candidate.currency !== "USD") throw new Error("Price feed is stale");
    if (provider === "coinbase") {
      candidate.history = [...cache.history.filter(p => Date.parse(p.time) >= Date.now() - 86400000 && p.time !== candidate.updatedAt), ...candidate.history].slice(-1440);
    }
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
        s.notifications.push({ id: randomUUID(), title: a.name, message: `Bitcoin price alert: $${candidate.price!.toFixed(2)} USD (${a.kind === "below" ? "below threshold" : "percentage drop"}). Source: ${candidate.source}.`, createdAt: a.lastTriggeredAt, read: false });
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
