import { z } from "zod";

export const PUBLIC_PRICE_URL = "https://api.exchange.coinbase.com/products/BTC-USD/ticker";
const ticker = z.object({
  price: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).pipe(z.number().finite().positive()),
  time: z.string(),
});
export function parsePublicPrice(body: unknown, now = Date.now()) {
  const value = ticker.parse(body);
  const at = Date.parse(value.time);
  if (!Number.isFinite(at) || now - at > 180000 || at > now + 30000) {
    throw new Error("Public price timestamp is invalid or stale");
  }
  const updatedAt = new Date(at).toISOString();
  return {
    available: true, stale: false, price: value.price, currency: "USD",
    source: "Coinbase Exchange BTC-USD", updatedAt,
    message: "Latest exchange trade price. Not a guaranteed execution price.",
    // One genuine observation, not fabricated historical candles.
    history: [{ time: updatedAt, price: value.price }],
  };
}
export async function fetchPublicPrice(request: typeof fetch = fetch) {
  const response = await request(PUBLIC_PRICE_URL, {
    headers: { Accept: "application/json" },
    redirect: "error", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Public price provider returned HTTP ${response.status}`);
  return parsePublicPrice(await response.json());
}
