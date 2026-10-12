import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import type { WebAuthnCredential } from "@simplewebauthn/server";

export type Alert = {
  id: string; name: string; kind: "below" | "percent_drop"; threshold: number;
  windowMinutes: number; cooldownMinutes: number; enabled: boolean;
  lastTriggeredAt: string | null; armed: boolean;
};
export type SessionRecord = { hash: string; csrf: string; expiresAt: string; createdAt: string };
export type StoredPasskey = { id: string; name: string; createdAt: string; publicKey: string; counter: number; transports?: WebAuthnCredential["transports"] };
export type State = {
  credentialHash: string | null;
  sessions: SessionRecord[];
  passkeys: StoredPasskey[];
  alerts: Alert[];
  notifications: { id: string; title: string; message: string; createdAt: string; read: boolean }[];
  settings: { sweepsPaused: boolean; feeRateCeiling: string; totalFeeCeilingSats: string; hotExposureLimitSats: string };
};
const initial = (): State => ({
  credentialHash: null, sessions: [], passkeys: [], alerts: [], notifications: [],
  settings: { sweepsPaused: true, feeRateCeiling: "0", totalFeeCeilingSats: "0", hotExposureLimitSats: "0" },
});
let local: DatabaseSync | undefined;
export const externalConfigured = () => !!(process.env.CF_ACCOUNT_ID && process.env.CF_D1_DATABASE_ID && process.env.CF_API_TOKEN);
async function query(sql: string, params: (string | number)[] = []): Promise<Record<string, unknown>[]> {
  if (externalConfigured()) {
    const account = process.env.CF_ACCOUNT_ID!, database = process.env.CF_D1_DATABASE_ID!;
    if (!/^[a-zA-Z0-9-]+$/.test(account + database)) throw new Error("Invalid D1 identifiers");
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
      method: "POST", headers: { Authorization: `Bearer ${process.env.CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(10000),
    });
    const result = await response.json() as { success: boolean; result?: { results: Record<string, unknown>[]; success: boolean }[] };
    if (!response.ok || !result.success || !result.result?.[0]?.success) throw new Error("Cloudflare metadata unavailable");
    return result.result[0].results;
  }
  if (process.env.NODE_ENV === "production") throw new Error("Production requires Cloudflare D1 configuration");
  if (!local) {
    const dir = process.env.VAULT_DATA_DIR || path.resolve(".vault-data");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    local = new DatabaseSync(path.join(dir, "metadata.sqlite"));
    chmodSync(path.join(dir, "metadata.sqlite"), 0o600);
    local.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS vault_state (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, data TEXT NOT NULL)");
  }
  return local.prepare(sql).all(...params) as Record<string, unknown>[];
}
async function readVersion(): Promise<{ version: number; state: State }> {
  await query("INSERT OR IGNORE INTO vault_state(id,version,data) VALUES(1,0,?)", [JSON.stringify(initial())]);
  const rows = await query("SELECT version,data FROM vault_state WHERE id=1");
  if (!rows[0]) throw new Error("Metadata state missing");
  return { version: Number(rows[0].version), state: JSON.parse(String(rows[0].data)) };
}
export async function readState(): Promise<State> { return (await readVersion()).state; }
// Optimistic CAS is also enforced in D1, not just in this process.
export async function changeState<T>(fn: (state: State) => T): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { version, state } = await readVersion();
    const result = fn(state);
    const changed = await query("UPDATE vault_state SET data=?,version=version+1 WHERE id=1 AND version=? RETURNING version", [JSON.stringify(state), version]);
    if (changed.length) return result;
  }
  throw new Error("Concurrent metadata update; please retry");
}
