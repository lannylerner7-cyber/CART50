type Quote = {
  available: boolean; stale: boolean; price: number | null; currency: string;
  updatedAt: string | null;
};
/** Display only. This value must never be used to construct a payment amount. */
export function freshUsdPrice(quote: Quote | undefined, failed: boolean, now = Date.now()): number | null {
  if (!quote || failed || !quote.available || quote.stale || quote.currency !== 'USD' ||
    quote.price === null || !Number.isFinite(quote.price) || quote.price <= 0) return null;
  const at = Date.parse(quote.updatedAt ?? '');
  if (!Number.isFinite(at) || now - at > 180000 || at > now + 30000) return null;
  return quote.price;
}
export function usdEstimate(sats: string | null, price: number | null): string | null {
  if (sats === null || !/^\d{1,16}$/.test(sats) || price === null ||
    !Number.isFinite(price) || price <= 0) return null;
  const priceCents = Math.round(price * 100);
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0) return null;
  const amount = BigInt(sats);
  if (amount > 2100000000000000n) return null;
  const numerator = amount * BigInt(priceCents);
  if (numerator > 0n && numerator < 100000000n) return '< $0.01';
  const cents = (numerator + 50000000n) / 100000000n;
  return `$${(cents / 100n).toLocaleString('en-US')}.${(cents % 100n).toString().padStart(2, '0')}`;
}
