import {Router} from "express";
import {randomBytes} from "node:crypto";
import {z} from "zod";
import {HttpError,expectedOrigin,requireOwner,verifyOrigin,hash} from "../vault/auth";
import {activeSession,identify} from "./auth";
import {accountBy,updateAccount,type Account} from "./store";
import {accountPage,bearer,controls,create,eligible,findPublic,issueApi,merchant,merchantUpdate,publicCheckout,record,setPaused,simulate,writable,securityRecord,recentSecurityAudit} from "./merchant";
import {attemptDelivery,httpsUrl,seal} from "./webhooks";
import {sharedBudget} from "./limits";
import {archivedCheckout} from "./archive";
const command=z.object({requestId:z.string().uuid().optional(),accountId:z.string().uuid().optional(),checkoutId:z.string().uuid().optional(),reason:z.string().trim().min(3).max(300).optional(),
  paused:z.boolean().optional(),amountSats:z.number().int().min(-1000000000).max(1000000000).optional(),
  returnUrls:z.array(z.string().max(1000)).max(5).optional(),webhookUrl:z.string().max(1000).optional()}).strict();
const checkoutInput=z.object({amount_sats:z.number().int().positive().max(10000000),reference:z.string().trim().min(1).max(100),return_url:z.string().max(1000)}).strict();
function fresh(at:number|undefined){if(!at||Date.now()-at>300000)throw new HttpError(403,"Confirm your passkey within five minutes before this action");}
function reason(value:string|undefined){if(!value)throw new HttpError(400,"A reason is required");return value;}
function revoke(a:Account){const m=merchant(a);delete m.apiKeyHash;delete m.apiKeyPrefix;delete m.apiKeyExpires;}
export const checkoutRouter=Router();
checkoutRouter.use((req,_res,next)=>{if(!/^\/(developer-console|admin\/developers|checkout|v1\/checkout)(\/|$)/.test(req.path)){next("router");return;}next();});
checkoutRouter.use((_req,res,next)=>{res.setHeader("Cache-Control","no-store");res.setHeader("Referrer-Policy","no-referrer");next();});
// Bounded per-process admission. Persisted per-account simulation quotas are separate.
checkoutRouter.get("/developer-console",async(req,res)=>{
  const{a}=await identify(req,true),m=merchant(a);
  res.json({accountId:a.id,status:m.status,paused:(await controls()).paused,returnUrls:m.returnUrls,webhookUrl:m.webhookUrl??null,
    apiKeyPrefix:m.apiKeyPrefix??null,liveApplication:m.liveApplication,liveEnabled:false,checkouts:m.checkouts.map(publicCheckout),
    deliveries:m.deliveries.map(({checkoutId,eventId,status,attempts,lastError})=>({checkoutId,eventId,status,attempts,lastError}))});
});
checkoutRouter.post("/developer-console/:action",verifyOrigin,async(req,res)=>{
  const {a,s}=await identify(req,true),b=command.parse(req.body),action=req.params.action;
  await sharedBudget("tenant-write",a.id,60,res);
  if(action==="issue-api-key")await sharedBudget("key-issuance",a.id,5,res);
  if(["simulate","create-preview"].includes(String(action)))await writable();
  let newSecret:string|undefined;
  if(action==="settings"&&b.webhookUrl&&(b.webhookUrl!==merchant(a).webhookUrl||b.reason==="rotate-webhook"))newSecret=randomBytes(32).toString("base64url");
  const encrypted=newSecret?seal(newSecret):undefined;
  const result=await updateAccount(a.id,async a=>{
    activeSession(a,s);eligible(a);const m=merchant(a);
    if(action==="settings"){
      if(!b.returnUrls)throw new HttpError(400,"Return URLs are required");
      for(const u of b.returnUrls)httpsUrl(u);
      if(b.webhookUrl)httpsUrl(b.webhookUrl);
      if(b.webhookUrl&&b.webhookUrl!==m.webhookUrl&&!encrypted)throw new HttpError(409,"Settings changed; retry explicitly");
      m.returnUrls=[...new Set(b.returnUrls)];
      if(b.webhookUrl){m.webhookUrl=b.webhookUrl;if(encrypted)m.webhookSecret=encrypted;}
      else {delete m.webhookUrl;delete m.webhookSecret;}
      record(m.audit,"settings","Checkout configuration updated","developer");
      return {ok:true,...(newSecret?{webhookSecret:newSecret}:{})};
    }
    if(action==="issue-api-key"){
      fresh(a.sessions.find(x=>x.hash===s.hash)?.passkeyAt);eligible(a,true);
      const key=issueApi(a);delete a.sessions.find(x=>x.hash===s.hash)!.passkeyAt;
      record(m.audit,"issue_api_key","Sandbox key replaced","developer");return {key};
    }
    if(action==="revoke-api-key"){revoke(a);record(m.audit,"revoke_api_key","Key revoked","developer");return {ok:true};}
    if(action==="apply-live"){m.liveApplication="pending";record(m.audit,"apply_live",reason(b.reason),"developer");return {ok:true};}
    if(action==="simulate"){if(!b.checkoutId)throw new HttpError(400,"Select a checkout");simulate(a,b.checkoutId);return {ok:true};}
    if(action==="create-preview"){
      const input=checkoutInput.parse({amount_sats:b.amountSats,reference:b.reason,return_url:b.returnUrls?.[0]});
      return {message:(await create(a,input,"preview:"+randomBytes(16).toString("hex"),expectedOrigin(req))).url};
    }
    if(action==="retry-webhook"){
      const d=m.deliveries.find(d=>d.checkoutId===b.checkoutId);
      if(!d)throw new HttpError(404,"Delivery not found");
      if(d.status==="delivered")return {ok:true};
      if(d.status==="sending"&&d.nextAt>Date.now())throw new HttpError(409,"Delivery is already in progress");
      d.attempts=0;d.nextAt=0;d.status="pending";record(m.audit,"retry_webhook",d.eventId,"developer");return {ok:true};
    }
    throw new HttpError(404,"Action not found");
  });
  res.json(result);
});
checkoutRouter.get("/admin/developers",requireOwner,async(req,res)=>{
  const after=z.string().uuid().optional().parse(req.query.after);
  const c=await controls();const page=await accountPage(after);
  const security=await recentSecurityAudit();
  res.json({paused:c.paused,audit:c.audit.slice(-100),nextCursor:page.nextCursor,signet:"paused",liveEnabled:false,stepUpRequired:!res.locals.session.passkeyAt||Date.now()-res.locals.session.passkeyAt>300000,
    accounts:page.accounts.map(a=>({...a,audit:[...a.audit,...(security.get(String(a.id))??[])].sort((a,b)=>a.at.localeCompare(b.at))}))});
});
checkoutRouter.post("/admin/developers/:action",verifyOrigin,requireOwner,async(req,res)=>{
  fresh(res.locals.session.passkeyAt);
  const b=command.parse(req.body),why=reason(b.reason),action=req.params.action,actor="owner";
  if(action==="pause"){if(typeof b.paused!=="boolean")throw new HttpError(400,"Select pause state");await setPaused(b.paused,why,actor);res.json({ok:true});return;}
  if(!b.accountId)throw new HttpError(400,"Select a developer");
  const emergency=action==="suspend"||action==="revoke";
  if(emergency){
    if(!await accountBy("id",b.accountId))throw new HttpError(404,"Developer not found");
    await securityRecord(b.accountId,String(action)+":requested",why);
  }
  await updateAccount(b.accountId,a=>{
    const m=merchant(a);
    const fingerprint=hash(JSON.stringify({action,reason:why,amountSats:b.amountSats}));
    if(action==="adjust"){
      if(!b.requestId)throw new HttpError(400,"Adjustment request ID required for safe reconciliation");
      const previous=m.audit.find(x=>x.requestId===b.requestId);
      if(previous){if(previous.fingerprint!==fingerprint)throw new HttpError(409,"Request ID reused for different adjustment");return;}
    }
    if(action==="activate")m.status="active";
    else if(action==="freeze")m.status="frozen";
    else if(action==="suspend"){m.status="suspended";a.sessions=[];revoke(a);}
    else if(action==="revoke"){revoke(a);a.sessions=[];}
    else if(action==="adjust"){
      if(!Number.isSafeInteger(b.amountSats)||b.amountSats===0)throw new HttpError(400,"Enter a nonzero integer simulated satoshi adjustment");
      const balance=a.balanceSats+b.amountSats!;
      if(balance<0||balance>100000000000)throw new HttpError(400,"Adjustment exceeds simulation balance limits");
      a.balanceSats=balance;
    }else if(action==="approve"||action==="reject"){
      if(m.liveApplication!=="pending")throw new HttpError(409,"No pending Live application");
      m.liveApplication=action==="approve"?"approved":"rejected";
    }else if(action==="retry-webhook"){
      const d=m.deliveries.find(d=>d.checkoutId===b.checkoutId);
      if(!d)throw new HttpError(404,"Delivery not found");
      if(d.status==="sending"&&d.nextAt>Date.now())throw new HttpError(409,"Delivery already in progress");
      if(d.status!=="delivered"){d.status="pending";d.attempts=0;d.nextAt=0;}
    }else throw new HttpError(404,"Action not found");
    if(!emergency)record(m.audit,String(action)+(action==="adjust"?":"+b.amountSats:""),why,actor);
    if(action==="adjust")Object.assign(m.audit[m.audit.length-1],{requestId:b.requestId,fingerprint});
  });
  if(emergency)await securityRecord(b.accountId,String(action)+":applied",why);
  res.json({ok:true,message:"Recorded. Live custody remains disabled."});
});
checkoutRouter.post("/v1/checkout/sessions",async(req,res)=>{
  const {a,keyHash}=await bearer(req.get("authorization")),b=checkoutInput.parse(req.body);
  await sharedBudget("checkout-create",a.id,60,res);
  await sharedBudget("api-key-create",keyHash,60,res);
  const idem=z.string().min(8).max(100).regex(/^[A-Za-z0-9_.:-]+$/).parse(req.get("idempotency-key"));
  await writable();
  res.json(await merchantUpdate(a.id,keyHash,a=>create(a,b,idem,expectedOrigin(req))));
});
checkoutRouter.get("/v1/checkout/sessions/:id",async(req,res)=>{
  const{a,keyHash}=await bearer(req.get("authorization"));
  await sharedBudget("api-key-read",keyHash,180,res);
  const c=merchant(a).checkouts.find(c=>c.id===req.params.id)??await archivedCheckout(a.id,"id",String(req.params.id));
  if(!c)throw new HttpError(404,"Checkout not found");res.json(publicCheckout(c));
});
checkoutRouter.get("/checkout/:token",async(req,res)=>res.json(publicCheckout((await findPublic(String(req.params.token))).c)));
checkoutRouter.post("/checkout/:token/check",verifyOrigin,async(req,res)=>res.json(publicCheckout((await findPublic(String(req.params.token))).c)));
