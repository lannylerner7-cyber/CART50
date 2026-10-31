// Disposable, opt-in independent developer service. Never imports the owner app.
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, unlinkSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ServerResponse } from "node:http";
if(process.env.FOUNDATION_LOCAL!=="1")throw Error("Requires FOUNDATION_LOCAL=1");
// Discard inherited credentials, not just their values in logging.
for(const k of Object.keys(process.env))if(!["PATH","HOME","TMPDIR","FOUNDATION_LOCAL"].includes(k))delete process.env[k];
process.env.NODE_ENV="development";
process.env.PUBLIC_ORIGIN="http://127.0.0.1:4401";
const {assertIsolatedEnvironment,foundationStatic}=await import("../artifacts/api-server/src/wallet-foundation/service");
assertIsolatedEnvironment();
const {Ledger}=await import("../artifacts/api-server/src/wallet-foundation/ledger");
const dir=mkdtempSync(join(tmpdir(),"foundation-local-")),ledger=new Ledger(join(dir,"developer-ledger.sqlite"));
const {localDeveloperStorage}=await import("../artifacts/api-server/src/developers/local-storage");
const {independentDeveloperRuntime}=await import("../artifacts/api-server/src/wallet-foundation/runtime");
const metadata=localDeveloperStorage(join(dir,"developer-metadata.sqlite"));
const access=[],credentials:Record<string,string>={};
const tenants={a:randomUUID(),b:randomUUID()};
await metadata.initialize();
for(const [name,tenant,role]of [["developerA",tenants.a,"developer"],["developerB",tenants.b,"developer"],["adminA",tenants.a,"admin"]] as const){
  const token=randomBytes(32).toString("base64url");credentials[name]=token;
  if(role==="admin")access.push({tokenHash:createHash("sha256").update(token).digest("hex"),principal:{tenant,role,scopes:["wallet:read"]},expires:Date.now()+1800000});
  else{
    credentials[name]=`wv_test_${tenant}.${token}`;
    const account={id:tenant,email:`${name}@example.invalid`,name,createdAt:new Date().toISOString(),acceptedAt:new Date().toISOString(),termsVersion:"local-fixture",verified:true,passkeys:[{id:randomUUID(),name:"Disposable fixture marker, not an authenticator",createdAt:new Date().toISOString(),publicKey:"",counter:0}],sessions:[],provisioning:"ready",balanceSats:0,reviews:[],transactions:[],audit:[],walletApiKey:{hash:createHash("sha256").update(token).digest("hex"),scopes:["wallet:read","wallet:write","wallet:simulate","wallet:fees"],expiresAt:Date.now()+1800000,version:1}};
    await metadata.query("INSERT INTO developer_accounts(id,email,version,data) VALUES(?,?,0,?)",[tenant,account.email,JSON.stringify(account)]);
    const epoch=ledger.beginCredentialChange(tenant);
    ledger.activateCredential(tenant,epoch,account.walletApiKey.hash,account.walletApiKey.expiresAt,account.walletApiKey.scopes);
  }
}
const credentialPath=join(dir,"local-credentials.json");writeFileSync(credentialPath,JSON.stringify(credentials),{mode:0o600});
const app=independentDeveloperRuntime({ledger,storage:metadata,adminAccess:access,env:process.env,providers:{
  quote:()=>({available:true,stale:false,price:100000,updatedAt:new Date().toISOString(),source:"Disposable fixture quote"}),
  send:async message=>{
    writeFileSync(join(dir,"fixture-email.json"),JSON.stringify(message),{mode:0o600});
    return {accepted:[message.to],rejected:[],response:"Local capture only"};
  }
}});
const staticDir=fileURLToPath(new URL("../artifacts/bitcoin-vault/dist/public",import.meta.url));
app.use(foundationStatic(staticDir));
app.get(/^\/developers(?:\/.*)?$/,(_req,res)=>res.sendFile(join(staticDir,"index.html")));
// A public, non-secret fingerprint proves that browser requests reached THIS
// disposable process rather than the normal preview. Never put credentials here.
const fixtureRunId=randomUUID();
app.get("/__foundation-fixture",(_req,res)=>res.json({fixtureRunId,disposable:true}));
const server=createServer((req,res)=>{
  res.setHeader("X-Foundation-Fixture",fixtureRunId);
  // Test-only, filesystem-armed post-commit response loss. No fault endpoint is
  // mounted in any application. This avoids unreliable browser route.fetch().
  const end=res.end;
  res.end=function(this:ServerResponse,...args:unknown[]){
    const body=(req as typeof req & {body?:{action?:string;data?:{id?:string;state?:string}}}).body;
    if(req.method==="POST"&&req.url==="/api/wallet-foundation/commands"){
      const record={fixtureRunId,action:body?.action,id:body?.data?.id,state:body?.data?.state,
        status:res.statusCode,key:req.headers["idempotency-key"]};
      appendFileSync(join(dir,"command-evidence.jsonl"),JSON.stringify(record)+"\n",{mode:0o600});
      const faultPath=join(dir,"fault-once.json");
      if(res.statusCode===200&&existsSync(faultPath)){
        const fault=JSON.parse(readFileSync(faultPath,"utf8"));
        if(fault.fixtureRunId===fixtureRunId&&["approve","withdrawal-state"].includes(fault.action)&&
          fault.action===body?.action&&fault.id===body?.data?.id&&
          (fault.state===undefined||fault.state===body?.data?.state)){
          unlinkSync(faultPath);
          // Ledger.command has already committed before Express calls end().
          writeFileSync(join(dir,"fault-consumed.json"),JSON.stringify({...record,
            response:JSON.parse(String(args[0])),phase:"after-commit-before-body-completion"}),{mode:0o600});
          res.flushHeaders();res.write("{");
          setImmediate(()=>res.destroy());
          return res;
        }
      }
    }
    return Reflect.apply(end,this,args);
  } as typeof res.end;
  app(req,res);
}).listen(4401,"127.0.0.1",()=>console.log(`Isolated developer service http://127.0.0.1:4401/developers/wallet-foundation; fixture ${fixtureRunId}; disposable credentials file: ${credentialPath}`));
for(const sig of ["SIGTERM","SIGINT"] as const)process.once(sig,()=>{server.closeAllConnections();server.close(()=>{ledger.close();metadata.close();rmSync(dir,{recursive:true,force:true});process.exit(0);});});
