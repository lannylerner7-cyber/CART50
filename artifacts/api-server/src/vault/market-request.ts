/** Server-only Access credentials are restricted to the explicitly configured origin. */
export function marketRequest(env: NodeJS.ProcessEnv = process.env) {
  const url = new URL(env.MARKET_WORKER_URL ?? "");
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Market endpoint requires HTTPS without URL credentials");
  }
  const id = env.MARKET_CF_ACCESS_CLIENT_ID?.trim();
  const secret = env.MARKET_CF_ACCESS_CLIENT_SECRET?.trim();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (id || secret) {
    if (!id || !secret) throw new Error("Both market Access credentials are required");
    if (url.origin !== env.MARKET_CF_ACCESS_ORIGIN) {
      throw new Error("Market Access origin mismatch");
    }
    headers["CF-Access-Client-Id"] = id;
    headers["CF-Access-Client-Secret"] = secret;
  }
  return {
    url,
    options: {
      headers,
      redirect: "error" as const,
      signal: AbortSignal.timeout(10000),
    },
  };
}
