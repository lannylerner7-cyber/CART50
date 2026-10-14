import { HttpError } from "./auth";
import * as Z from "@workspace/api-zod";

export async function engine<T>(endpoint: string, body?: unknown): Promise<T> {
  if (!process.env.VAULT_ENGINE_URL || !process.env.VAULT_ENGINE_TOKEN) throw new HttpError(503, "Bitcoin engine not connected. Configure your AWS test-network engine first.");
  const base = new URL(process.env.VAULT_ENGINE_URL);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && ["127.0.0.1", "localhost", "vault-engine"].includes(base.hostname))) {
    throw new HttpError(503, "Engine URL requires HTTPS or a local private service");
  }
  try {
    const response = await fetch(new URL(endpoint, base), {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${process.env.VAULT_ENGINE_TOKEN}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(endpoint === "/wallets/create" ? 120000 : 20000),
    });
    const data = await response.json() as T & { error?: string };
    if (!response.ok) throw new HttpError(response.status, data.error || "Engine rejected the operation");
    return data;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(503, "Bitcoin engine is unreachable. No operation has been reported as successful; reconnect and reconcile before retrying.");
  }
}
export async function nodeStatus() {
  try { return await engine<Record<string, unknown>>("/status"); }
  catch {
    return { connected: false, network: process.env.BITCOIN_NETWORK === "regtest" ? "regtest" : "signet", blocks: null, headers: null, syncProgress: null, peers: null, lastSync: null, message: "Connect your AWS Bitcoin Core engine. No node data is available.", recoveryStatus: "waiting_for_connection" };
  }
}
export async function operationalSettings() {
  // The signer is authoritative. Never claim a cached D1 policy is enforced.
  const settings = Z.UpdateVaultSettingsBody.parse(await engine("/settings"));
  return { ...settings, network: process.env.BITCOIN_NETWORK === "regtest" ? "regtest" : "signet", destructionPolicy: "wait_for_drainage_storage_unverified", expiryHours: 120, provider: "Kraken via Cloudflare Worker", priceCurrency: "USD", externalConfigured: !!process.env.VAULT_ENGINE_URL };
}
