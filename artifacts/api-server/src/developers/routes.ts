import { Router } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { activeSession, cookieOptions, DEV_COOKIE, identify, issueSession, payload } from "./auth";
import { accountBy, audit, createAccount, updateAccount } from "./store";
import { credentialHash, equal, hash, HttpError, verifyOrigin } from "../lib/security";
import { registrationOptions, registrationVerify, loginOptions, loginVerify } from "./passkeys";
import { sendSecurityMail, smtpOptions, type SecuritySender } from "../vault/smtp";
import { classifyMailError, type MailError } from "./mail-diagnostics";
import { destinationFor, execute, review, snapshot } from "./ledger";
import { eligible, parseCheckoutDestination, writable } from "./merchant";
import { checkoutInfo, lookupCheckoutTarget, resumeSettlements, reviewCheckout, settle } from "./settlement";
import {sharedBudget} from "./limits";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { developerTerms } from "./terms";

const emailSchema=z.string().trim().email().max(254).transform(s=>s.toLowerCase());
export type DeveloperDependencies = { send?: SecuritySender; quote?: () => { available: boolean; stale: boolean; price: number | null; updatedAt: string | null; source: string } };
export function developerRouter(deps: DeveloperDependencies = {}) {
  if(process.env.FOUNDATION_LOCAL==="1"&&(!deps.quote||!deps.send))throw Error("Independent developer runtime requires explicit mail and quote providers");
  const quote=async()=>deps.quote?deps.quote():(await import("../vault/market")).getMarket();
  const router=Router();
  const limits=new Map<string,{count:number,until:number}>();
  const terms=developerTerms;
  // This router is also mounted outside app.ts by independent runtimes.
  // The crawlable anonymous session/terms response must remain non-indexable.
  router.use((_req,res,next)=>{res.set("Cache-Control","no-store");res.set("X-Robots-Tag","noindex, nofollow, noarchive");next();});
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
    let {a,s}=await identify(req,true);
    // Complete any transfer interrupted after its debit before showing balances.
    if(a.settlements?.some(x=>x.state==="debited")){await resumeSettlements(a.id);a=(await accountBy("id",a.id))??a;}
    const q=await quote(), at=Date.parse(q.updatedAt??"");
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
    const destination=typeof req.query.destination==="string"?req.query.destination:"";
    if(destination.length<=100&&parseCheckoutDestination(destination)){
      // A hosted checkout destination: show what will be paid, never the merchant's balance or identity.
      const target=await lookupCheckoutTarget(destination);
      res.json({destination,environment:"simulation",simulatedCreditCents:0,transactionCount:0,transactions:[],checkedAt:new Date().toISOString(),
        kind:"checkout",checkout:checkoutInfo(a,target)});return;
    }
    if(destination!==destinationFor(a)) throw new HttpError(400,"Enter your assigned Sandbox identifier or a hosted checkout destination (checkout:…)");
    res.json({destination:destinationFor(a),environment:"simulation",simulatedCreditCents:snapshot(a,s).simulatedCreditCents,
      transactionCount:a.transactions.length,transactions:a.transactions.slice(0,10),checkedAt:new Date().toISOString(),kind:"wallet"});
  });
  async function sendVerification(id:string) {
    const key=randomBytes(18).toString("base64url");
    const correlationId=randomUUID();
    const a=await updateAccount(id,a=>{
      if(a.verified && a.passkeys.length) return null;
      if(a.verification && Date.now()-a.verification.sentAt<60000) throw new HttpError(429,"Wait one minute before requesting another email");
      a.verification={hash:hash(key),expires:Date.now()+15*60000,sentAt:Date.now(),attempts:0,delivery:"pending",
        diagnostic:{correlationId,attemptedAt:new Date().toISOString(),completedAt:null,status:"pending",error:null}};
      return a;
    });
    if(!a) return;
    let failure: MailError | undefined;
    try {
      const from=process.env.DEVELOPER_MAIL_FROM || process.env.SECURITY_ALERT_FROM;
      if(!deps.send) {
        try {
          if(!from || from.length>254 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)) throw new Error("Invalid sender");
          smtpOptions();
        } catch { failure="configuration"; throw new Error("Mail configuration unavailable"); }
      }
      const result=await (deps.send??sendSecurityMail)({from:from??"fixture@example.invalid",to:a.email,
        subject:"Verify your main_vault developer email",text:`Your one-time verification key:\n\n${key}\n\nPaste all 24 characters into the verification field. It expires in 15 minutes. Check Inbox, Spam and Junk if you request a replacement. Never share this key.`,
        messageId:`<${correlationId}@mainvaultwallet.com>`,date:new Date()});
      if(result.rejected.length || !result.accepted.length) {failure="rejected";throw new Error("Mail rejected");}
      await updateAccount(id,a=>{if(a.verification?.diagnostic?.correlationId===correlationId){
        a.verification.delivery="sent";Object.assign(a.verification.diagnostic,{status:"sent",completedAt:new Date().toISOString()});
      }});
    }catch(error) {
      await updateAccount(id,a=>{if(a.verification?.diagnostic?.correlationId===correlationId){
        a.verification.delivery="failed";Object.assign(a.verification.diagnostic,{status:"failed",completedAt:new Date().toISOString(),error:failure??classifyMailError(error)});
      }});
      throw new HttpError(503,"Verification email could not be delivered. Retry after one minute; your account has not been activated.");
    }
  }
  router.post("/:action",async(req,res)=>{
    const action=req.params.action;
    if(action==="register" || action==="resend") {
      const t=terms(); if(!t.signupEnabled) throw new HttpError(503,"Developer registration is temporarily closed");
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
    if(action!=="logout")await sharedBudget("developer-operations",a.id,60,res);
    if(action==="logout"){
      z.object({}).strict().parse(req.body);
      await updateAccount(a.id,a=>{a.sessions=a.sessions.filter(x=>x.hash!==s.hash);});
      res.clearCookie(DEV_COOKIE,cookieOptions);res.json({ok:true});return;
    }
    if(action==="provision"){
      z.object({}).strict().parse(req.body);
      const q=await quote();
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
      await writable();
      const b=z.object({destination:z.string().max(100),amountCents:z.number().int().positive().max(300000)}).strict().parse(req.body);
      if(parseCheckoutDestination(b.destination)){
        const target=await lookupCheckoutTarget(b.destination);
        res.json(await updateAccount(a.id,a=>{activeSession(a,s);eligible(a,true);return reviewCheckout(a,s,b.amountCents,target);}));return;
      }
      res.json(await updateAccount(a.id,a=>{activeSession(a,s);eligible(a,true);return review(a,s,b.amountCents,b.destination);}));return;
    }
    if(action==="pay"){
      await writable();
      const b=z.object({reviewId:z.string().uuid(),confirmed:z.literal(true)}).strict().parse(req.body);
      if(a.reviews.some(r=>r.id===b.reviewId&&r.sessionHash===s.hash&&r.checkout)){
        res.json(await settle(a.id,s,b.reviewId,b.confirmed,a=>activeSession(a,s)));return;
      }
      res.json(await updateAccount(a.id,a=>{activeSession(a,s);eligible(a,true);return execute(a,s,b.reviewId,b.confirmed);}));return;
    }
    throw new HttpError(404,"Developer action not found");
  });
  return router;
}
