import { HttpError } from "./auth";
import * as Z from "@workspace/api-zod";
import { configuredNetwork } from "./network";
import { ReadFlight } from "./read-flight";

let active = 0;
const reads = new Map(["/status", "/settings", "/wallets", "/transactions"].map(key => [key, new ReadFlight<unknown>()]));

export async function engine<T>(endpoint: string, body?: unknown): Promise<T> {
  // A wrong-network signer must never receive a mutation, in either direction.
  if (body !== undefined) {
    const status = await engine<{ network: string }>("/status");
    if (status.network !== configuredNetwork()) throw new HttpError(503, "Signer network mismatch; operation blocked");
  }
  const flight = body === undefined ? reads.get(endpoint) : undefined;
  if (flight) return flight.read(() => requestEngine<T>(endpoint)) as Promise<T>;
  if (body !== undefined) for (const read of reads.values()) read.clear();
  try { return await requestEngine<T>(endpoint, body); }
  finally { if (body !== undefined) for (const read of reads.values()) read.clear(); }
}
async function requestEngine<T>(endpoint: string, body?: unknown): Promise<T> {
  if (!process.env.VAULT_ENGINE_URL || !process.env.VAULT_ENGINE_TOKEN) throw new HttpError(503, "Bitcoin engine not connected. Configure your private engine first.");
  const base = new URL(process.env.VAULT_ENGINE_URL);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && ["127.0.0.1", "localhost", "vault-engine", "vault-mainnet-engine"].includes(base.hostname))) {
    throw new HttpError(503, "Engine URL requires HTTPS or a local private service");
  }
  if (active >= 16) throw new HttpError(503, "Signer request capacity reached. Reconcile payments before retrying.");
  active++;
  try {
    const response = await fetch(new URL(endpoint, base), {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${process.env.VAULT_ENGINE_TOKEN}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(endpoint === "/wallets/create" ? 120000 : 20000),
    });
    const data = await response.json() as T & { error?: string };
    if (!response.ok) throw new HttpError(response.status, data.error || "Engine rejected the operation");
    if (endpoint === "/status" && (data as {network?: string}).network !== configuredNetwork()) throw new HttpError(503, "Signer network mismatch");
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
    return { connected: false, network: configuredNetwork(), blocks: null, headers: null, syncProgress: null, peers: null, lastSync: null, message: "Private node unavailable or network mismatch. No node data is assumed.", recoveryStatus: "waiting_for_connection" };
  }
}
export async function operationalSettings() {
  // The signer is authoritative. Never claim a cached D1 policy is enforced.
  const settings = Z.UpdateVaultSettingsBody.parse(await engine("/settings"));
  return { ...settings, network: configuredNetwork(), destructionPolicy: "wait_for_drainage_storage_unverified", expiryHours: 120, provider: "Kraken via Cloudflare Worker", priceCurrency: "USD", externalConfigured: !!process.env.VAULT_ENGINE_URL };
}
