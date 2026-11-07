// Loopback-only disposable acceptance server. No production auth bypass exists.
import { mkdtempSync, writeFileSync, readFileSync, rmSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(new URL("../artifacts/api-server/package.json",import.meta.url));
const express = require("express");
if(process.env.VAULT_UI_FIXTURE!=="1")throw new Error("Requires VAULT_UI_FIXTURE=1");
const tls=process.env.VAULT_UI_FIXTURE_HTTPS==="1";
const adminFixture=process.env.VAULT_UI_ADMIN_FIXTURE==="1";
const staticDir=process.env.VAULT_UI_FIXTURE_STATIC_DIR;
const adminTest=process.env.VAULT_UI_FIXTURE_ADMIN==="1";
const origin=tls?"https://localhost:4443":"http://localhost:4400";
for(const key of Object.keys(process.env))if(!["PATH","HOME","TMPDIR"].includes(key))delete process.env[key];
const dir=mkdtempSync(join(tmpdir(),"developer-ui-isolated-"));
const secret=randomBytes(64);
// Display the Live mainnet boundary only: all engine/monitor credentials were removed above.
// There is no RPC or signer transport in this disposable process.
Object.assign(process.env,{NODE_ENV:"development",BITCOIN_NETWORK:"main",ALLOW_MAINNET:"true",
  SESSION_SECRET:randomBytes(48).toString("base64url"),
  VAULT_DATA_DIR:dir,PUBLIC_ORIGIN:origin,
  VAULT_OWNER_VERIFIER:createHash("sha256").update(secret).digest("hex"),
  VAULT_STATIC_DIR:staticDir??fileURLToPath(new URL("../artifacts/bitcoin-vault/dist/public",import.meta.url))});
writeFileSync(join(dir,"disposable-owner.txt"),secret.toString("base64url"),{mode:0o600});
if(adminFixture){
  process.env.PLATFORM_ADMIN_EMAIL="admin@example.test";
  process.env.PLATFORM_ADMIN_PASSWORD=randomBytes(32).toString("base64url");
  writeFileSync(join(dir,"disposable-admin.json"),JSON.stringify({email:process.env.PLATFORM_ADMIN_EMAIL,password:process.env.PLATFORM_ADMIN_PASSWORD}),{mode:0o600});
}
const {developerRouter}=await import("../artifacts/api-server/src/developers/routes.ts");
const {default:main}=await import("../artifacts/api-server/src/app.ts");
const {accountBy,updateAccount,createAccount}=await import("../artifacts/api-server/src/developers/store.ts");
const {changeState}=await import("../artifacts/api-server/src/vault/store.ts");
const {merchant,issueApi}=await import("../artifacts/api-server/src/developers/merchant.ts");
const fixtureRunId=randomUUID();
const seeded: {id:string;email:string}[]=[];
if(adminTest){
  for(const name of ["Approval","Rejection","Suspension","Revocation","Adjustment"]){
    const email=`${name.toLowerCase()}-${fixtureRunId}@example.invalid`;
    const a=(await createAccount(`Disposable ${name}`,email,"fixture"))!;
    await updateAccount(a.id,a=>{
      a.verified=true;a.provisioning="ready";a.balanceSats=10000;
      a.sessions=[{hash:randomBytes(32).toString("hex"),csrf:"fixture-only",expires:Date.now()+1800000,level:"full"}];
      a.keyHash=randomBytes(32).toString("hex");
      merchant(a).liveApplication="pending";issueApi(a);
    });
    seeded.push({id:a.id,email});
  }
}
const messages:Record<string,string>={};
const control={quoteAvailable:true,mailAvailable:true};
const app=express();app.use(express.json());
let loseAdjustmentResponse=false;
app.use((req,res,next)=>{
  res.setHeader("X-Developer-Fixture",fixtureRunId);
  if(adminTest&&req.method==="POST"&&req.path.startsWith("/api/admin/developers/")){
    const end=res.end;
    res.end=function(...args:Parameters<typeof end>){
      appendFileSync(join(dir,"admin-evidence.jsonl"),JSON.stringify({path:req.path,status:res.statusCode,body:req.body,fixtureRunId})+"\n",{mode:0o600});
      if(loseAdjustmentResponse&&req.path.endsWith("/adjust")&&res.statusCode===200){
        loseAdjustmentResponse=false;
        writeFileSync(join(dir,"lost-response.json"),JSON.stringify({phase:"after-commit",body:req.body,fixtureRunId}),{mode:0o600});
        res.flushHeaders();res.write("{");setImmediate(()=>res.destroy());return res;
      }
      return Reflect.apply(end,this,args);
    } as typeof end;
  }
  next();
});
app.get("/__admin-fixture",async(_req,res)=>{
  if(!adminTest){res.sendStatus(404);return;}
  const accounts=await Promise.all(seeded.map(async s=>{
    const a=(await accountBy("id",s.id))!;
    return {...s,balanceSats:a.balanceSats,status:a.merchant?.status,liveApplication:a.merchant?.liveApplication,
      sessions:a.sessions.length,hasLoginKey:!!a.keyHash,hasApiKey:!!a.merchant?.apiKeyHash,audit:a.merchant?.audit};
  }));
  res.json({fixtureRunId,disposable:true,accounts,evidenceDir:dir});
});
app.post("/__admin-fixture",async(req,res)=>{
  if(!adminTest){res.sendStatus(404);return;}
  if(req.body.expireStepUp)await changeState(s=>{s.sessions.forEach(x=>{x.passkeyAt=Date.now()-300001;});});
  if(req.body.loseAdjustmentResponse)loseAdjustmentResponse=true;
  res.json({fixtureRunId,ok:true});
});
app.get("/__developer-fixture",(_req,res)=>res.json({messages,...control,ownerCredentialFile:join(dir,"disposable-owner.txt")}));
app.post("/__developer-fixture",async(req,res)=>{
  if(typeof req.body.quoteAvailable==="boolean")control.quoteAvailable=req.body.quoteAvailable;
  if(typeof req.body.mailAvailable==="boolean")control.mailAvailable=req.body.mailAvailable;
  const a=typeof req.body.email==="string"?await accountBy("email",req.body.email):undefined;
  if(a)await updateAccount(a.id,a=>{
    if(req.body.expireSession)a.sessions.forEach(s=>s.expires=0);
    if(req.body.expireReviews)a.reviews.forEach(r=>r.expiresAt=new Date(0).toISOString());
    if(req.body.allowResend && a.verification)a.verification.sentAt=0;
  });
  res.json({ok:true});
});
app.use("/api/developers",developerRouter({
  send:async m=>{if(!control.mailAvailable)throw new Error("Fixture mail unavailable");messages[m.to]=m.text.match(/\n\n([A-Za-z0-9_-]{24})\n\n/)![1];return {accepted:[m.to],rejected:[],response:"local mail sink"};},
  quote:()=>({available:control.quoteAvailable,stale:!control.quoteAvailable,price:100000,updatedAt:new Date().toISOString(),source:"Disposable fixture quote; not live market data"}),
}));
app.use(main);
let server;
if(tls){
  execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-days","1",
    "-subj","/CN=localhost","-addext","subjectAltName=DNS:localhost,IP:127.0.0.1",
    "-keyout",join(dir,"tls.key"),"-out",join(dir,"tls.crt")],{stdio:"ignore"});
  server=createServer({key:readFileSync(join(dir,"tls.key")),cert:readFileSync(join(dir,"tls.crt"))},app);
}else{server=(await import("node:http")).createServer(app);}
server.listen(tls?4443:4400,"127.0.0.1",()=>console.log(`Disposable developer fixture: ${origin}; local mailbox /__developer-fixture`));
for(const signal of ["SIGINT","SIGTERM"] as const)process.once(signal,()=>server.close(()=>{rmSync(dir,{recursive:true,force:true});process.exit(0);}));
