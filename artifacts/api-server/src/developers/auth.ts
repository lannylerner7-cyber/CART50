import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { cookie, equal, hash, HttpError } from "../lib/security";
import { accountBy, updateAccount, type Account, type DevSession } from "./store";

export const DEV_COOKIE = "__Host-developer_session";
export const cookieOptions = { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/" };
export function activeSession(a: Account, s: DevSession) {
  if(a.merchant?.status==="suspended")throw new HttpError(401,"Developer access suspended");
  if (!a.sessions.some(x => x.hash===s.hash && x.expires>Date.now())) throw new HttpError(401,"Developer session expired");
}
export async function identify(req: Request, full = false) {
  const token = cookie(req, DEV_COOKIE);
  if (!token || !/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(token)) throw new HttpError(401, "Sign in to your developer account");
  const [id, secret] = token.split(".");
  const a = await accountBy("id", id);
  const s = a?.sessions.find(s => equal(s.hash, hash(secret)) && s.expires > Date.now());
  if (!a || !s || a.merchant?.status==="suspended" || (full && (s.level !== "full" || !a.verified || !a.passkeys.length))) throw new HttpError(401, "Developer session expired");
  if (!["GET", "HEAD"].includes(req.method) && !equal(req.get("x-developer-csrf") ?? "", s.csrf)) throw new HttpError(403, "Developer session verification failed");
  return { a, s };
}
export async function issueSession(res: Response, id: string, level: DevSession["level"], passkey = false, expectedKeyHash?: string) {
  const token = randomBytes(32).toString("base64url");
  const s: DevSession = { hash: hash(token), csrf: randomBytes(32).toString("base64url"),
    expires: Date.now()+30*60000, level, ...(passkey ? { passkeyAt: Date.now() } : {}) };
  await updateAccount(id, a => {
    if(a.merchant?.status==="suspended" || !a.verified || (level==="full" && !a.passkeys.length) || (expectedKeyHash && a.keyHash!==expectedKeyHash))
      throw new HttpError(401,"Developer sign in failed");
    a.sessions = [...a.sessions.filter(s => s.expires > Date.now()).slice(-9), s];
  });
  res.cookie(DEV_COOKIE, `${id}.${token}`, { ...cookieOptions, maxAge: 30*60000 });
  return s;
}
export function payload(a: Account, s: DevSession) {
  return { authenticated: true, id: a.id, name: a.name, email: a.email, verified: a.verified,
    passkeyEnrolled: a.passkeys.length > 0, ready: a.provisioning === "ready", keyIssued: !!a.keyHash,
    csrfToken: s.csrf, expiresAt: new Date(s.expires).toISOString(), level: s.level, liveApproved: a.merchant?.liveApplication==="approved" };
}
