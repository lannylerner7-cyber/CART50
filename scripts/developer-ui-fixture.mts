// Loopback-only disposable acceptance server. No production auth bypass exists.
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(new URL("../artifacts/api-server/package.json",import.meta.url));
const express = require("express");
if(process.env.VAULT_UI_FIXTURE!=="1")throw new Error("Requires VAULT_UI_FIXTURE=1");
for(const key of Object.keys(process.env))if(/^(CF_|VAULT_|MAINNET_|SANDBOX_|MARKET_|SMTP_|DEVELOPER_)/.test(key))delete process.env[key];
const dir=mkdtempSync(join(tmpdir(),"developer-ui-isolated-"));
const secret=randomBytes(64);
// Display the Live mainnet boundary only: all engine/monitor credentials were removed above.
// There is no RPC or signer transport in this disposable process.
Object.assign(process.env,{NODE_ENV:"development",BITCOIN_NETWORK:"main",ALLOW_MAINNET:"true",
  SESSION_SECRET:randomBytes(48).toString("base64url"),
  VAULT_DATA_DIR:dir,PUBLIC_ORIGIN:"http://localhost:4400",
  VAULT_OWNER_VERIFIER:createHash("sha256").update(secret).digest("hex"),
  VAULT_STATIC_DIR:fileURLToPath(new URL("../artifacts/bitcoin-vault/dist/public",import.meta.url))});
writeFileSync(join(dir,"disposable-owner.txt"),secret.toString("base64url"),{mode:0o600});
const {developerRouter}=await import("../artifacts/api-server/src/developers/routes.ts");
const {default:main}=await import("../artifacts/api-server/src/app.ts");
const {accountBy,updateAccount}=await import("../artifacts/api-server/src/developers/store.ts");
const messages:Record<string,string>={};
const control={quoteAvailable:true,mailAvailable:true};
const app=express();app.use(express.json());
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
const server=app.listen(4400,"127.0.0.1",()=>console.log("Disposable developer fixture: http://localhost:4400; local mailbox /__developer-fixture"));
for(const signal of ["SIGINT","SIGTERM"] as const)process.once(signal,()=>server.close(()=>{rmSync(dir,{recursive:true,force:true});process.exit(0);}));
