import { HttpError } from "./auth";
import * as Z from "@workspace/api-zod";
import { configuredNetwork } from "./network";
import { ReadFlight } from "./read-flight";

let active = 0;
export type EngineEnvironment = "live" | "sandbox";
const reads = new Map(["live", "sandbox"].flatMap(scope => ["/status", "/settings", "/wallets", "/transactions"].map(key => [`${scope}:${key}`, new ReadFlight<unknown>()] as const)));

function connection(scope: EngineEnvironment) {
  if (scope === "live" && configuredNetwork() !== "main") throw new HttpError(503, "Live mainnet signer is not commissioned. Read-only mainnet monitoring remains available.");
  if (scope === "sandbox" && process.env.SANDBOX_SIGNET_ENABLED !== "true") throw new HttpError(503, "Signet connection is disabled pending isolated commissioning.");
  const url = scope === "live" ? process.env.VAULT_ENGINE_URL : process.env.SANDBOX_ENGINE_URL;
  const token = scope === "live" ? process.env.VAULT_ENGINE_TOKEN : process.env.SANDBOX_ENGINE_TOKEN;
  if (!url || !token) throw new HttpError(503, "Private signer connection is not configured.");
  if (scope === "sandbox" && process.env.BITCOIN_NETWORK === "main" &&
      (url === process.env.VAULT_ENGINE_URL || token === process.env.VAULT_ENGINE_TOKEN))
    throw new HttpError(503, "Sandbox requires a separate signer URL and token.");
  return { url, token, network: scope === "live" ? "main" : "signet" };
}

export async function engine<T>(endpoint: string, body?: unknown, scope: EngineEnvironment = "live"): Promise<T> {
  // Check reads as well as writes: no Signet balances/history may leak into Live.
  connection(scope);
  if (endpoint !== "/status") {
    const status = await engine<{ network: string; connected?: boolean }>("/status", undefined, scope);
    if (status.network !== (scope === "live" ? "main" : "signet")) throw new HttpError(503, "Signer network mismatch; operation blocked");
    if (body !== undefined && status.connected !== true) throw new HttpError(503, "Signer is not ready; operation blocked");
  }
  const flight = body === undefined ? reads.get(`${scope}:${endpoint}`) : undefined;
  if (flight) return flight.read(() => requestEngine<T>(endpoint, undefined, scope)) as Promise<T>;
  if (body !== undefined) for (const read of reads.values()) read.clear();
  try { return await requestEngine<T>(endpoint, body, scope); }
  finally { if (body !== undefined) for (const read of reads.values()) read.clear(); }
}
async function requestEngine<T>(endpoint: string, body: unknown, scope: EngineEnvironment): Promise<T> {
  const config = connection(scope);
  const base = new URL(config.url);
  if (base.username || base.password || (base.protocol !== "https:" && !(base.protocol === "http:" && ["127.0.0.1", "localhost", "vault-engine", "vault-mainnet-engine", "vault-signet-engine"].includes(base.hostname)))) {
    throw new HttpError(503, "Engine URL requires HTTPS or a local private service");
  }
  if (active >= 16) throw new HttpError(503, "Signer request capacity reached. Reconcile payments before retrying.");
  active++;
  try {
    const response = await fetch(new URL(endpoint, base), {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(endpoint === "/wallets/create" ? 120000 : 20000),
    });
    const data = await response.json() as T & { error?: string };
    if (!response.ok) throw new HttpError(response.status, data.error || "Engine rejected the operation");
    if (endpoint === "/status" && (data as {network?: string}).network !== config.network) throw new HttpError(503, "Signer network mismatch");
    return data;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(503, "Bitcoin engine is unreachable. No operation has been reported as successful; reconnect and reconcile before retrying.");
  } finally {
    active--;
  }
}
export async function nodeStatus() {
  try { return await engine<Record<string, unknown>>("/status"); }
  catch {
    return { connected: false, network: "main", blocks: null, headers: null, syncProgress: null, peers: null, lastSync: null, message: "Mainnet wallet connection is not ready. Sync monitoring remains independent; balances and transfers are unavailable until commissioning.", recoveryStatus: "waiting_for_connection" };
  }
}
export async function operationalSettings() {
  // The signer is authoritative. Never claim a cached D1 policy is enforced.
  const settings = Z.UpdateVaultSettingsBody.parse(await engine("/settings"));
  return { ...settings, network: configuredNetwork(), destructionPolicy: "wait_for_drainage_storage_unverified", expiryHours: 120, provider: "Kraken via Cloudflare Worker", priceCurrency: "USD", externalConfigured: !!process.env.VAULT_ENGINE_URL };
}
