import { randomBytes } from "node:crypto";
import {HttpError,hash,equal,cookie} from "../lib/security";
export {HttpError,hash,equal,cookie,credentialHash,expectedOrigin,verifyOrigin} from "../lib/security";
import type { Request, Response, NextFunction } from "express";
import { changeState, readState, type SessionRecord } from "./store";
import { configuredNetwork } from "./network";

export async function ownerHash() {
  const state = await readState();
  const verifier = state.credentialHash ?? process.env.VAULT_OWNER_VERIFIER ?? null;
  return verifier && /^[a-f0-9]{64}$/.test(verifier) ? verifier : null;
}
const cookieName = "__Host-vault_session";
export async function sessionFor(req: Request) {
  const token = cookie(req, cookieName);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  const state = await readState();
  return state.sessions.find(s => equal(s.hash, hash(token)) && Date.parse(s.expiresAt) > Date.now());
}
export async function newSession(res: Response, passkey = false) {
  const token = randomBytes(32).toString("base64url");
  const record: SessionRecord = { hash: hash(token), csrf: randomBytes(32).toString("base64url"), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 60000).toISOString(), ...(passkey ? {passkeyAt:Date.now()} : {}) };
  await changeState(s => { s.sessions = s.sessions.filter(x => Date.parse(x.expiresAt) > Date.now()).slice(-9); s.sessions.push(record); });
  res.cookie(cookieName, token, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 30 * 60000 });
  return record;
}
export function clearSessionCookie(res: Response) {
  res.clearCookie(cookieName, { httpOnly: true, secure: true, sameSite: "strict", path: "/" });
}
export const sessionPayload = (session?: SessionRecord, configured = true) => ({
  authenticated: !!session, configured, csrfToken: session?.csrf ?? null, expiresAt: session?.expiresAt ?? null,
  network: "main",
});
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
