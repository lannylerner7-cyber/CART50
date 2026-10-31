import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {AddressInfo} from "node:net";
import {Ledger,digest} from "./ledger";
import {foundationApp} from "./service";

test("verified emergency admin bypasses exhausted shared-IP ingress without trusting forwarded identity",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"foundation-emergency-")),ledger=new Ledger(join(dir,"ledger.sqlite"));
  const token=randomUUID(),tenant=randomUUID();
  const app=foundationApp(ledger,[{tokenHash:digest(token),principal:{tenant,role:"admin",scopes:[]},expires:Date.now()+60000}],
    {FOUNDATION_LOCAL:"1",NODE_ENV:"test"});
  const server=app.listen(0,"127.0.0.1");
  await new Promise<void>(resolve=>server.once("listening",resolve));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request=(key:string)=>fetch(base+"/api/wallet-foundation/commands",{method:"POST",headers:{
    Authorization:"Bearer "+key,"Content-Type":"application/json","Idempotency-Key":randomUUID(),
    "X-Forwarded-For":"different-untrusted-client","X-Admin":"true",
  },body:JSON.stringify({action:"control",data:{status:"revoked",reason:"Disposable emergency"}})});
  try{
    for(let i=0;i<600;i++)ledger.budget("ingress:127.0.0.1",600);
    assert.equal((await request("not-an-admin")).status,429);
    assert.equal((await request(token)).status,200);
    assert.equal(ledger.page({tenant,role:"admin",scopes:[]},"audit").control.status,"revoked");
    // A forged admin header never gains the privileged lane.
    assert.equal((await request("still-not-an-admin")).status,429);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));ledger.close();rmSync(dir,{recursive:true,force:true});}
});
