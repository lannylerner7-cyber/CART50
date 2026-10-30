import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {backup} from "node:sqlite";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
import type {AddressInfo} from "node:net";
import {digest} from "./ledger";
import {Ledger,type Principal} from "./ledger";
import {assertIsolatedEnvironment,foundationApp} from "./service";
const a:Principal={tenant:"a",role:"developer",scopes:["wallet:read","wallet:write","wallet:simulate","wallet:fees"]};
const b:Principal={...a,tenant:"b"};
const admin:Principal={tenant:"a",role:"admin",scopes:["wallet:read"]};
function harness(){
  const dir=mkdtempSync(join(tmpdir(),"foundation-test-")),file=join(dir,"ledger.sqlite"),l=new Ledger(file);
  const cmd=(action:string,data:Record<string,unknown>,p=a,key=randomUUID())=>l.command(p,key,action,data);
  const c=cmd("customer",{label:"Customer"}),w=cmd("wallet",{customerId:c.id,label:"Wallet"});
  const assignment=cmd("batch",{walletId:w.id,count:1}).items[0];
  const deposit=(n=100000)=>cmd("deposit",{assignmentId:assignment.id,txid:"a".repeat(32)+randomUUID().replaceAll("-",""),vout:0,amountSats:n});
  const fund=(n=100000)=>{const d=deposit(n);cmd("deposit-state",{id:d.id,state:"confirmed",confirmations:3});return d;};
  const review=(n=10000)=>cmd("review",{walletId:w.id,destination:assignment.destination,amountSats:n,networkFeeSats:500});
  return {dir,file,l,cmd,c,w,assignment,deposit,fund,review,close:()=>{l.close();rmSync(dir,{recursive:true,force:true});}};
}
test("wallet batches create zero credit; retries reconcile and ownership/scopes fail closed",()=>{
  const h=harness();try{
    assert.deepEqual(h.l.balance("a",h.w.id),{available:0,pending:0,reserved:0});
    const id=randomUUID(),r=h.cmd("batch",{walletId:h.w.id,count:100},a,id);
    assert.equal(new Set(r.items.map((x:any)=>x.destination)).size,100);
    assert.deepEqual(h.cmd("batch",{walletId:h.w.id,count:100},a,id),r);
    assert.throws(()=>h.cmd("batch",{walletId:h.w.id,count:99},a,id),/conflicts/);
    assert.throws(()=>h.cmd("batch",{walletId:h.w.id,count:101}),/1–100/);
    assert.throws(()=>h.cmd("batch",{walletId:h.w.id,count:1},b),/not found/);
    assert.throws(()=>h.cmd("customer",{},admin),/cannot move funds/);
    assert.throws(()=>h.cmd("deposit",{}, {...a,scopes:["wallet:write"]}),/Simulation scope/);
    const page=h.l.page(a,"assignment");assert.equal(page.items.length,50);assert.ok(page.nextCursor);
    assert.equal(h.l.page(a,"assignment",page.nextCursor!).items.length,50);
  }finally{h.close();}
});
test("deposits deduplicate outputs, confirm once, reverse explicitly and freeze deficits",()=>{
  const h=harness();try{
    const d=h.deposit();assert.equal(h.l.balance("a",h.w.id).pending,100000);
    assert.throws(()=>h.cmd("deposit",{assignmentId:h.assignment.id,txid:d.output.split(":")[0],vout:0,amountSats:1}),/already observed/);
    assert.throws(()=>h.cmd("deposit-state",{id:d.id,state:"confirmed",confirmations:2}),/Three confirmations/);
    h.cmd("deposit-state",{id:d.id,state:"confirmed",confirmations:3});
    h.cmd("deposit-state",{id:d.id,state:"confirmed",confirmations:3});
    assert.equal(h.l.balance("a",h.w.id).available,100000);
    const w2=h.cmd("wallet",{customerId:h.c.id});
    h.cmd("transfer",{from:h.w.id,to:w2.id,amountSats:100000});
    h.cmd("deposit-state",{id:d.id,state:"reversed"});
    assert.equal(h.l.balance("a",h.w.id).available,-100000);
    assert.equal(h.l.page(admin,"wallet").control.status,"frozen");
    assert.throws(()=>h.cmd("transfer",{from:w2.id,to:h.w.id,amountSats:1}),/disabled/);
    assert.equal(Number(h.l.db.prepare("SELECT SUM(delta) AS n FROM foundation_postings").get()?.n),0);
    assert.throws(()=>h.l.db.exec("DELETE FROM foundation_postings"),/Immutable/);
  }finally{h.close();}
});
test("review expiry, explicit approval, fee snapshot and unknown-broadcast recovery",()=>{
  const h=harness();try{
    h.fund();h.cmd("fee",{fixedSats:100,bps:100});const r=h.review();
    assert.equal(r.developerFeeSats,200);
    h.cmd("fee",{fixedSats:999,bps:0});
    assert.throws(()=>h.cmd("approve",{id:r.id,approved:false}),/Explicit approval/);
    const k=randomUUID(),reserved=h.cmd("approve",{id:r.id,approved:true},a,k);
    assert.equal(reserved.developerFeeSats,200);
    assert.deepEqual(h.cmd("approve",{id:r.id,approved:true},a,k),reserved);
    assert.throws(()=>h.cmd("approve",{id:r.id,approved:true}),/not approvable/);
    const unknown=h.cmd("withdrawal-state",{id:r.id,state:"unknown"});
    assert.ok(unknown.signedArtifact&&unknown.txid);
    assert.throws(()=>h.cmd("withdrawal-state",{id:r.id,state:"failed"}),/potentially broadcast/);
    const broadcast=h.cmd("withdrawal-state",{id:r.id,state:"broadcast"});
    assert.equal(broadcast.txid,unknown.txid);
    assert.throws(()=>h.cmd("withdrawal-state",{id:r.id,state:"confirmed",confirmations:3,actualFeeSats:501}),/exceeds approval/);
    h.cmd("withdrawal-state",{id:r.id,state:"confirmed",confirmations:3,actualFeeSats:300});
    assert.deepEqual(h.l.balance("a",h.w.id),{available:89500,pending:0,reserved:0});
    const expired=h.review(10);
    h.l.db.prepare("UPDATE foundation_entities SET data=json_set(data,'$.expiresAt',?) WHERE id=?").run("2000-01-01T00:00:00Z",expired.id);
    assert.throws(()=>h.cmd("approve",{id:expired.id,approved:true}),/expired/);
  }finally{h.close();}
});
test("outbox commits with journal, leases reject stale acknowledgements and retries retain event IDs",()=>{
  const h=harness();try{
    h.fund();const lease=h.cmd("event-lease",{});
    assert.equal(lease.attempts,1);
    assert.throws(()=>h.cmd("event-ack",{id:lease.id,lease:"wrong",delivered:true}),/Lease/);
    h.cmd("event-ack",{id:lease.id,lease:lease.lease,delivered:false});
    h.l.db.prepare("UPDATE foundation_entities SET data=json_set(data,'$.nextAt',0) WHERE id=?").run(lease.id);
    const again=h.cmd("event-lease",{});assert.equal(again.id,lease.id);assert.notEqual(again.lease,lease.lease);
    h.cmd("event-ack",{id:again.id,lease:again.lease,delivered:true});
    assert.equal(h.l.page(a,"event").items[0].status,"delivered");
  }finally{h.close();}
});
test("database outage blocks operations; emergency control independent of tenant budgets; backup restores journal",async()=>{
  const h=harness();try{
    h.fund();
    for(let i=0;i<3;i++)h.l.budget("a:developer",3);
    assert.throws(()=>h.l.budget("a:developer",3),/budget/);
    h.cmd("control",{status:"suspended",reason:"Emergency"},admin);
    assert.throws(()=>h.l.page(a,"wallet"),/suspended/);
    h.cmd("control",{status:"active",reason:"Reviewed",liveApproved:true},admin);
    assert.equal(h.l.page(a,"wallet").liveEnabled,false);
    const copy=join(h.dir,"backup.sqlite");await backup(h.l.db,copy);
    const restored=new Ledger(copy);
    assert.deepEqual(restored.balance("a",h.w.id),h.l.balance("a",h.w.id));restored.close();
    const second=new Ledger(h.file);second.db.exec("BEGIN IMMEDIATE");
    h.l.db.exec("PRAGMA busy_timeout=1");
    assert.throws(()=>h.cmd("customer",{}),/locked/);second.db.exec("ROLLBACK");second.close();
    assertIsolatedEnvironment({FOUNDATION_LOCAL:"1",NODE_ENV:"development"});
    assert.throws(()=>assertIsolatedEnvironment({FOUNDATION_LOCAL:"1",VAULT_ENGINE_TOKEN:"disposable"}),/Refusing/);
    assert.throws(()=>assertIsolatedEnvironment({FOUNDATION_LOCAL:"1",NODE_ENV:"production"}),/local-only/);
  }finally{h.close();}
});
test("two independent processes cannot reserve the same availability twice",async()=>{
  const h=harness();try{
    h.fund();const one=h.review(80000),two=h.review(80000);
    const run=(id:string)=>promisify(execFile)(process.execPath,["--import","tsx",fileURLToPath(new URL("./race-worker.ts",import.meta.url)),h.file,id,randomUUID()]);
    const results=await Promise.all([run(one.id),run(two.id)]);
    assert.deepEqual(results.map(r=>r.stdout).sort(),["rejected","reserved"]);
    assert.deepEqual(h.l.balance("a",h.w.id),{available:19500,reserved:80500,pending:0});
  }finally{h.close();}
});
test("HTTP credentials expire, tenant input cannot override principal, owner routes absent and failures close access",async()=>{
  const h=harness();
  const access=[{tokenHash:digest("local-a"),principal:a,expires:Date.now()+60000},{tokenHash:digest("local-b"),principal:b,expires:Date.now()+60000}];
  const app=foundationApp(h.l,access,{FOUNDATION_LOCAL:"1",NODE_ENV:"development"}),server=app.listen(0,"127.0.0.1");
  await new Promise<void>(r=>server.once("listening",r));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try{
    assert.equal((await fetch(base+"/api/vault/wallets",{headers:{Authorization:"Bearer local-a"}})).status,404);
    assert.equal((await fetch(base+"/api/wallet-foundation/view?kind=wallet")).status,401);
    const response=await fetch(base+"/api/wallet-foundation/commands",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer local-b","Idempotency-Key":randomUUID()},body:JSON.stringify({action:"batch",data:{tenant:"a",walletId:h.w.id,count:1}})});
    assert.equal(response.status,400);
    access[0].expires=0;
    assert.equal((await fetch(base+"/api/wallet-foundation/view?kind=wallet",{headers:{Authorization:"Bearer local-a"}})).status,401);
    h.cmd("control",{status:"revoked",reason:"Credential compromise"},admin);
    assert.throws(()=>h.cmd("control",{status:"active",reason:"Accidental reactivation"},admin),/cannot be reactivated/);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));h.close();}
});
