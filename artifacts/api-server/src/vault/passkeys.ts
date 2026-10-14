import { Router } from "express";
import { randomBytes } from "node:crypto";
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
  type RegistrationResponseJSON, type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { RegisterPasskeyBody, PasskeyLoginVerifyBody } from "@workspace/api-zod";
import { changeState, readState } from "./store";
import { cookie, expectedOrigin, HttpError, newSession, ownerHash, rateLimit, requireOwner, sessionPayload } from "./auth";
import { loginCooldown } from "./login-security";

const challenges = new Map<string, { value: string; expires: number; kind: "login" | "register"; session?: string }>();
const challengeCookie = "__Host-vault_challenge";
export const passkeyRouter = Router();
passkeyRouter.use(["/passkey-login/options", "/passkey-login/verify"], async (req, res, next) => {
  const wait = await loginCooldown(req);
  if (wait) {
    res.set("Retry-After", String(wait));
    throw new HttpError(429, "Login temporarily restricted. Retry after the countdown.");
  }
  next();
});
function remember(value: string, kind: "login" | "register", session?: string) {
  for (const [k, c] of challenges) if (c.expires < Date.now()) challenges.delete(k);
  if (challenges.size > 100) throw new HttpError(429, "Too many active challenges");
  const id = randomBytes(32).toString("base64url");
  challenges.set(id, { value, kind, session, expires: Date.now() + 120000 });
  return id;
}
function consume(id: string | undefined, kind: string, session?: string) {
  const c = id ? challenges.get(id) : undefined;
  if (id) challenges.delete(id);
  if (!c || c.expires < Date.now() || c.kind !== kind || c.session !== session) throw new HttpError(400, "Passkey challenge expired; start again");
  return c.value;
}
const opts = { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/", maxAge: 120000 };
passkeyRouter.post("/passkey-login/options", rateLimit, async (req, res) => {
  if (!await ownerHash()) throw new HttpError(503, "Configure your offline credential first");
  const options = await generateAuthenticationOptions({
    rpID: new URL(expectedOrigin(req)).hostname,
    userVerification: "required",
    allowCredentials: [], // Discoverable passkeys; do not expose credential identifiers pre-auth.
  });
  res.cookie(challengeCookie, remember(options.challenge, "login"), opts);
  res.json(options);
});
passkeyRouter.post("/passkey-login/verify", rateLimit, async (req, res) => {
  const body = PasskeyLoginVerifyBody.parse(req.body);
  const challenge = consume(cookie(req, challengeCookie), "login");
  const response = body.response as unknown as AuthenticationResponseJSON;
  const passkey = (await readState()).passkeys.find(p => p.id === response.id);
  if (!passkey) throw new HttpError(401, "Passkey verification failed");
  const verified = await verifyAuthenticationResponse({
    response, expectedChallenge: challenge, expectedOrigin: expectedOrigin(req),
    expectedRPID: new URL(expectedOrigin(req)).hostname, requireUserVerification: true,
    credential: { id: passkey.id, publicKey: Buffer.from(passkey.publicKey, "base64url"), counter: passkey.counter, transports: passkey.transports },
  });
  if (!verified.verified) throw new HttpError(401, "Passkey verification failed");
  await changeState(s => {
    const p = s.passkeys.find(x => x.id === passkey.id);
    if (!p || p.counter !== passkey.counter) throw new HttpError(409, "Passkey changed; retry");
    p.counter = verified.authenticationInfo.newCounter;
  });
  res.clearCookie(challengeCookie, opts);
  res.json(sessionPayload(await newSession(res)));
});
passkeyRouter.get("/passkeys", requireOwner, async (_req, res) => {
  res.json((await readState()).passkeys.map(({ id, name, createdAt }) => ({ id, name, createdAt })));
});
passkeyRouter.post("/passkeys/options", requireOwner, async (req, res) => {
  const state = await readState();
  const options = await generateRegistrationOptions({
    rpName: "Personal Bitcoin Vault", rpID: new URL(expectedOrigin(req)).hostname,
    userName: "Vault owner", userID: new TextEncoder().encode("personal-bitcoin-vault-owner"),
    attestationType: "none", excludeCredentials: state.passkeys.map(p => ({ id: p.id })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  res.cookie(challengeCookie, remember(options.challenge, "register", res.locals.session.hash), opts);
  res.json(options);
});
passkeyRouter.post("/passkeys/verify", requireOwner, async (req, res) => {
  const body = RegisterPasskeyBody.parse(req.body);
  if (!body.name.trim() || body.name.length > 80) throw new HttpError(400, "Use a name of 1–80 characters");
  const challenge = consume(cookie(req, challengeCookie), "register", res.locals.session.hash);
  const result = await verifyRegistrationResponse({
    response: body.response as unknown as RegistrationResponseJSON,
    expectedChallenge: challenge, expectedOrigin: expectedOrigin(req),
    expectedRPID: new URL(expectedOrigin(req)).hostname, requireUserVerification: true,
  });
  if (!result.verified || !result.registrationInfo) throw new HttpError(400, "Passkey could not be verified");
  const c = result.registrationInfo.credential;
  await changeState(s => {
    if (s.passkeys.length >= 10) throw new HttpError(400, "Maximum 10 passkeys");
    if (s.passkeys.some(p => p.id === c.id)) throw new HttpError(409, "Passkey already enrolled");
    s.passkeys.push({ id: c.id, name: body.name.trim(), createdAt: new Date().toISOString(), publicKey: Buffer.from(c.publicKey).toString("base64url"), counter: c.counter, transports: c.transports });
  });
  res.clearCookie(challengeCookie, opts);
  res.json({ ok: true, message: "Passkey enrolled" });
});
passkeyRouter.delete("/passkeys/:id", requireOwner, async (req, res) => {
  await changeState(s => { s.passkeys = s.passkeys.filter(p => p.id !== req.params.id); s.sessions = s.sessions.filter(x => x.hash === res.locals.session.hash); });
  res.json({ ok: true, message: "Passkey removed; other sessions revoked" });
});
