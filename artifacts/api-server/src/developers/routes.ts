import { Router } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { activeSession, cookieOptions, DEV_COOKIE, identify, issueSession, payload } from "./auth";
import { accountBy, audit, createAccount, updateAccount } from "./store";
import { credentialHash, equal, hash, HttpError, verifyOrigin } from "../vault/auth";
import { registrationOptions, registrationVerify, loginOptions, loginVerify } from "./passkeys";
import { sendSecurityMail, type SecuritySender } from "../vault/smtp";
import { getMarket } from "../vault/market";
import { destinationFor, execute, review, snapshot } from "./ledger";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";

const emailSchema=z.string().trim().email().max(254).transform(s=>s.toLowerCase());
const DRAFT = "Developer Sandbox preview terms\n\nThis workspace is a simulation for learning the interface. It does not hold Bitcoin, money or cash-valued Signet coins.\n\nKeep your login key and passkeys safe. Do not share credentials or use the service to harm others. Live access requires separate approval and readiness checks.\n\nWe use your name and email to create and verify your account. Necessary secure cookies keep you signed in. Optional tracking is off.\n\nThese are draft preview terms, not approved production terms. Production registration remains closed until approved terms and privacy disclosures are configured.";
export type DeveloperDependencies = { send?: SecuritySender; quote?: () => { available: boolean; stale: boolean; price: number | null; updatedAt: string | null; source: string } };
export function developerRouter(deps: DeveloperDependencies = {}) {
  const router=Router();
  const limits=new Map<string,{count:number,until:number}>();
  const terms=()=> {
    const approved=!!process.env.DEVELOPER_TERMS_VERSION && !!process.env.DEVELOPER_TERMS_TEXT;
    return {version: approved ? process.env.DEVELOPER_TERMS_VERSION! : "preview-draft-1",
      text: approved ? process.env.DEVELOPER_TERMS_TEXT! : DRAFT, approved,
      signupEnabled: process.env.NODE_ENV!=="production" || approved};
  };
  router.use((_req,res,next)=>{res.set("Cache-Control","no-store");next();});
  router.use(verifyOrigin);
  router.use((req,_res,next)=>{
    if(req.method==="POST") {
      const now=Date.now();
      for(const [k,v] of limits) if(v.until<now) limits.delete(k);
      for(const key of ["global",`ip:${req.ip}`]) {
        const l=limits.get(key)??{count:0,until:now+60000};l.count++;limits.set(key,l);
        if(l.count>(key==="global"?240:60)) throw new HttpError(429,"Too many attempts; wait one minute");
      }
    }
    next();
  });
  router.get("/session",async(req,res)=>{
    try {const {a,s}=await identify(req);res.json({...payload(a,s),terms:terms()});}
    catch(e){if(e instanceof HttpError && e.status===401) res.json({authenticated:false,terms:terms()});else throw e;}
  });
  router.get("/sandbox",async(req,res)=>{
    const {a,s}=await identify(req,true);
    const q=(deps.quote??getMarket)(), at=Date.parse(q.updatedAt??"");
    const fresh=q.available && !q.stale && q.price && Number.isFinite(at) && Date.now()-at<=180000 && at<=Date.now()+30000;
    const priceCents=fresh?Math.round(q.price!*100):0;
    const amountCents=Number.isSafeInteger(priceCents)&&priceCents>0
      ? Number(BigInt(a.balanceSats)*BigInt(priceCents)/100000000n) : NaN;
    const currentValuation=Number.isSafeInteger(amountCents)&&amountCents>=0
      ? {amountCents,at:q.updatedAt!,source:q.source} : null;
    res.json({...snapshot(a,s),currentValuation});
  });
  router.get("/sandbox/address",async(req,res)=>{
    const {a,s}=await identify(req,true); snapshot(a,s);
    if(req.query.destination!==destinationFor(a)) throw new HttpError(400,"Only your assigned Sandbox identifier can be checked");
    res.json({destination:destinationFor(a),environment:"simulation",simulatedCreditCents:snapshot(a,s).simulatedCreditCents,
      transactionCount:a.transactions.length,transactions:a.transactions.slice(0,10),checkedAt:new Date().toISOString()});
  });
  async function sendVerification(id:string) {
    const key=randomBytes(18).toString("base64url");
    const a=await updateAccount(id,a=>{
      if(a.verified && a.passkeys.length) return null;
      if(a.verification && Date.now()-a.verification.sentAt<60000) throw new HttpError(429,"Wait one minute before requesting another email");
      a.verification={hash:hash(key),expires:Date.now()+15*60000,sentAt:Date.now(),attempts:0,delivery:"pending"};
      return a;
    });
    if(!a) return;
    try {
      const from=process.env.DEVELOPER_MAIL_FROM || process.env.SECURITY_ALERT_FROM;
      if(!from && !deps.send) throw new Error("Mail sender unavailable");
      const result=await (deps.send??sendSecurityMail)({from:from??"fixture@example.invalid",to:a.email,
        subject:"Verify your main_vault developer email",text:`Your one-time verification key:\n\n${key}\n\nPaste all 24 characters into the verification field. It expires in 15 minutes. Check Inbox, Spam and Junk if you request a replacement. Never share this key.`,
        messageId:`<${randomUUID()}@mainvaultwallet.com>`,date:new Date()});
      if(result.rejected.length || !result.accepted.length) throw new Error("Mail rejected");
      await updateAccount(id,a=>{if(a.verification?.hash===hash(key))a.verification.delivery="sent";});
    }catch {
      await updateAccount(id,a=>{if(a.verification?.hash===hash(key))a.verification.delivery="failed";});
      throw new HttpError(503,"Verification email could not be delivered. Retry after one minute; your account has not been activated.");
    }
  }
  router.post("/:action",async(req,res)=>{
    const action=req.params.action;
    if(action==="register" || action==="resend") {
      const t=terms(); if(!t.signupEnabled) throw new HttpError(503,"Developer registration awaits approved terms and privacy disclosures");
      const input=action==="register" ? z.object({name:z.string().trim().min(1).max(80),email:emailSchema,termsVersion:z.literal(t.version),accepted:z.literal(true)}).strict().parse(req.body)
        : z.object({email:emailSchema}).strict().parse(req.body);
      let a=await accountBy("email",input.email);
      if(!a && "name" in input && typeof input.name==="string") a=await createAccount(input.name,input.email,t.version);
      if(a && !a.passkeys.length) await sendVerification(a.id);
      res.json({ok:true,message:"If eligible, a verification email has been sent. Check Inbox, Spam and Junk."});return;
    }
    if(action==="verify-email") {
      const b=z.object({email:emailSchema,key:z.string().regex(/^[A-Za-z0-9_-]{24}$/)}).strict().parse(req.body);
      const a=await accountBy("email",b.email);
      if(!a) throw new HttpError(400,"Verification key invalid or expired");
      const valid=await updateAccount(a.id,a=>{
        const v=a.verification;
        if(!v || a.passkeys.length || v.expires<=Date.now() || v.attempts>=5) return false;
        v.attempts++;
        if(!equal(v.hash,hash(b.key)))return false;
        a.verified=true;delete a.verification;a.sessions=[];audit(a,"email_verified");return true;
      });
      if(!valid) throw new HttpError(400,"Verification key invalid or expired");
      res.json(payload((await accountBy("id",a.id))!,await issueSession(res,a.id,"onboarding")));return;
    }
    if(action==="passkey-register-options"){z.object({}).strict().parse(req.body);res.json(await registrationOptions(req,res));return;}
    if(action==="passkey-register-verify"){
      const b=z.object({response:z.record(z.string(),z.unknown())}).strict().parse(req.body);
      res.json(await registrationVerify(req,res,b.response as unknown as RegistrationResponseJSON));return;
    }
    if(action==="passkey-login-options"){
      const b=z.object({email:emailSchema}).strict().parse(req.body);res.json(await loginOptions(req,res,b.email));return;
    }
    if(action==="passkey-login-verify"){
      const b=z.object({response:z.record(z.string(),z.unknown())}).strict().parse(req.body);
      res.json(await loginVerify(req,res,b.response as unknown as AuthenticationResponseJSON));return;
    }
    if(action==="login"){
      const b=z.object({email:emailSchema,key:z.string().length(86)}).strict().parse(req.body);
      let verifier:string;
      try {verifier=credentialHash(b.key);} catch {throw new HttpError(401,"Developer sign in failed");}
      const a=await accountBy("email",b.email);
      if(!a?.verified || !a.passkeys.length || !a.keyHash || !equal(a.keyHash,verifier)) throw new HttpError(401,"Developer sign in failed");
      res.json(payload(a,await issueSession(res,a.id,"full",false,a.keyHash)));return;
    }
    const {a,s}=await identify(req,true);
    if(action==="logout"){
      z.object({}).strict().parse(req.body);
      await updateAccount(a.id,a=>{a.sessions=a.sessions.filter(x=>x.hash!==s.hash);});
      res.clearCookie(DEV_COOKIE,cookieOptions);res.json({ok:true});return;
    }
    if(action==="provision"){
      z.object({}).strict().parse(req.body);
      const q=(deps.quote??getMarket)();
      const at=Date.parse(q.updatedAt??"");
      if(a.provisioning!=="ready" && (!q.available||q.stale||!q.price||!Number.isFinite(at)||Date.now()-at>180000||at>Date.now()+30000))
        throw new HttpError(503,"A fresh BTC/USD quote is unavailable. Provisioning is waiting; no simulated Bitcoin amount has been invented.");
      await updateAccount(a.id,a=>{
        activeSession(a,s);
        if(a.provisioning==="ready")return;
        const priceCents=Math.round(q.price!*100);
        if(!Number.isSafeInteger(priceCents)||priceCents<=0)throw new HttpError(503,"Invalid price quote");
        a.quote={priceCents,at:q.updatedAt!,source:q.source};
        a.balanceSats=Number(300000n*100000000n/BigInt(priceCents));
        if(!Number.isSafeInteger(a.balanceSats)||a.balanceSats<=0)throw new HttpError(503,"Quote cannot provision a balance");
        a.provisioning="ready";audit(a,"simulation_provisioned");
      });
      res.json(payload((await accountBy("id",a.id))!,s));return;
    }
    if(action==="issue-key" || action==="rotate-key"){
      z.object({}).strict().parse(req.body);
      const key=randomBytes(64).toString("base64url");
      await updateAccount(a.id,a=>{
        const current=a.sessions.find(x=>x.hash===s.hash && x.expires>Date.now());
        if(!current?.passkeyAt || Date.now()-current.passkeyAt>300000)throw new HttpError(403,"Sign in with your passkey again before generating a key");
        if(a.provisioning!=="ready")throw new HttpError(409,"Finish provisioning first");
        if(action==="issue-key" && a.keyHash)throw new HttpError(409,"Key already issued. Use passkey sign in to replace it if the response was lost");
        a.keyHash=credentialHash(key);a.sessions=[current];delete current.passkeyAt;
        audit(a,action==="issue-key"?"login_key_issued":"login_key_rotated");
      });
      res.json({key,message:"Save this key now. It will not be shown again. Previous keys are invalid."});return;
    }
    if(action==="review"){
      const b=z.object({destination:z.string().max(100),amountCents:z.number().int().positive().max(300000)}).strict().parse(req.body);
      res.json(await updateAccount(a.id,a=>{activeSession(a,s);return review(a,s,b.amountCents,b.destination);}));return;
    }
    if(action==="pay"){
      const b=z.object({reviewId:z.string().uuid(),confirmed:z.literal(true)}).strict().parse(req.body);
      res.json(await updateAccount(a.id,a=>{activeSession(a,s);return execute(a,s,b.reviewId,b.confirmed);}));return;
    }
    throw new HttpError(404,"Developer action not found");
  });
  return router;
}
