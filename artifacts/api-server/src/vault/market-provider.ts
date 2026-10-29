/** Public configuration labels only; never includes upstream URLs or credentials. */
export function marketProviderLabel(env: NodeJS.ProcessEnv = process.env): string {
  switch (env.MARKET_PROVIDER ?? "coinbase") {
    case "coinbase": return "Coinbase Exchange BTC-USD";
    case "cloudflare-worker": return "Cloudflare market Worker";
    default: return "Unsupported market provider";
  }
}
