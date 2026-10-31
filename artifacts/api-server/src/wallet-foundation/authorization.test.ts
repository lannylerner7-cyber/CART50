import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {Ledger,digest,LedgerError,type Principal} from "./ledger";

test("financial fence rejects stale principals and replay after independent-process revocation",()=>{
  const dir=mkdtempSync(join(tmpdir(),"foundation-fence-")),file=join(dir,"ledger.sqlite");
  const ledger=new Ledger(file),other=new Ledger(file);
  ledger.requireCredentialFence();other.requireCredentialFence();
  const tenant="disposable-tenant",scopes=["wallet:read","wallet:write","wallet:simulate"];
  const tokenHash=digest("disposable-test-hash-input");
  const epoch=ledger.beginCredentialChange(tenant),expires=Date.now()+60000;
  ledger.activateCredential(tenant,epoch,tokenHash,expires,scopes);
  const stale:Principal={tenant,role:"developer",scopes,credential:{epoch,hash:tokenHash}};
  const denied=(fn:()=>unknown)=>assert.throws(fn,(e:unknown)=>e instanceof LedgerError&&e.status===401);
  try{
    const customer=ledger.command(stale,"customer-before-fence","customer",{label:"Disposable"});
    const wallet=ledger.command(stale,"wallet-before-fence","wallet",{customerId:customer.id});
    const batch=ledger.command(stale,"batch-before-fence","batch",{walletId:wallet.id,count:1});
    const dep=ledger.command(stale,"deposit-before-fence","deposit",{assignmentId:batch.items[0].id,txid:"a".repeat(64),vout:0,amountSats:100000});
    ledger.command(stale,"confirm-before-fence","deposit-state",{id:dep.id,state:"confirmed",confirmations:3});
    const review=ledger.command(stale,"review-before-fence","review",{walletId:wallet.id,destination:batch.items[0].destination,amountSats:10000,networkFeeSats:500});
    // A separate process commits the same invalidation primitive while this
    // instance still holds the previously resolved request principal.
    const child=spawnSync(process.execPath,["--input-type=module","-e",`
      import {DatabaseSync} from 'node:sqlite';
      const db=new DatabaseSync(process.env.FENCE_TEST_DB);
      db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
      db.prepare("UPDATE foundation_authorization SET epoch=epoch+1,token_hash=NULL,expires=0,scopes='[]' WHERE tenant=?").run('disposable-tenant');
      db.exec('COMMIT');db.close();
    `],{env:{PATH:process.env.PATH,FENCE_TEST_DB:file},encoding:"utf8"});
    assert.equal(child.status,0,child.stderr);
    denied(()=>ledger.command(stale,"approve-after-fence","approve",{id:review.id,approved:true}));
    denied(()=>ledger.command(stale,"customer-before-fence","customer",{label:"Disposable"}));
    denied(()=>ledger.page(stale,"wallet"));
    assert.deepEqual(ledger.balance(tenant,wallet.id),{available:100000,pending:0,reserved:0});

    // Crash between invalidation and metadata/activation remains fail-closed.
    const interrupted=other.beginCredentialChange(tenant);
    denied(()=>ledger.command({...stale,credential:{epoch:interrupted,hash:tokenHash}},"crash-after-fence","approve",{id:review.id,approved:true}));
    const newer=other.beginCredentialChange(tenant);
    assert.throws(()=>ledger.activateCredential(tenant,interrupted,tokenHash,expires,scopes),/superseded/);
    other.activateCredential(tenant,newer,tokenHash,expires,scopes);
    const fresh={...stale,credential:{epoch:newer,hash:tokenHash}};
    const approved=ledger.command(fresh,"approve-fresh-fence","approve",{id:review.id,approved:true});
    assert.equal(approved.status,"reserved");
    assert.deepEqual(ledger.balance(tenant,wallet.id),{available:89500,pending:0,reserved:10500});
    assert.throws(()=>ledger.command({...fresh,scopes:[...scopes,"wallet:fees"]},"scope-after-fence","fee",{fixedSats:1,bps:0}),/scope exceeds/);
    // Emergency admin control is independent of the disabled developer grant.
    other.beginCredentialChange(tenant);
    ledger.command({tenant,role:"admin",scopes:[]},"emergency-admin-fence","control",{status:"revoked",reason:"Disposable emergency control"});
    assert.equal(ledger.page({tenant,role:"admin",scopes:[]},"wallet").control.status,"revoked");
  }finally{ledger.close();other.close();rmSync(dir,{recursive:true,force:true});}
});
