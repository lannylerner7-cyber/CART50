import test from "node:test";
import assert from "node:assert/strict";
import {backup} from "node:sqlite";
import {mkdtempSync,rmSync,chmodSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Ledger,digest,type Principal} from "./ledger";

test("WAL snapshot restores unknown identity, reservation, idempotency and lease fencing",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"foundation-restore-"));
  const source=new Ledger(join(dir,"source.sqlite"));
  let restored:Ledger|undefined;
  const tenant="disposable-restore-tenant",scopes=["wallet:read","wallet:write","wallet:simulate"];
  const tokenHash=digest("disposable-restore-key");
  const epoch=source.beginCredentialChange(tenant),expires=Date.now()+60000;
  source.requireCredentialFence();source.activateCredential(tenant,epoch,tokenHash,expires,scopes);
  const p:Principal={tenant,role:"developer",scopes,credential:{epoch,hash:tokenHash}};
  const command=(key:string,action:string,data:Record<string,unknown>)=>source.command(p,key,action,data);
  try{
    const customer=command("restore-customer","customer",{});
    const wallet=command("restore-wallet","wallet",{customerId:customer.id});
    const batch=command("restore-batch","batch",{walletId:wallet.id,count:1});
    const deposit=command("restore-deposit","deposit",{assignmentId:batch.items[0].id,txid:"b".repeat(64),vout:1,amountSats:100000});
    command("restore-deposit-confirm","deposit-state",{id:deposit.id,state:"confirmed",confirmations:3});
    const review=command("restore-review","review",{walletId:wallet.id,destination:batch.items[0].destination,amountSats:10000,networkFeeSats:500});
    const approval=command("restore-approval","approve",{id:review.id,approved:true});
    const unknown=command("restore-unknown","withdrawal-state",{id:review.id,state:"unknown"});
    const lease=command("restore-lease","event-lease",{});
    const file=join(dir,"snapshot.sqlite");
    // SQLite online backup includes committed WAL content, unlike copying only
    // the main database file. This uses disposable local data, not hosted data.
    await backup(source.db,file);chmodSync(file,0o600);
    // Fence the old writer before exercising the restored copy. This drill
    // never starts two service endpoints or permits two active spending writers.
    source.beginCredentialChange(tenant);
    assert.throws(()=>source.command(p,"restore-old-writer","approve",{id:review.id,approved:true}),/revoked or changing/);
    restored=new Ledger(file);restored.requireCredentialFence();
    assert.equal(restored.db.prepare("PRAGMA integrity_check").get()?.integrity_check,"ok");
    assert.deepEqual(restored.balance(tenant,wallet.id),{available:89500,pending:0,reserved:10500});
    const record=restored.page(p,"withdrawal").items[0];
    assert.equal(record.status,"unknown");assert.equal(record.txid,unknown.txid);
    assert.equal(record.signedArtifact,unknown.signedArtifact);
    assert.deepEqual(restored.command(p,"restore-approval","approve",{id:review.id,approved:true}),approval);
    assert.deepEqual(restored.balance(tenant,wallet.id),{available:89500,pending:0,reserved:10500});
    assert.throws(()=>restored!.command(p,"restore-premature-release","withdrawal-state",{id:review.id,state:"failed"}),/potentially broadcast/);

    // Force ONLY the disposable lease's clock past its deadline; no wall-clock wait.
    restored.db.prepare("UPDATE foundation_entities SET data=json_set(data,'$.nextAt',0) WHERE id=?").run(lease.id);
    const reLeased=restored.command(p,"restore-new-lease","event-lease",{});
    assert.equal(reLeased.id,lease.id);assert.notEqual(reLeased.lease,lease.lease);
    assert.throws(()=>restored!.command(p,"restore-old-ack","event-ack",{id:lease.id,lease:lease.lease,delivered:true}),/expired or replaced/);
    restored.command(p,"restore-new-ack","event-ack",{id:lease.id,lease:reLeased.lease,delivered:true});

    const broadcast=restored.command(p,"restore-broadcast","withdrawal-state",{id:review.id,state:"broadcast"});
    assert.equal(broadcast.txid,unknown.txid);assert.equal(broadcast.signedArtifact,unknown.signedArtifact);
    restored.command(p,"restore-confirm","withdrawal-state",{id:review.id,state:"confirmed",confirmations:3,actualFeeSats:300});
    assert.deepEqual(restored.balance(tenant,wallet.id),{available:89700,pending:0,reserved:0});
    const unbalanced=restored.db.prepare("SELECT operation FROM foundation_postings GROUP BY operation HAVING SUM(delta)!=0").all();
    assert.deepEqual(unbalanced,[]);
    assert.throws(()=>restored!.db.exec("DELETE FROM foundation_postings"),/Immutable ledger/);
    assert.equal(restored.page(p,"withdrawal").items.length,1);
    // Restoring an older identity+ledger snapshot can resurrect old grants.
    // Before a restored service is exposed, explicitly fence its credentials
    // and require fresh passkey-authorized issuance; never silently reuse keys.
    restored.beginCredentialChange(tenant);
    assert.throws(()=>restored!.page(p,"withdrawal"),/revoked or changing/);
  }finally{restored?.close();source.close();rmSync(dir,{recursive:true,force:true});}
});
