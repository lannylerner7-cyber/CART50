import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { changeState, readState, type SessionRecord } from "./store";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function credentialHash(value: string): string {
  if (!/^[A-Za-z0-9_-]{86}$/.test(value)) throw new HttpError(400, "Use the 86-character credential from your new offline keyfile");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length !== 64 || bytes.toString("base64url") !== value) throw new HttpError(400, "Invalid keyfile encoding");
  return createHash("sha256").update(bytes).digest("hex");
}
export function equal(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function ownerHash() {
  const state = await readState();
  const verifier = state.credentialHash ?? process.env.VAULT_OWNER_VERIFIER ?? null;
  return verifier && /^[a-f0-9]{64}$/.test(verifier) ? verifier : null;
}
export function cookie(req: Request, name: string) {
  return req.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="))?.slice(name.length + 1);
}
const cookieName = "__Host-vault_session";
export async function sessionFor(req: Request) {
  const token = cookie(req, cookieName);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  const state = await readState();
  return state.sessions.find(s => equal(s.hash, hash(token)) && Date.parse(s.expiresAt) > Date.now());
}
export async function newSession(res: Response) {
  const token = randomBytes(32).toString("base64url");
  const record: SessionRecord = { hash: hash(token), csrf: randomBytes(32).toString("base64url"), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 60000).toISOString() };
  await changeState(s => { s.sessions = s.sessions.filter(x => Date.parse(x.expiresAt) > Date.now()).slice(-9); s.sessions.push(record); });
  res.cookie(cookieName, token, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 30 * 60000 });
  return record;
}
export function clearSessionCookie(res: Response) {
  res.clearCookie(cookieName, { httpOnly: true, secure: true, sameSite: "strict", path: "/" });
}
export const sessionPayload = (session?: SessionRecord, configured = true) => ({
  authenticated: !!session, configured, csrfToken: session?.csrf ?? null, expiresAt: session?.expiresAt ?? null,
  network: process.env.BITCOIN_NETWORK === "regtest" ? "regtest" : "signet",
});
export function expectedOrigin(req: Request) {
  // Pin PUBLIC_ORIGIN in production. Host fallback is for same-origin development only.
  if (process.env.PUBLIC_ORIGIN) return new URL(process.env.PUBLIC_ORIGIN).origin;
  if (process.env.NODE_ENV === "production") throw new HttpError(503, "PUBLIC_ORIGIN must be configured");
  return `https://${req.get("host")}`;
}
export function verifyOrigin(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
  const origin = req.get("origin");
  if (!origin || origin !== expectedOrigin(req)) throw new HttpError(403, "Request origin rejected");
  if (!req.is("application/json") && Number(req.get("content-length") || 0) > 0) throw new HttpError(415, "JSON required");
  next();
}
export async function requireOwner(req: Request, res: Response, next: NextFunction) {
  const session = await sessionFor(req);
  if (!session) throw new HttpError(401, "Unlock your vault to continue");
  if (!["GET", "HEAD"].includes(req.method) && !equal(req.get("x-csrf-token") ?? "", session.csrf)) throw new HttpError(403, "Session verification failed");
  res.locals.session = session;
  next();
}
const limits = new Map<string, { count: number; until: number }>();
export function rateLimit(req: Request, _res: Response, next: NextFunction) {
  const now = Date.now();
  for (const [key, value] of limits) if (value.until < now) limits.delete(key);
  // Global limit also prevents spoofed forwarding headers from bypassing throttling.
  for (const key of ["global", req.socket.remoteAddress ?? "unknown"]) {
    const limit = limits.get(key) ?? { count: 0, until: now + 60000 };
    limit.count++;
    limits.set(key, limit);
    if (limit.count > (key === "global" ? 30 : 10)) throw new HttpError(429, "Too many attempts; wait one minute");
  }
  next();
}
