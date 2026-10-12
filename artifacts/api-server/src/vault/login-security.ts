import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { Express, Request, Response } from "express";
import { changeState, readState, type State } from "./store";
import { credentialHash, equal, HttpError } from "./auth";

const HOUR = 3600000;
export type LoginSecurity = {
  clients: Record<string, { failures: number; expires: number; blockedUntil: number }>;
  global: { count: number; expires: number };
  nextAlert: number;
  pending?: { id: string; at: number; ip: string; blocked: boolean };
};
export function securityState(s: State): LoginSecurity {
  return s.loginSecurity ??= { clients: {}, global: { count: 0, expires: 0 }, nextAlert: 0 };
}
export function configureTrustedProxies(app: Express) {
  const ips = process.env.TRUSTED_PROXY_IPS?.split(",").map(x => x.trim()).filter(Boolean) ?? [];
  if (ips.some(ip => !isIP(ip))) throw new Error("TRUSTED_PROXY_IPS must contain exact proxy IP addresses only");
  app.set("trust proxy", ips.length ? ips : false);
}
export function clientIp(req: Request) {
  let ip = req.ip ?? req.socket.remoteAddress ?? "";
  if (ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  if (!isIP(ip)) throw new HttpError(400, "Invalid client address");
  return isIP(ip) === 6 ? new URL(`http://[${ip}]`).hostname.slice(1, -1) : ip;
}
const clientKey = (ip: string) => createHash("sha256").update(ip).digest("hex");
export function retrySeconds(s: State, ip: string, now: number) {
  const guard = securityState(s);
  const blocked = guard.clients[clientKey(ip)]?.blockedUntil ?? 0;
  const overall = guard.global.count >= 30 ? guard.global.expires : 0;
  return Math.max(0, Math.ceil((Math.max(blocked, overall) - now) / 1000));
}
export async function loginCooldown(req: Request) {
  return retrySeconds(await readState(), clientIp(req), Date.now());
}
// Pure state transition inside D1's optimistic compare-and-swap. Never send mail
// or produce other external side effects inside a retriable transaction.
export function attemptCredential(s: State, ip: string, candidate: unknown, now: number) {
  const verifier = s.credentialHash ?? process.env.VAULT_OWNER_VERIFIER;
  if (!verifier || !/^[a-f0-9]{64}$/.test(verifier)) throw new HttpError(503, "Owner not configured");
  const guard = securityState(s);
  for (const [key, value] of Object.entries(guard.clients)) {
    if (Math.max(value.expires, value.blockedUntil) <= now) delete guard.clients[key];
  }
  const wait = retrySeconds(s, ip, now);
  if (wait) return { accepted: false, retryAfter: wait };
  if (guard.global.expires <= now) guard.global = { count: 0, expires: now + 60000 };
  guard.global.count++;
  const key = clientKey(ip);
  let valid = false;
  try { valid = typeof candidate === "string" && equal(credentialHash(candidate), verifier); } catch { /* invalid encoding counts as a failure */ }
  if (valid) {
    delete guard.clients[key];
    return { accepted: true, retryAfter: 0 };
  }
  // 30 attempts/minute limits fresh IPs to <=1800/hour. Fail closed at capacity.
  if (!guard.clients[key] && Object.keys(guard.clients).length >= 2000) {
    return { accepted: false, retryAfter: 60 };
  }
  const client = guard.clients[key] ??= { failures: 0, expires: now + HOUR, blockedUntil: 0 };
  client.failures++;
  if (client.failures >= 3) client.blockedUntil = now + HOUR;
  if (!guard.pending && now >= guard.nextAlert) {
    guard.pending = { id: randomUUID(), at: now, ip, blocked: client.blockedUntil > now };
    guard.nextAlert = now + 15 * 60000;
  }
  return { accepted: false, retryAfter: Math.max(0, Math.ceil((client.blockedUntil - now) / 1000)) };
}
export async function checkCredential(req: Request, res: Response) {
  const ip = clientIp(req);
  const result = await changeState(s => attemptCredential(s, ip, req.body?.credential, Date.now()));
  if (result.retryAfter) {
    res.set("Retry-After", String(result.retryAfter));
    throw new HttpError(429, "Login temporarily restricted. Retry after the countdown.");
  }
  if (!result.accepted) throw new HttpError(401, "Credential not recognized");
}
