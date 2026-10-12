// Cloudflare's structural binding types keep this package runtime-independent.
interface Statement { bind(...v: unknown[]): Statement; run(): Promise<unknown>; all<T>(): Promise<{results: T[]}> }
interface Env {
  DB: { prepare(sql: string): Statement; batch(s: Statement[]): Promise<unknown> };
  BACKUPS: { put(key: string, value: ArrayBuffer, opts?: unknown): Promise<unknown> };
  REPLICA: { send(message: unknown): Promise<void> };
  REPLICA_TOKEN: string;
  MARKET_ENABLED: string;
}
type Checkpoint = { id: "engine-health"; sequence: number; data: { network: "signet" | "regtest"; blocks: number; recoveryStatus: string; lastSync: string } };
function validateCheckpoint(v: unknown): Checkpoint {
  if (!v || typeof v !== "object") throw new Error("Invalid checkpoint");
  const x = v as Checkpoint;
  if (x.id !== "engine-health" || !Number.isSafeInteger(x.sequence) || x.sequence < 0 || !x.data || !["signet", "regtest"].includes(x.data.network) || !Number.isSafeInteger(x.data.blocks) || typeof x.data.recoveryStatus !== "string" || x.data.recoveryStatus.length > 100 || !Number.isFinite(Date.parse(x.data.lastSync))) throw new Error("Invalid checkpoint");
  // Whitelist only operational metadata: no keys, addresses, balances or tx history.
  return { id: "engine-health", sequence: x.sequence, data: { network: x.data.network, blocks: x.data.blocks, recoveryStatus: x.data.recoveryStatus, lastSync: x.data.lastSync } };
}
async function authorized(req: Request, env: Env) {
  if (!env.REPLICA_TOKEN || env.REPLICA_TOKEN.length < 32) return false;
  const actual = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.REPLICA_TOKEN}`;
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  let difference = 0; for (let i = 0; i < a.length; i++) difference |= a[i]! ^ b[i]!;
  return difference === 0;
}
async function fetchPrice(env: Env) {
  if (env.MARKET_ENABLED !== "true") return;
  // Fixed public pair only. Never accept user query strings or wallet information.
  const response = await fetch("https://api.kraken.com/0/public/Ticker?pair=XBTUSD", { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Market provider unavailable");
  const data = await response.json() as { error: string[]; result: Record<string, { c: string[] }> };
  const price = Number(data.result?.XXBTZUSD?.c?.[0]);
  if (data.error?.length || !Number.isFinite(price) || price <= 0) throw new Error("Invalid market quote");
  const time = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO prices(time,price) VALUES(?,?)").bind(time, price),
    env.DB.prepare("DELETE FROM prices WHERE time < ?").bind(new Date(Date.now() - 8 * 86400000).toISOString()),
  ]);
}
export default {
  async scheduled(_event: unknown, env: Env) { await fetchPrice(env); },
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (req.method === "GET" && url.pathname === "/price") {
        const { results } = await env.DB.prepare("SELECT time,price FROM prices ORDER BY time ASC").all<{time: string;price: number}>();
        const latest = results.at(-1), stale = !latest || Date.now() - Date.parse(latest.time) > 180000 || env.MARKET_ENABLED !== "true";
        return Response.json({
          available: !stale, price: latest?.price ?? null, currency: "USD", source: "Kraken via Cloudflare Worker",
          updatedAt: latest?.time ?? null, stale, history: results,
          message: stale ? "Market data unavailable or stale; alerts paused." : "Kraken BTC/USD last-trade price sampled every 60 seconds, not tick-by-tick. Reference only.",
        }, { headers: { "Cache-Control": "public, max-age=30", "X-Content-Type-Options": "nosniff" } });
      }
      if (!await authorized(req, env)) return Response.json({error: "Unauthorized"}, {status: 401});
      if (req.method === "POST" && url.pathname === "/replicate") {
        if (Number(req.headers.get("content-length") ?? 0) > 4096) return new Response("Too large", {status: 413});
        const text = await req.text();
        if (text.length > 4096) return new Response("Too large", {status: 413});
        await env.REPLICA.send(validateCheckpoint(JSON.parse(text)));
        return Response.json({queued: true}, {status: 202});
      }
      if (req.method === "PUT" && /^\/backups\/[a-zA-Z0-9_-]{1,80}\.vault$/.test(url.pathname)) {
        const size = Number(req.headers.get("content-length"));
        if (!Number.isSafeInteger(size) || size < 32 || size > 16 * 1024 * 1024) return new Response("Invalid backup size", {status: 413});
        const encrypted = await req.arrayBuffer();
        if (encrypted.byteLength !== size || new TextDecoder().decode(encrypted.slice(0, 8)) !== "VAULTB01") return new Response("Encrypted backup format required", {status: 400});
        // Encryption key is offline and never a Worker binding.
        await env.BACKUPS.put(url.pathname.slice(9), encrypted, { httpMetadata: {contentType: "application/octet-stream"} });
        return Response.json({stored: true});
      }
      return new Response("Not found", {status: 404});
    } catch {
      return Response.json({error: "Metadata service unavailable"}, {status: 503});
    }
  },
  async queue(batch: {messages: {body: unknown; ack(): void; retry(): void}[]}, env: Env) {
    for (const message of batch.messages) {
      try {
        const c = validateCheckpoint(message.body);
        await env.DB.prepare("INSERT INTO replica(id,sequence,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET sequence=excluded.sequence,data=excluded.data WHERE excluded.sequence > replica.sequence").bind(c.id, c.sequence, JSON.stringify(c.data)).run();
        message.ack();
      } catch { message.retry(); }
    }
  },
};
