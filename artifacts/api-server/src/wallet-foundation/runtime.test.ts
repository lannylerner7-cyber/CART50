import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomBytes,randomUUID} from "node:crypto";
import type {AddressInfo} from "node:net";
import {Ledger} from "./ledger";
import {localDeveloperStorage} from "../developers/local-storage";
import {independentDeveloperRuntime} from "./runtime";
import {createAccount,updateAccount,accountBy} from "../developers/store";
import {hash} from "../lib/security";
import {DEVELOPER_TERMS_VERSION} from "../developers/terms";

test("independent onboarding storage, scoped keys, fresh passkey rotation and owner boundary",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"wallet-identity-"));
  const ledger=new Ledger(join(dir,"ledger.sqlite")),storage=localDeveloperStorage(join(dir,"metadata.sqlite"));
  process.env.PUBLIC_ORIGIN="http://localhost";
  const app=independentDeveloperRuntime({ledger,storage,adminAccess:[],env:{FOUNDATION_LOCAL:"1",NODE_ENV:"test"},providers:{
    quote:()=>({available:true,stale:false,price:100000,updatedAt:new Date().toISOString(),source:"Fixture"}),
    send:async message=>({accepted:[message.to],rejected:[],response:"captured locally"})
  }});
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const authHeaders={"Content-Type":"application/json",Origin:"http://localhost"};
  try{
    const register=await fetch(base+"/api/developers/register",{method:"POST",headers:authHeaders,body:JSON.stringify({name:"Independent",email:"new@example.invalid",termsVersion:DEVELOPER_TERMS_VERSION,accepted:true})});
    assert.equal(register.status,200);
    assert.ok(await accountBy("email","new@example.invalid"));
    const a=await createAccount("A","a@example.invalid","fixture"),b=await createAccount("B","b@example.invalid","fixture");
    assert.ok(a&&b);
    const secret=randomBytes(32).toString("base64url"),csrf=randomBytes(32).toString("base64url");
    await updateAccount(a.id,current=>{
      current.verified=true;current.provisioning="ready";
      current.passkeys=[{id:randomUUID(),name:"Fixture marker",createdAt:new Date().toISOString(),publicKey:"",counter:0}];
      current.sessions=[{hash:hash(secret),csrf,expires:Date.now()+60000,level:"full",passkeyAt:Date.now()}];
    });
    const headers={...authHeaders,Cookie:`__Host-developer_session=${a.id}.${secret}`,"x-developer-csrf":csrf};
    const issue=async(scopes:string[],revoke=false)=>
      fetch(base+"/api/developer-wallet/key",{method:"POST",headers,body:JSON.stringify({scopes,revoke})});
    const issued=await issue(["wallet:read"]);assert.equal(issued.status,200);
    const first=(await issued.json() as {key:string}).key;
    const get=(key:string)=>fetch(base+"/api/wallet-foundation/view?kind=wallet",{headers:{Authorization:"Bearer "+key}});
    assert.equal((await get(first)).status,200);
    const write=(key:string,data:unknown)=>fetch(base+"/api/wallet-foundation/commands",{method:"POST",headers:{...authHeaders,Authorization:"Bearer "+key,"Idempotency-Key":randomUUID()},body:JSON.stringify(data)});
    assert.equal((await write(first,{action:"customer",data:{label:"Denied"}})).status,403);
    assert.equal((await issue(["wallet:write"])).status,403);
    await updateAccount(a.id,current=>{current.sessions[0].passkeyAt=Date.now();});
    const rotated=await issue(["wallet:read","wallet:write"]);assert.equal(rotated.status,200);
    const second=(await rotated.json() as {key:string}).key;assert.equal((await get(first)).status,401);
    const created=await write(second,{action:"customer",data:{label:"Allowed"}});assert.equal(created.status,200);
    assert.equal(ledger.page({tenant:b.id,role:"admin",scopes:["wallet:read"]},"customer").items.length,0);
    await updateAccount(a.id,current=>{current.sessions[0].passkeyAt=Date.now();});
    assert.equal((await issue(["wallet:read"],true)).status,200);
    assert.equal((await get(second)).status,401);
    const tables=await storage.query("SELECT name FROM sqlite_schema WHERE type='table'");
    assert.ok(tables.every(x=>String(x.name).startsWith("developer_")));
    await assert.rejects(()=>storage.query("SELECT * FROM vault_state"),/outside/);
    assert.equal((await fetch(base+"/api/vault/session",{headers:{Authorization:"Bearer "+second}})).status,404);
    assert.equal((await fetch(base+"/api/admin/developers",{headers})).status,404);
  }finally{
    server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));ledger.close();storage.close();rmSync(dir,{recursive:true,force:true});
  }
});
