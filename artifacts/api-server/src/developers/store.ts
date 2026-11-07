import { randomUUID } from "node:crypto";
import { initializeMetadata, query } from "./storage";
import type {StoredPasskey} from "../vault/store";
import { HttpError } from "../lib/security";
import type { MerchantState } from "./merchant";
import type { MailDiagnostic } from "./mail-diagnostics";

export type DevSession = { hash: string; csrf: string; expires: number; level: "onboarding" | "full"; passkeyAt?: number };
export type DevReview = { id: string; destination: string; amountCents: number; amountSats: number; sessionHash: string; createdAt: string; expiresAt: string; status: "pending" | "complete"; receiptId?: string };
export type DevReceipt = { id: string; destination: string; amountCents: number; amountSats: number; balanceAfterCents: number; balanceAfterSats: number; createdAt: string; status: "simulation_complete"; test: true };
export type Account = {
  walletApiKey?:{hash:string;scopes:string[];expiresAt:number;version:number};
  merchant?: MerchantState;
  id: string; email: string; name: string; createdAt: string; termsVersion: string; acceptedAt: string;
  verified: boolean; passkeys: StoredPasskey[]; keyHash?: string; sessions: DevSession[];
  verification?: { hash: string; expires: number; sentAt: number; attempts: number; delivery: "pending" | "sent" | "failed"; diagnostic?: MailDiagnostic };
  provisioning: "not_started" | "ready"; balanceSats: number; quote?: { priceCents: number; at: string; source: string };
  reviews: DevReview[]; transactions: DevReceipt[]; audit: { event: string; at: string }[];
};
export async function accountBy(field: "id" | "email", value: string): Promise<Account | undefined> {
  await initializeMetadata();
  const rows = await query(`SELECT data FROM developer_accounts WHERE ${field}=?`, [value]);
  return rows[0] ? JSON.parse(String(rows[0].data)) : undefined;
}
export async function createAccount(name: string, email: string, termsVersion: string) {
  const a: Account = { id: randomUUID(), email, name, createdAt: new Date().toISOString(), termsVersion,
    acceptedAt: new Date().toISOString(), verified: false, passkeys: [], sessions: [], provisioning: "not_started",
    balanceSats: 0, reviews: [], transactions: [], audit: [] };
  await initializeMetadata();
  const rows = await query("INSERT OR IGNORE INTO developer_accounts(id,email,version,data) VALUES(?,?,0,?) RETURNING id", [a.id, email, JSON.stringify(a)]);
  return rows.length ? a : undefined;
}
export async function updateAccount<T>(id: string, fn: (a: Account) => T | Promise<T>): Promise<T> {
  await initializeMetadata();
  for (let i=0; i<8; i++) {
    const rows = await query("SELECT version,data FROM developer_accounts WHERE id=?", [id]);
    if (!rows[0]) throw new HttpError(401, "Developer session expired");
    const a: Account = JSON.parse(String(rows[0].data));
    const result = await fn(a);
    const changed = await query("UPDATE developer_accounts SET data=?,version=version+1 WHERE id=? AND version=? RETURNING id", [JSON.stringify(a), id, Number(rows[0].version)]);
    if (changed.length) return result;
  }
  throw new HttpError(409, "Concurrent update; recheck your account");
}
export function centsFor(a: Account, sats = a.balanceSats) {
  return a.quote ? Number(BigInt(sats) * BigInt(a.quote.priceCents) / 100000000n) : 0;
}
export function audit(a: Account, event: string) {
  a.audit = [...a.audit, { event, at: new Date().toISOString() }].slice(-100);
}
