import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { generateRegistrationOptions, generateAuthenticationOptions, verifyRegistrationResponse, verifyAuthenticationResponse,
  type RegistrationResponseJSON, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { cookie, expectedOrigin, hash, HttpError } from "../lib/security";
import { initializeMetadata, query } from "./storage";
import { accountBy, audit, updateAccount } from "./store";
import { activeSession, cookieOptions, identify, issueSession, payload } from "./auth";

const CHALLENGE = "__Host-developer_challenge";
async function remember(res: Response, data: object) {
  await initializeMetadata();
  await query("DELETE FROM developer_challenges WHERE expires < ?", [Date.now()]);
  const token = randomBytes(32).toString("base64url");
  await query("INSERT INTO developer_challenges(id,expires,data) VALUES(?,?,?)", [hash(token), Date.now()+120000, JSON.stringify(data)]);
  res.cookie(CHALLENGE, token, { ...cookieOptions, maxAge: 120000 });
}
async function consume(req: Request, res: Response, kind: string) {
  const token = cookie(req, CHALLENGE) ?? "";
  const rows = await query("DELETE FROM developer_challenges WHERE id=? RETURNING data,expires", [hash(token)]);
  res.clearCookie(CHALLENGE, cookieOptions);
  if (!rows[0] || Number(rows[0].expires) <= Date.now()) throw new HttpError(400, "Passkey challenge expired; try again");
  const c = JSON.parse(String(rows[0].data)) as { kind: string; challenge: string; account?: string; session?: string };
  if (c.kind !== kind) throw new HttpError(400, "Passkey challenge mismatch");
  return c;
}
export async function registrationOptions(req: Request, res: Response) {
  const { a, s } = await identify(req);
  if (!a.verified) throw new HttpError(403, "Verify your email first");
  if (a.passkeys.length) throw new HttpError(409, "A passkey is already enrolled; use passkey sign in");
  const options = await generateRegistrationOptions({ rpName: "main_vault Developers",
    rpID: new URL(expectedOrigin(req)).hostname, userName: a.email,
    userID: new TextEncoder().encode(`developer:${a.id}`), attestationType: "none",
    authenticatorSelection: { residentKey: "required", userVerification: "required" } });
  await remember(res, { kind: "register", challenge: options.challenge, account: a.id, session: s.hash });
  return options;
}
export async function registrationVerify(req: Request, res: Response, response: RegistrationResponseJSON) {
  const { a, s } = await identify(req);
  const c = await consume(req,res,"register");
  if (c.account !== a.id || c.session !== s.hash) throw new HttpError(403,"Passkey account mismatch");
  const v = await verifyRegistrationResponse({ response, expectedChallenge: c.challenge,
    expectedOrigin: expectedOrigin(req), expectedRPID: new URL(expectedOrigin(req)).hostname, requireUserVerification: true });
  if (!v.verified || !v.registrationInfo) throw new HttpError(400,"Passkey verification failed");
  const credential = v.registrationInfo.credential;
  await updateAccount(a.id, a => {
    activeSession(a,s);
    if (!a.verified || a.passkeys.length) throw new HttpError(409,"Enrollment already completed");
    a.passkeys.push({ id: credential.id, name: "Developer passkey", createdAt: new Date().toISOString(),
      publicKey: Buffer.from(credential.publicKey).toString("base64url"), counter: credential.counter, transports: credential.transports });
    a.sessions = [];
    audit(a, "passkey_enrolled");
  });
  const session = await issueSession(res,a.id,"full",true);
  return payload((await accountBy("id",a.id))!, session);
}
export async function loginOptions(req: Request, res: Response, email: string) {
  const a = await accountBy("email", email);
  const options = await generateAuthenticationOptions({ rpID: new URL(expectedOrigin(req)).hostname,
    userVerification: "required", allowCredentials: [] });
  await remember(res, { kind: "login", challenge: options.challenge, account: a?.id });
  return options;
}
export async function loginVerify(req: Request, res: Response, response: AuthenticationResponseJSON) {
  const c = await consume(req,res,"login");
  const a = c.account ? await accountBy("id",c.account) : undefined;
  const p = a?.passkeys.find(p => p.id === response.id);
  if (!a?.verified || !p) throw new HttpError(401,"Passkey sign in failed");
  const v = await verifyAuthenticationResponse({ response, expectedChallenge: c.challenge,
    expectedOrigin: expectedOrigin(req), expectedRPID: new URL(expectedOrigin(req)).hostname, requireUserVerification: true,
    credential: { id: p.id, publicKey: Buffer.from(p.publicKey,"base64url"), counter:p.counter, transports:p.transports } });
  if (!v.verified) throw new HttpError(401,"Passkey sign in failed");
  await updateAccount(a.id, a => {
    const current = a.passkeys.find(x=>x.id===p.id);
    if (!current || current.counter!==p.counter) throw new HttpError(409,"Passkey changed; retry");
    current.counter=v.authenticationInfo.newCounter;
    audit(a,"passkey_login");
  });
  return payload((await accountBy("id",a.id))!,await issueSession(res,a.id,"full",true));
}
