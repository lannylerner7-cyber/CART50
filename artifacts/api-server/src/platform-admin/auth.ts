import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes, scryptSync, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { cookie, equal, hash, HttpError, verifyOrigin } from "../lib/security";
import { requireOwner } from "../vault/auth";

const derive = promisify(scrypt);
const NAME = "__Host-platform_admin";
const AGE = 30 * 60_000;
type AdminSession = { csrf: string; expiresAt: string; passkeyAt: number; version: string };
// Deliberately process-local: restart invalidates sessions, never restores old authority.
const sessions = new Map<string, AdminSession>();
const attempts = new Map<string, { count: number; until: number }>();
let cached: { version: string; salt: Buffer; verifier: Buffer } | undefined;
function configuration() {
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  const email = (process.env.PLATFORM_ADMIN_EMAIL || "account@mainvaultwallet.com").trim().toLowerCase();
  if (!password || password.length < 12 || password.length > 256) {
    sessions.clear(); cached = undefined; return undefined;
  }
  const version = hash(`${email}\0${password}`);
  if (cached?.version !== version) {
    const salt = randomBytes(32);
    cached = { version, salt, verifier: scryptSync(password, salt, 64) };
    sessions.clear();
  }
  return { ...cached, email };
}
export function platformSession(req: Request) {
  const config = configuration();
  const token = cookie(req, NAME);
  if (!config || !token) return undefined;
  const key = hash(token), session = sessions.get(key);
  if (!session || session.version !== config.version || Date.parse(session.expiresAt) <= Date.now()) {
    sessions.delete(key); return undefined;
  }
  return session;
}
function payload(session?: AdminSession) {
  return { authenticated: !!session, configured: !!configuration(), csrfToken: session?.csrf ?? null,
    expiresAt: session?.expiresAt ?? null, authenticatedAt: session?.passkeyAt ?? null };
}
function throttle(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  // Socket identity is never taken from untrusted forwarded headers; global budget bounds cardinality.
  for (const [key, max] of [["global", 30], [`ip:${req.socket.remoteAddress}`, 5]] as const) {
    const entry = attempts.get(key) ?? { count: 0, until: now + 60_000 };
    entry.count++; attempts.set(key, entry);
    if (entry.count > max) { res.setHeader("Retry-After", Math.ceil((entry.until-now)/1000)); throw new HttpError(429, "Too many sign-in attempts. Wait one minute."); }
  }
  next();
}
export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  const session = platformSession(req);
  if (!session) throw new HttpError(401, "Sign in to platform admin");
  if (!["GET","HEAD"].includes(req.method) && !equal(req.get("x-csrf-token") ?? "", session.csrf))
    throw new HttpError(403, "Session verification failed");
  res.locals.session = session;
  res.locals.adminActor = "platform-admin";
  next();
}
// Existing owner administrative access remains compatible; platform sessions never enter owner middleware.
export function requireAdministrator(req: Request, res: Response, next: NextFunction) {
  if (req.get("x-platform-admin") === "1" || cookie(req, NAME)) return requirePlatformAdmin(req, res, next);
  res.locals.adminActor = "owner";
  return requireOwner(req, res, next);
}
export const platformAdminRouter = Router();
platformAdminRouter.use((_req,res,next) => { res.setHeader("Cache-Control","no-store"); next(); });
platformAdminRouter.get("/session", (req,res) => res.json(payload(platformSession(req))));
platformAdminRouter.post("/login", verifyOrigin, throttle, async (req,res) => {
  const input = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) }).strict().parse(req.body);
  const config = configuration();
  if (!config) throw new HttpError(503, "Platform administrator sign-in is not configured");
  const candidate = await derive(input.password, config.salt, 64) as Buffer;
  if (!equal(candidate.toString("hex"), config.verifier.toString("hex")) ||
      !equal(hash(input.email.trim().toLowerCase()), hash(config.email)))
    throw new HttpError(401, "Email or password is incorrect");
  // Recheck after asynchronous derivation so a concurrent configuration rotation cannot mint authority.
  if (configuration()?.version !== config.version) throw new HttpError(401, "Configuration changed; sign in again");
  const previous = cookie(req, NAME); if (previous) sessions.delete(hash(previous));
  for (const [key,value] of sessions) if (Date.parse(value.expiresAt) <= Date.now()) sessions.delete(key);
  if (sessions.size >= 20) sessions.delete(sessions.keys().next().value!);
  const token = randomBytes(32).toString("base64url");
  const session = { csrf: randomBytes(32).toString("base64url"), expiresAt: new Date(Date.now()+AGE).toISOString(),
    passkeyAt: Date.now(), version: config.version };
  sessions.set(hash(token), session);
  res.cookie(NAME, token, { httpOnly:true, secure:true, sameSite:"strict", path:"/", maxAge:AGE });
  res.json(payload(session));
});
platformAdminRouter.post("/logout", verifyOrigin, requirePlatformAdmin, (req,res) => {
  sessions.delete(hash(cookie(req,NAME)!));
  res.clearCookie(NAME, { httpOnly:true, secure:true, sameSite:"strict", path:"/" });
  res.json({ ok:true });
});
